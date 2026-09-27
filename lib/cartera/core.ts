import crypto from "node:crypto";
import type { OrigenCuota, Prisma, TipoConcepto } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { nextConsecutivo } from "@/lib/consecutivo";
import { toNumber, diffDays, mesNombre } from "@/lib/format";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { descuentoProntoPago, distribuirPago, ordenarParaAplicacion, rangoMora, round, RANGOS_MORA, type OrdenAplicacion } from "./calculos";

/**
 * Núcleo de cartera: cargos (cuotas), saldos y aplicación de pagos.
 * Lo usan cartera, pagos en línea, reservas, multas, cuotas extraordinarias y la apertura.
 */

function hash6(conjuntoId: string) {
  return String(parseInt(crypto.createHash("md5").update(conjuntoId).digest("hex").slice(0, 8), 16) % 1_000_000).padStart(6, "0");
}

/** Referencia de pago numérica única (para PSE / convenio bancario / conciliación). */
export async function generarReferenciaPago(conjuntoId: string) {
  const seq = await nextConsecutivo(conjuntoId, "REFERENCIA");
  return `${hash6(conjuntoId)}${String(seq).padStart(8, "0")}`;
}

export async function conceptoPorTipo(ctx: Pick<Ctx, "db">, tipo: TipoConcepto) {
  const c = await ctx.db.conceptoCobro.findFirst({ where: { tipo, activo: true }, orderBy: { createdAt: "asc" } });
  if (!c) throw new AppError(`No existe un concepto de cobro activo de tipo ${tipo}.`);
  return c;
}

export type CargoInput = {
  unidadId: string;
  conceptoId?: string;
  conceptoTipo?: TipoConcepto;
  valorBase: number;
  iva?: number;
  descripcion?: string;
  periodo?: string;
  fechaEmision?: Date;
  fechaVencimiento: Date;
  fechaProntoPago?: Date | null;
  porcentajeProntoPago?: number;
  origen: OrigenCuota;
  cuotaExtraordinariaId?: string | null;
  cuotaOrigenId?: string | null;
  acuerdoId?: string | null;
};

/** Crea un cargo (Cuota) en la cuenta de la unidad y su movimiento débito en el libro auxiliar. */
export async function crearCargo(ctx: Pick<Ctx, "db" | "conjuntoId">, input: CargoInput) {
  if (input.valorBase <= 0) throw new AppError("El valor del cargo debe ser mayor a cero.");
  const concepto = input.conceptoId ? await ctx.db.conceptoCobro.findUnique({ where: { id: input.conceptoId } }) : await conceptoPorTipo(ctx, input.conceptoTipo ?? "OTRO");
  if (!concepto) notFound("El concepto de cobro");
  const emision = input.fechaEmision ?? new Date();
  const periodo = input.periodo ?? `${emision.getFullYear()}-${String(emision.getMonth() + 1).padStart(2, "0")}`;
  const iva = round(input.iva ?? 0);
  const total = round(input.valorBase) + iva;
  const referenciaPago = await generarReferenciaPago(ctx.conjuntoId);
  const cuota = await ctx.db.cuota.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      conceptoId: concepto.id,
      periodo,
      descripcion: input.descripcion ?? `${concepto.nombre} ${mesNombre(periodo)}`,
      fechaEmision: emision,
      fechaVencimiento: input.fechaVencimiento,
      fechaProntoPago: input.fechaProntoPago ?? null,
      porcentajeProntoPago: input.porcentajeProntoPago ?? 0,
      valorBase: round(input.valorBase),
      iva,
      saldo: total,
      referenciaPago,
      origen: input.origen,
      cuotaExtraordinariaId: input.cuotaExtraordinariaId ?? null,
      cuotaOrigenId: input.cuotaOrigenId ?? null,
      acuerdoId: input.acuerdoId ?? null,
    },
  });
  await ctx.db.movimientoCartera.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      fecha: emision,
      tipo: "DEBITO",
      valor: total,
      conceptoTipo: concepto.tipo,
      cuotaId: cuota.id,
      descripcion: cuota.descripcion ?? concepto.nombre,
    },
  });
  return cuota;
}

