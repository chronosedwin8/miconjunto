import type { EstadoAcuerdo } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify, usuariosConPermiso, usuariosDeUnidad } from "@/lib/notificaciones";
import { cop, diffDays, periodoActual, toNumber } from "@/lib/format";
import { aplicarSaldosAFavor, crearCargo, saldoUnidad } from "./core";
import { planAcuerdo, round, sumarMeses } from "./calculos";

type ACtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">;

/** Concepto contable para las cuotas de acuerdos (se crea si no existe). */
async function conceptoAcuerdo(ctx: Pick<Ctx, "db" | "conjuntoId">) {
  const c = await ctx.db.conceptoCobro.findFirst({ where: { nombre: "Acuerdo de pago", tipo: "OTRO" } });
  if (c) return c;
  return ctx.db.conceptoCobro.create({ data: { conjuntoId: ctx.conjuntoId, nombre: "Acuerdo de pago", tipo: "OTRO", cuentaContable: "130505" } });
}

export type AcuerdoInput = { unidadId: string; numeroCuotas: number; diaPago: number; primerPeriodo?: string | null; observaciones?: string | null; documentoUrl?: string | null };

/** Saldo que se puede llevar a un acuerdo: cuotas vencidas (incluye intereses) con saldo. */
export async function saldoParaAcuerdo(ctx: Pick<Ctx, "db">, unidadId: string, hoy = new Date()) {
  const s = await saldoUnidad(ctx, unidadId, hoy);
  const cuotas = s.cuotas.filter((c) => c.diasMora > 0 && c.estado !== "EN_ACUERDO");
  return { cuotas, total: round(cuotas.reduce((a, c) => a + c.saldo, 0)), saldoAFavor: s.saldoAFavor };
}

/**
 * Crea un acuerdo de pago sobre el saldo vencido: las cuotas originales quedan EN_ACUERDO (su saldo se traslada
 * con un movimiento crédito) y se generan N cuotas del acuerdo (crearCargo con acuerdoId), cada una con débito.
 * El libro auxiliar queda cuadrado (débitos − créditos = saldo real).
 */
export async function crearAcuerdo(ctx: ACtx, input: AcuerdoInput, hoy = new Date()) {
  if (input.numeroCuotas < 1 || input.numeroCuotas > 36) throw new AppError("El acuerdo debe tener entre 1 y 36 cuotas.", 400, { numeroCuotas: "Entre 1 y 36" });
  if (input.diaPago < 1 || input.diaPago > 28) throw new AppError("El día de pago debe estar entre 1 y 28.", 400, { diaPago: "Entre 1 y 28" });
  const vigente = await ctx.db.acuerdoPago.findFirst({ where: { unidadId: input.unidadId, estado: "VIGENTE" } });
  if (vigente) throw new AppError("La unidad ya tiene un acuerdo de pago vigente.");
  await aplicarSaldosAFavor(ctx, input.unidadId);
  const { cuotas, total } = await saldoParaAcuerdo(ctx, input.unidadId, hoy);
  if (total <= 0) throw new AppError("La unidad no tiene saldo vencido para llevar a un acuerdo de pago.");
  // Primer vencimiento: el día de pago del mes siguiente (o del mes actual si aún no ha pasado).
  const perHoy = periodoActual(hoy);
  const diaHoy = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", day: "2-digit" }).format(hoy));
  const primerPeriodo = input.primerPeriodo || (diaHoy < input.diaPago ? perHoy : sumarMeses(perHoy, 1));
  const plan = planAcuerdo(total, input.numeroCuotas, primerPeriodo, input.diaPago);
  const acuerdo = await ctx.db.acuerdoPago.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      saldoInicial: total,
      numeroCuotas: input.numeroCuotas,
      valorCuota: plan[0].valor,
      fechaInicio: hoy,
      diaPago: input.diaPago,
      observaciones: input.observaciones ?? null,
      documentoUrl: input.documentoUrl ?? null,
      creadoPorId: ctx.userId === "sistema" ? null : ctx.userId,
    },
  });
  // Traslado de las cuotas originales.
  for (const c of cuotas) {
    await ctx.db.cuota.update({ where: { id: c.id }, data: { estado: "EN_ACUERDO", saldo: 0, acuerdoId: acuerdo.id } });
    await ctx.db.movimientoCartera.create({
      data: { conjuntoId: ctx.conjuntoId, unidadId: input.unidadId, fecha: hoy, tipo: "CREDITO", valor: c.saldo, conceptoTipo: c.tipo as never, cuotaId: c.id, descripcion: `Traslado a acuerdo de pago: ${c.descripcion}` },
    });
  }
  const concepto = await conceptoAcuerdo(ctx);
  for (const p of plan) {
    await crearCargo(ctx, {
      unidadId: input.unidadId,
      conceptoId: concepto.id,
      valorBase: p.valor,
      periodo: p.periodo,
      fechaEmision: hoy,
      fechaVencimiento: p.vencimiento,
      origen: "MANUAL",
      acuerdoId: acuerdo.id,
      descripcion: `Acuerdo de pago — cuota ${p.numero}/${plan.length}`,
    });
  }
  await audit(ctx as Ctx, "crear_acuerdo", "AcuerdoPago", acuerdo.id, undefined, { ...input, saldoInicial: total, cuotasTrasladadas: cuotas.map((c) => c.id), plan });
  return acuerdo;
}

