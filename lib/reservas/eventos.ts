/**
 * Suscriptores de eventos del módulo de reservas.
 * `pago.aprobado` → si el pago cubre la(s) cuota(s) de una reserva, la marca pagada, la confirma
 * (salvo aprobación pendiente), notifica y encola la factura electrónica si la zona la genera.
 */
import { on } from "@/lib/events";
import { prisma } from "@/lib/db";
import { confirmarPagoReserva } from "./service";

on("pago.aprobado", async (evt) => {
  const data = evt.data as { pagoId?: string; reservaId?: string | null; cuotaIds?: string[] };
  const cuotaIds = Array.isArray(data.cuotaIds) ? data.cuotaIds : [];
  // Un pago del depósito solo: se busca también por la cuota principal (cuotaOrigenId).
  const origenes = cuotaIds.length
    ? (await prisma.cuota.findMany({ where: { id: { in: cuotaIds }, conjuntoId: evt.conjuntoId, origen: "RESERVA", cuotaOrigenId: { not: null } }, select: { cuotaOrigenId: true } })).map((c) => c.cuotaOrigenId!)
    : [];
  const ids = [...new Set([...cuotaIds, ...origenes])];
  const or = [...(ids.length ? [{ cuotaId: { in: ids } }] : []), ...(data.reservaId ? [{ id: data.reservaId }] : [])];
  if (!or.length) return;
  const reservas = await prisma.reserva.findMany({ where: { conjuntoId: evt.conjuntoId, deletedAt: null, pagada: false, OR: or }, select: { id: true } });
  for (const r of reservas) await confirmarPagoReserva(evt.conjuntoId, r.id, data.pagoId ?? null);
});