/** Anula un cargo sin pagos aplicados (con movimiento crédito de reversión). */
export async function anularCargo(ctx: Ctx, cuotaId: string, motivo: string) {
  const c = await ctx.db.cuota.findUnique({ where: { id: cuotaId }, include: { aplicaciones: { where: { deletedAt: null } } } });
  if (!c) notFound("La cuota");
  if (c.aplicaciones.length > 0) throw new AppError("La cuota tiene pagos aplicados; anula primero el pago.");
  if (c.estado === "ANULADA") return c;
  const saldo = toNumber(c.saldo);
  const u = await ctx.db.cuota.update({ where: { id: cuotaId }, data: { estado: "ANULADA", saldo: 0 } });
  if (saldo > 0) {
    await ctx.db.movimientoCartera.create({
      data: { conjuntoId: ctx.conjuntoId, unidadId: c.unidadId, tipo: "CREDITO", valor: saldo, cuotaId, descripcion: `Anulación: ${c.descripcion ?? ""} — ${motivo}` },
    });
  }
  await audit(ctx, "anular", "Cuota", cuotaId, c, { motivo });
  return u;
}

export type SaldoUnidad = {
  total: number;
  vencido: number;
  porVencer: number;
  saldoAFavor: number;
  neto: number;
  diasMoraMax: number;
  aging: Record<(typeof RANGOS_MORA)[number], number>;
  porConcepto: { tipo: string; nombre: string; saldo: number }[];
  cuotas: { id: string; descripcion: string; periodo: string; tipo: string; fechaVencimiento: Date; saldo: number; valorTotal: number; referenciaPago: string; estado: string; diasMora: number; fechaProntoPago: Date | null; porcentajeProntoPago: number; valorBase: number }[];
};

/** Saldo pendiente de una unidad con detalle por concepto y edad de mora. */
export async function saldoUnidad(ctx: Pick<Ctx, "db">, unidadId: string, hoy = new Date()): Promise<SaldoUnidad> {
  const [cuotas, pagos, aplicado] = await Promise.all([
    ctx.db.cuota.findMany({
      where: { unidadId, estado: { in: ["PENDIENTE", "PARCIAL", "EN_ACUERDO"] }, saldo: { gt: 0 } }, // EN_ACUERDO con saldo 0 = trasladada a un acuerdo
      include: { concepto: true },
      orderBy: { fechaVencimiento: "asc" },
    }),
    ctx.db.pago.aggregate({ where: { unidadId, estado: "APROBADO" }, _sum: { valor: true } }),
    ctx.db.aplicacionPago.aggregate({ where: { pago: { unidadId, estado: "APROBADO" }, deletedAt: null }, _sum: { valor: true } }),
  ]);
  const aging = Object.fromEntries(RANGOS_MORA.map((r) => [r, 0])) as SaldoUnidad["aging"];
  const porConcepto = new Map<string, { tipo: string; nombre: string; saldo: number }>();
  let total = 0;
  let vencido = 0;
  let diasMoraMax = 0;
  const detalle = cuotas.map((c) => {
    const saldo = toNumber(c.saldo);
    const dias = Math.max(0, diffDays(hoy, c.fechaVencimiento));
    total += saldo;
    if (dias > 0) {
      vencido += saldo;
      diasMoraMax = Math.max(diasMoraMax, dias);
    }
    aging[rangoMora(dias)] += saldo;
    const k = c.concepto.tipo;
    const pc = porConcepto.get(k) ?? { tipo: k, nombre: c.concepto.nombre, saldo: 0 };
    pc.saldo += saldo;
    porConcepto.set(k, pc);
    return {
      id: c.id,
      descripcion: c.descripcion ?? c.concepto.nombre,
      periodo: c.periodo,
      tipo: c.concepto.tipo,
      fechaVencimiento: c.fechaVencimiento,
      saldo,
      valorTotal: toNumber(c.valorBase) + toNumber(c.iva),
      referenciaPago: c.referenciaPago,
      estado: c.estado,
      diasMora: dias,
      fechaProntoPago: c.fechaProntoPago,
      porcentajeProntoPago: toNumber(c.porcentajeProntoPago),
      valorBase: toNumber(c.valorBase),
    };
  });
  const saldoAFavor = Math.max(0, round(toNumber(pagos._sum.valor) - toNumber(aplicado._sum.valor)));
  return { total: round(total), vencido: round(vencido), porVencer: round(total - vencido), saldoAFavor, neto: round(total - saldoAFavor), diasMoraMax, aging, porConcepto: [...porConcepto.values()], cuotas: detalle };
}

/** ¿La unidad está al día? (saldo vencido menor al mínimo configurado). */
export async function unidadAlDia(ctx: Pick<Ctx, "db" | "conjunto">, unidadId: string) {
  const cfg = conjuntoConfig(ctx);
  const s = await saldoUnidad(ctx, unidadId);
  return { alDia: s.vencido - s.saldoAFavor <= cfg.bloqueoMora.montoMinimo, saldo: s };
}