/** Detalle del acuerdo: cuotas del plan (con acuerdoId y concepto "Acuerdo de pago") y cuotas originales trasladadas. */
export async function detalleAcuerdo(ctx: Pick<Ctx, "db">, id: string) {
  const a = await ctx.db.acuerdoPago.findUnique({ where: { id }, include: { unidad: { select: { id: true, codigo: true } } } });
  if (!a) notFound("El acuerdo de pago");
  const todas = await ctx.db.cuota.findMany({ where: { acuerdoId: id }, include: { concepto: true }, orderBy: [{ fechaVencimiento: "asc" }] });
  const plan = todas.filter((c) => c.estado !== "EN_ACUERDO");
  const originales = todas.filter((c) => c.estado === "EN_ACUERDO");
  const pagado = round(plan.reduce((s, c) => s + (toNumber(c.valorBase) + toNumber(c.iva) - toNumber(c.saldo)), 0));
  const pendiente = round(plan.filter((c) => c.estado !== "ANULADA").reduce((s, c) => s + toNumber(c.saldo), 0));
  return { acuerdo: a, plan, originales, pagado, pendiente };
}

/** Evalúa el estado del acuerdo: CUMPLIDO si todas sus cuotas están pagadas; INCUMPLIDO si alguna lleva más de `diasTolerancia` vencida. */
export async function evaluarAcuerdo(ctx: ACtx, id: string, hoy = new Date(), diasTolerancia = 30): Promise<EstadoAcuerdo> {
  const a = await ctx.db.acuerdoPago.findUnique({ where: { id } });
  if (!a) notFound("El acuerdo de pago");
  if (a.estado !== "VIGENTE") return a.estado;
  const plan = await ctx.db.cuota.findMany({ where: { acuerdoId: id, estado: { notIn: ["EN_ACUERDO", "ANULADA"] } } });
  let nuevo: EstadoAcuerdo = "VIGENTE";
  if (plan.length && plan.every((c) => c.estado === "PAGADA")) nuevo = "CUMPLIDO";
  else if (plan.some((c) => toNumber(c.saldo) > 0 && diffDays(hoy, c.fechaVencimiento) > diasTolerancia)) nuevo = "INCUMPLIDO";
  if (nuevo !== "VIGENTE") {
    await ctx.db.acuerdoPago.update({ where: { id }, data: { estado: nuevo } });
    await audit(ctx as Ctx, "estado_acuerdo", "AcuerdoPago", id, { estado: a.estado }, { estado: nuevo });
    const unidad = await ctx.db.unidad.findUnique({ where: { id: a.unidadId }, select: { codigo: true } });
    const admins = await usuariosConPermiso(ctx.conjuntoId, ["cartera.acuerdos"]);
    const propietarios = await usuariosDeUnidad(ctx.conjuntoId, a.unidadId, { soloPropietarios: true });
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: nuevo === "CUMPLIDO" ? [...admins, ...propietarios] : admins,
      titulo: nuevo === "CUMPLIDO" ? `Acuerdo de pago cumplido — ${unidad?.codigo}` : `Acuerdo de pago incumplido — ${unidad?.codigo}`,
      cuerpo: nuevo === "CUMPLIDO" ? "Se pagaron todas las cuotas del acuerdo. ¡Gracias por ponerse al día!" : `Una cuota del acuerdo lleva más de ${diasTolerancia} días vencida.`,
      enlace: nuevo === "CUMPLIDO" ? "/cuenta" : `/cartera/unidades/${a.unidadId}`,
      tipo: "CARTERA",
    });
  }
  return nuevo;
}

