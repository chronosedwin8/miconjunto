import { createToken, peekToken } from "@/lib/auth/tokens";
import { systemCtx } from "@/lib/auth/system-ctx";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { saldoUnidad } from "@/lib/cartera/core";
import { iniciarPagoEnLinea, serializarPago } from "./service";
import { verificarFirmaEstado } from "./firmas";
import type { MedioEnLinea } from "./types";

/**
 * Link público de pago (`/pagar/<token>`) para el correo de cobro: token PAGO_PUBLICO reutilizable
 * hasta su expiración, con `data: { unidadId }`. No requiere iniciar sesión.
 */

export async function crearLinkPago(conjuntoId: string, unidadId: string, dias = 30) {
  const token = await createToken("PAGO_PUBLICO", { conjuntoId, data: { unidadId }, ttlMinutes: dias * 24 * 60 });
  return { token, url: appUrl(`/pagar/${token}`) };
}

async function leerToken(raw: string) {
  const t = await peekToken("PAGO_PUBLICO", raw);
  const unidadId = (t?.data as { unidadId?: string } | null)?.unidadId;
  if (!t || !t.conjuntoId || !unidadId) return null;
  return { conjuntoId: t.conjuntoId, unidadId, expira: t.expira };
}

/** Datos que muestra la página pública: conjunto, unidad y saldo. `null` si el link no existe o venció. */
export async function datosLinkPago(raw: string) {
  const t = await leerToken(raw);
  if (!t) return null;
  const ctx = await systemCtx(t.conjuntoId);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: t.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) return null;
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: t.conjuntoId }, select: { nombre: true, colorPrimario: true, logoUrl: true } });
  const saldo = await saldoUnidad(ctx, unidad.id);
  return { conjunto, unidad, saldo, permitirAbonos: conjuntoConfig(ctx).pagos.permitirAbonos, expira: t.expira };
}

/** Crea el pago desde el link público (sin sesión) y devuelve la URL del checkout. */
export async function iniciarPagoPublico(
  raw: string,
  input: { medio: MedioEnLinea; valor?: number | null; cuotaIds?: string[] | null; pagadorNombre?: string | null; pagadorEmail?: string | null },
) {
  const t = await leerToken(raw);
  if (!t) throw new AppError("El link de pago venció o no es válido. Pide uno nuevo a la administración.", 404);
  const ctx = await systemCtx(t.conjuntoId, { nombre: "Pago público (link de cobro)" });
  return iniciarPagoEnLinea(ctx, {
    unidadId: t.unidadId,
    medio: input.medio,
    valor: input.valor,
    cuotaIds: input.cuotaIds,
    origen: "link público",
    pagadorNombre: input.pagadorNombre,
    pagadorEmail: input.pagadorEmail,
    returnPath: "/pagar/estado/{referencia}?f={firma}",
  });
}

/** Estado de un pago para la página pública de retorno (datos mínimos). */
export async function estadoPagoPublico(referencia: string, f: string | null | undefined) {
  if (!verificarFirmaEstado(referencia, f)) return null;
  const pago = await prisma.pago.findUnique({
    where: { referencia },
    include: { unidad: { select: { id: true, codigo: true } }, conjunto: { select: { nombre: true } } },
  });
  if (!pago) return null;
  return { ...serializarPago(pago), conjunto: pago.conjunto.nombre, checkoutUrl: null };
}