/**
 * Aplica un pago APROBADO a las cuotas de la unidad según el orden configurado. Si el pago trae
 * cuotas seleccionadas, primero se aplican esas. Calcula descuento de pronto pago. Genera número de
 * recibo, movimientos crédito y emite `pago.aprobado`. Idempotente: si ya fue aplicado, no hace nada.
 */
export async function aplicarPago(ctx: Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre"> & Partial<Ctx>, pagoId: string) {
  const pago = await ctx.db.pago.findUnique({ where: { id: pagoId }, include: { aplicaciones: { where: { deletedAt: null } } } });
  if (!pago) notFound("El pago");
  if (pago.estado !== "APROBADO") throw new AppError("Solo se aplican pagos aprobados.");
  if (pago.aplicaciones.length > 0 || pago.numeroRecibo) return pago;
  const cfg = conjuntoConfig(ctx as Ctx);
  const cuotas = await ctx.db.cuota.findMany({
    where: { unidadId: pago.unidadId, estado: { in: ["PENDIENTE", "PARCIAL", "EN_ACUERDO"] } },
    include: { concepto: true },
  });
  const seleccion = new Set(pago.cuotasSeleccionadas);
  const base = cuotas.map((c) => ({ id: c.id, saldo: toNumber(c.saldo), tipoConcepto: c.concepto.tipo, fechaVencimiento: c.fechaVencimiento, periodo: c.periodo, c }));
  const ordenadas = [
    ...ordenarParaAplicacion(base.filter((b) => seleccion.has(b.id)), cfg.cartera.ordenAplicacion as OrdenAplicacion[], pago.fecha),
    ...ordenarParaAplicacion(base.filter((b) => !seleccion.has(b.id)), cfg.cartera.ordenAplicacion as OrdenAplicacion[], pago.fecha),
  ];
  // Descuento de pronto pago: reduce el saldo de la cuota de administración si se paga completa a tiempo.
  let disponible = toNumber(pago.valor);
  for (const o of ordenadas) {
    if (disponible <= 0) break;
    const desc =
      o.tipoConcepto === "ADMINISTRACION" && toNumber(o.c.descuento) === 0 && o.saldo === toNumber(o.c.valorBase) + toNumber(o.c.iva)
        ? descuentoProntoPago({ valorBase: toNumber(o.c.valorBase), porcentajeProntoPago: toNumber(o.c.porcentajeProntoPago), fechaProntoPago: o.c.fechaProntoPago }, pago.fecha)
        : 0;
    if (desc > 0 && disponible >= o.saldo - desc) {
      await ctx.db.cuota.update({ where: { id: o.id }, data: { descuento: desc, saldo: { decrement: desc } } });
      await ctx.db.movimientoCartera.create({
        data: { conjuntoId: ctx.conjuntoId, unidadId: pago.unidadId, fecha: pago.fecha, tipo: "CREDITO", valor: desc, conceptoTipo: "ADMINISTRACION", cuotaId: o.id, pagoId: pago.id, descripcion: `Descuento pronto pago ${o.periodo}` },
      });
      o.saldo -= desc;
    }
    disponible -= o.saldo;
  }
  const { aplicaciones, excedente } = distribuirPago(toNumber(pago.valor), ordenadas);
  for (const a of aplicaciones) {
    const o = ordenadas.find((x) => x.id === a.cuotaId)!;
    const nuevoSaldo = round(o.saldo - a.valor);
    await ctx.db.aplicacionPago.create({ data: { conjuntoId: ctx.conjuntoId, pagoId: pago.id, cuotaId: a.cuotaId, valor: a.valor } });
    await ctx.db.cuota.update({ where: { id: a.cuotaId }, data: { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? "PAGADA" : o.c.estado === "EN_ACUERDO" ? "EN_ACUERDO" : "PARCIAL" } });
  }
  const numeroRecibo = await nextConsecutivo(ctx.conjuntoId, "RECIBO");
  await ctx.db.movimientoCartera.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: pago.unidadId,
      fecha: pago.fecha,
      tipo: "CREDITO",
      valor: pago.valor,
      pagoId: pago.id,
      descripcion: `Pago recibo N.º ${numeroRecibo} (${pago.medio.toLowerCase()})${excedente > 0 ? ` — saldo a favor ${excedente}` : ""}`,
    },
  });
  const actualizado = await ctx.db.pago.update({ where: { id: pago.id }, data: { numeroRecibo } });
  // Multas pagadas quedan en estado PAGADA
  const pagadas = aplicaciones.map((a) => a.cuotaId);
  await ctx.db.multa.updateMany({ where: { cuotaId: { in: pagadas }, estado: "RATIFICADA" }, data: { estado: "PAGADA" } }).catch(() => undefined);
  await audit(ctx as Ctx, "aplicar_pago", "Pago", pago.id, undefined, { aplicaciones, excedente, numeroRecibo });
  await emit({ tipo: "pago.aprobado", conjuntoId: ctx.conjuntoId, data: { id: pago.id, pagoId: pago.id, unidadId: pago.unidadId, valor: toNumber(pago.valor), reservaId: pago.reservaId, cuotaIds: pagadas, numeroRecibo }, actorId: ctx.userId });
  return actualizado;
}