/** Cambio manual de estado (p. ej. declarar incumplido o anular un acuerdo sin pagos). */
export async function cambiarEstadoAcuerdo(ctx: Ctx, id: string, estado: EstadoAcuerdo, motivo?: string | null) {
  const a = await ctx.db.acuerdoPago.findUnique({ where: { id } });
  if (!a) notFound("El acuerdo de pago");
  if (estado === "ANULADO") {
    const plan = await ctx.db.cuota.findMany({ where: { acuerdoId: id, estado: { notIn: ["EN_ACUERDO", "ANULADA"] } }, include: { aplicaciones: { where: { deletedAt: null }, select: { id: true } } } });
    if (plan.some((c) => c.aplicaciones.length > 0)) throw new AppError("El acuerdo ya tiene pagos: no se puede anular. Márcalo como incumplido.");
    // Revierte: anula las cuotas del plan y devuelve el saldo a las originales.
    for (const c of plan) {
      await ctx.db.cuota.update({ where: { id: c.id }, data: { estado: "ANULADA", saldo: 0 } });
      await ctx.db.movimientoCartera.create({ data: { conjuntoId: ctx.conjuntoId, unidadId: a.unidadId, tipo: "CREDITO", valor: c.saldo, cuotaId: c.id, descripcion: `Anulación acuerdo de pago: ${c.descripcion ?? ""}` } });
    }
    const traslados = await ctx.db.movimientoCartera.findMany({ where: { unidadId: a.unidadId, tipo: "CREDITO", descripcion: { startsWith: "Traslado a acuerdo de pago" }, cuotaId: { not: null } } });
    const originales = await ctx.db.cuota.findMany({ where: { acuerdoId: id, estado: "EN_ACUERDO" } });
    for (const o of originales) {
      const mov = traslados.find((t) => t.cuotaId === o.id);
      const valor = mov ? toNumber(mov.valor) : 0;
      await ctx.db.cuota.update({ where: { id: o.id }, data: { estado: valor > 0 ? "PENDIENTE" : "PAGADA", saldo: valor, acuerdoId: null } });
      if (valor > 0) await ctx.db.movimientoCartera.create({ data: { conjuntoId: ctx.conjuntoId, unidadId: a.unidadId, tipo: "DEBITO", valor, conceptoTipo: mov?.conceptoTipo ?? null, cuotaId: o.id, descripcion: `Reversión traslado por anulación del acuerdo: ${o.descripcion ?? ""}` } });
    }
  }
  const u = await ctx.db.acuerdoPago.update({ where: { id }, data: { estado, observaciones: motivo ? [a.observaciones, `${estado}: ${motivo}`].filter(Boolean).join("\n") : a.observaciones } });
  await audit(ctx, "estado_acuerdo", "AcuerdoPago", id, { estado: a.estado }, { estado, motivo });
  return u;
}

export async function adjuntarDocumentoAcuerdo(ctx: Ctx, id: string, documentoUrl: string) {
  const a = await ctx.db.acuerdoPago.findUnique({ where: { id } });
  if (!a) notFound("El acuerdo de pago");
  await ctx.db.acuerdoPago.update({ where: { id }, data: { documentoUrl } });
  await audit(ctx, "adjuntar_documento", "AcuerdoPago", id, { documentoUrl: a.documentoUrl }, { documentoUrl });
}

/** Seguimiento diario (job): evalúa acuerdos vigentes. */
export async function seguimientoAcuerdos(ctx: ACtx, hoy = new Date()) {
  const vigentes = await ctx.db.acuerdoPago.findMany({ where: { estado: "VIGENTE" }, select: { id: true } });
  const out = { evaluados: vigentes.length, CUMPLIDO: 0, INCUMPLIDO: 0 };
  for (const a of vigentes) {
    const e = await evaluarAcuerdo(ctx, a.id, hoy);
    if (e === "CUMPLIDO" || e === "INCUMPLIDO") out[e]++;
  }
  return out;
}

export function resumenPlanTexto(total: number, n: number) {
  return `${n} cuota(s) de ${cop(Math.floor(total / n))}`;
}

