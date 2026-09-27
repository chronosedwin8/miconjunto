import type { MedioPago, TipoConcepto } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { toNumber } from "@/lib/format";
import { crearCargo, registrarPago } from "./core";
import { calcularIva, round } from "./calculos";

// ─────────────── Conceptos de cobro ───────────────

export type ConceptoInput = { id?: string | null; nombre: string; tipo: TipoConcepto; cuentaContable?: string | null; gravaIva: boolean; tarifaIva: number; facturaElectronica: boolean; activo: boolean };

export async function guardarConcepto(ctx: Ctx, input: ConceptoInput) {
  const { id, ...data } = input;
  if (!data.gravaIva) data.tarifaIva = 0;
  if (id) {
    const antes = await ctx.db.conceptoCobro.findUnique({ where: { id } });
    if (!antes) notFound("El concepto");
    const c = await ctx.db.conceptoCobro.update({ where: { id }, data });
    await audit(ctx, "editar", "ConceptoCobro", id, antes, c);
    return c;
  }
  const c = await ctx.db.conceptoCobro.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "ConceptoCobro", c.id, undefined, c);
  return c;
}

/** Elimina un concepto sin cuotas; si ya tiene cuotas solo se desactiva. */
export async function eliminarConcepto(ctx: Ctx, id: string) {
  const c = await ctx.db.conceptoCobro.findUnique({ where: { id }, include: { _count: { select: { cuotas: true } } } });
  if (!c) notFound("El concepto");
  const otrosDelTipo = await ctx.db.conceptoCobro.count({ where: { tipo: c.tipo, activo: true, id: { not: id } } });
  if (["ADMINISTRACION", "INTERES_MORA", "EXTRAORDINARIA"].includes(c.tipo) && otrosDelTipo === 0) {
    throw new AppError("Debe existir al menos un concepto activo de este tipo: lo usa la generación automática.");
  }
  if (c._count.cuotas > 0) {
    await ctx.db.conceptoCobro.update({ where: { id }, data: { activo: false } });
    await audit(ctx, "desactivar", "ConceptoCobro", id, c);
    return { desactivado: true };
  }
  await ctx.db.conceptoCobro.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "ConceptoCobro", id, c);
  return { eliminado: true };
}

// ─────────────── Cargos manuales ───────────────

export type CargoManualInput = { unidadId: string; conceptoId: string; valorBase: number; descripcion?: string | null; fechaVencimiento: Date; periodo?: string | null };

/** Cargo manual a una unidad (calcula IVA si el concepto lo grava). */
export async function crearCargoManual(ctx: Ctx, input: CargoManualInput) {
  const concepto = await ctx.db.conceptoCobro.findUnique({ where: { id: input.conceptoId } });
  if (!concepto || !concepto.activo) notFound("El concepto de cobro");
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } });
  if (!unidad) notFound("La unidad");
  const base = round(input.valorBase);
  const iva = concepto.gravaIva ? calcularIva(base, toNumber(concepto.tarifaIva)) : 0;
  const c = await crearCargo(ctx, {
    unidadId: input.unidadId,
    conceptoId: concepto.id,
    valorBase: base,
    iva,
    descripcion: input.descripcion || undefined,
    periodo: input.periodo || undefined,
    fechaVencimiento: input.fechaVencimiento,
    origen: "MANUAL",
  });
  await audit(ctx, "crear_cargo", "Cuota", c.id, undefined, c);
  return c;
}

// ─────────────── Pagos manuales ───────────────

export const MEDIOS_MANUALES = ["EFECTIVO", "TRANSFERENCIA", "CONSIGNACION", "PSE", "NEQUI", "BANCOLOMBIA_QR", "TARJETA"] as const;

export type PagoManualInput = {
  unidadId: string;
  valor: number;
  fecha: Date;
  medio: MedioPago;
  referenciaExterna?: string | null;
  comprobanteUrl?: string | null;
  observaciones?: string | null;
  cuotaIds?: string[];
  pagadorNombre?: string | null;
};

/** Registra un pago recibido en la administración y lo aplica (a las cuotas elegidas primero, luego en orden legal). */
export async function registrarPagoManual(ctx: Ctx, input: PagoManualInput) {
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } });
  if (!unidad) notFound("La unidad");
  if ((input.medio === "TRANSFERENCIA" || input.medio === "CONSIGNACION") && !input.comprobanteUrl) {
    throw new AppError("Adjunta el comprobante de la transferencia o consignación.", 400, { comprobanteUrl: "Adjunta el comprobante" });
  }
  if (input.fecha.getTime() > Date.now() + 5 * 60_000) throw new AppError("La fecha del pago no puede ser futura.", 400, { fecha: "Fecha futura" });
  if (input.cuotaIds?.length) {
    const n = await ctx.db.cuota.count({ where: { id: { in: input.cuotaIds }, unidadId: input.unidadId, saldo: { gt: 0 } } });
    if (n !== input.cuotaIds.length) throw new AppError("Alguna de las cuotas elegidas no pertenece a la unidad o ya está pagada.");
  }
  const pago = await registrarPago(ctx, {
    unidadId: input.unidadId,
    valor: round(input.valor),
    fecha: input.fecha,
    medio: input.medio,
    referenciaExterna: input.referenciaExterna,
    comprobanteUrl: input.comprobanteUrl,
    observaciones: input.observaciones,
    cuotasSeleccionadas: input.cuotaIds ?? [],
    pagadorNombre: input.pagadorNombre,
    estado: "APROBADO",
  });
  return pago;
}