/** Aplica saldos a favor existentes a cuotas nuevas (se ejecuta tras generar cuotas). */
export async function aplicarSaldosAFavor(ctx: Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">, unidadId: string) {
  const s = await saldoUnidad(ctx, unidadId);
  if (s.saldoAFavor <= 0 || s.total <= 0) return 0;
  const pagos = await ctx.db.pago.findMany({ where: { unidadId, estado: "APROBADO" }, include: { aplicaciones: { where: { deletedAt: null } } }, orderBy: { fecha: "asc" } });
  const cuotas = ordenarParaAplicacion(
    s.cuotas.map((c) => ({ id: c.id, saldo: c.saldo, tipoConcepto: c.tipo, fechaVencimiento: c.fechaVencimiento, periodo: c.periodo })),
    conjuntoConfig(ctx as Ctx).cartera.ordenAplicacion as OrdenAplicacion[],
  );
  let aplicado = 0;
  for (const p of pagos) {
    let libre = round(toNumber(p.valor) - p.aplicaciones.reduce((a, x) => a + toNumber(x.valor), 0));
    for (const c of cuotas) {
      if (libre <= 0) break;
      if (c.saldo <= 0) continue;
      const v = Math.min(libre, c.saldo);
      await ctx.db.aplicacionPago.create({ data: { conjuntoId: ctx.conjuntoId, pagoId: p.id, cuotaId: c.id, valor: v } });
      c.saldo = round(c.saldo - v);
      await ctx.db.cuota.update({ where: { id: c.id }, data: { saldo: c.saldo, estado: c.saldo <= 0 ? "PAGADA" : "PARCIAL" } });
      libre -= v;
      aplicado += v;
    }
  }
  return aplicado;
}

export type RegistrarPagoInput = {
  unidadId: string;
  valor: number;
  fecha?: Date;
  medio: Prisma.PagoCreateInput["medio"];
  pasarela?: Prisma.PagoCreateInput["pasarela"];
  referenciaExterna?: string | null;
  comprobanteUrl?: string | null;
  observaciones?: string | null;
  cuotasSeleccionadas?: string[];
  estado?: "PENDIENTE" | "APROBADO";
  reservaId?: string | null;
  pagadorNombre?: string | null;
  pagadorEmail?: string | null;
};

/** Crea un pago. Si llega APROBADO (pago manual), se aplica de inmediato. */
export async function registrarPago(ctx: Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre"> & Partial<Ctx>, input: RegistrarPagoInput) {
  if (input.valor <= 0) throw new AppError("El valor del pago debe ser mayor a cero.");
  const referencia = `P${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const pago = await ctx.db.pago.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      valor: round(input.valor),
      fecha: input.fecha ?? new Date(),
      medio: input.medio,
      pasarela: input.pasarela ?? "NINGUNA",
      referencia,
      referenciaExterna: input.referenciaExterna,
      comprobanteUrl: input.comprobanteUrl,
      observaciones: input.observaciones,
      cuotasSeleccionadas: input.cuotasSeleccionadas ?? [],
      estado: input.estado ?? "APROBADO",
      registradoPorId: ctx.userId === "sistema" ? null : ctx.userId,
      reservaId: input.reservaId ?? null,
      pagadorNombre: input.pagadorNombre,
      pagadorEmail: input.pagadorEmail,
    },
  });
  await audit(ctx as Ctx, "registrar_pago", "Pago", pago.id, undefined, pago);
  if (pago.estado === "APROBADO") return aplicarPago(ctx, pago.id);
  return pago;
}

/** Referencia para prisma directo (jobs/seed) cuando no hay ctx completo. */
export { prisma as _prisma };