/**
 * Anula un pago aprobado: revierte sus aplicaciones (devuelve el saldo a las cuotas), reversa el descuento de
 * pronto pago que haya generado y registra un movimiento débito de reversión. Queda auditado.
 */
export async function anularPago(ctx: Ctx, pagoId: string, motivo: string) {
  const pago = await ctx.db.pago.findUnique({ where: { id: pagoId }, include: { aplicaciones: { where: { deletedAt: null } } } });
  if (!pago) notFound("El pago");
  if (pago.estado !== "APROBADO") throw new AppError("Solo se pueden anular pagos aprobados.");
  if (!motivo || motivo.trim().length < 5) throw new AppError("Escribe el motivo de la anulación.", 400, { motivo: "Obligatorio" });
  const ahora = new Date();
  const cuotasAfectadas = new Set<string>();
  for (const a of pago.aplicaciones) {
    await ctx.db.aplicacionPago.update({ where: { id: a.id }, data: { deletedAt: ahora } });
    await ctx.db.cuota.update({ where: { id: a.cuotaId }, data: { saldo: { increment: a.valor } } });
    cuotasAfectadas.add(a.cuotaId);
  }
  // Reversa del descuento por pronto pago otorgado con este pago.
  const descuentos = await ctx.db.movimientoCartera.findMany({ where: { pagoId, tipo: "CREDITO", cuotaId: { not: null }, descripcion: { startsWith: "Descuento pronto pago" } } });
  for (const d of descuentos) {
    await ctx.db.cuota.update({ where: { id: d.cuotaId! }, data: { descuento: 0, saldo: { increment: d.valor } } });
    await ctx.db.movimientoCartera.create({
      data: { conjuntoId: ctx.conjuntoId, unidadId: pago.unidadId, fecha: ahora, tipo: "DEBITO", valor: d.valor, conceptoTipo: "ADMINISTRACION", cuotaId: d.cuotaId, pagoId, descripcion: `Reversión descuento pronto pago (anulación recibo N.º ${pago.numeroRecibo ?? "—"})` },
    });
    cuotasAfectadas.add(d.cuotaId!);
  }
  // Recalcula el estado de las cuotas afectadas.
  for (const id of cuotasAfectadas) {
    const c = await ctx.db.cuota.findUnique({ where: { id }, include: { aplicaciones: { where: { deletedAt: null }, select: { id: true } } } });
    if (!c || c.estado === "ANULADA") continue;
    const saldo = toNumber(c.saldo);
    await ctx.db.cuota.update({ where: { id }, data: { estado: saldo <= 0 ? "PAGADA" : c.aplicaciones.length ? "PARCIAL" : "PENDIENTE" } });
  }
  await ctx.db.movimientoCartera.create({
    data: { conjuntoId: ctx.conjuntoId, unidadId: pago.unidadId, fecha: ahora, tipo: "DEBITO", valor: pago.valor, pagoId, descripcion: `Anulación del pago recibo N.º ${pago.numeroRecibo ?? "—"}: ${motivo}` },
  });
  const actualizado = await ctx.db.pago.update({
    where: { id: pagoId },
    data: { estado: "ANULADO", conciliado: false, observaciones: [pago.observaciones, `ANULADO ${ahora.toISOString().slice(0, 10)} por ${ctx.nombre}: ${motivo}`].filter(Boolean).join("\n") },
  });
  // Las líneas de extracto emparejadas con este pago vuelven a quedar pendientes.
  await ctx.db.lineaExtracto.updateMany({ where: { pagoId }, data: { pagoId: null, estado: "PENDIENTE" } });
  // Multas que quedaron pagadas con este pago vuelven a RATIFICADA.
  await ctx.db.multa.updateMany({ where: { cuotaId: { in: [...cuotasAfectadas] }, estado: "PAGADA" }, data: { estado: "RATIFICADA" } }).catch(() => undefined);
  await audit(ctx, "anular_pago", "Pago", pagoId, pago, { motivo, cuotasAfectadas: [...cuotasAfectadas] });
  await emit({ tipo: "pago.anulado", conjuntoId: ctx.conjuntoId, data: { id: pagoId, pagoId, unidadId: pago.unidadId, valor: toNumber(pago.valor), motivo }, actorId: ctx.userId });
  return actualizado;
}
