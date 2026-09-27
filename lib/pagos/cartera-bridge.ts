import type { Ctx } from "@/lib/auth/context";
import { estadoCuentaPdf as estadoCuentaPdfCartera, generarCuotasMes, pazYSalvoPdf, reciboPdf, solicitarPazYSalvo } from "@/lib/cartera/service";

/**
 * Puente hacia la Fase 3 (Cartera): estado de cuenta PDF, recibo de caja, paz y salvo y generación de
 * cuotas. Se centraliza aquí para que el módulo de pagos no dependa de la forma interna de Cartera.
 */

/** Estado de cuenta PDF de una unidad (Cartera). */
export function estadoCuentaPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, unidadId: string): Promise<Buffer> {
  return estadoCuentaPdfCartera(ctx, unidadId);
}

/** Recibo de caja PDF de un pago aprobado (Cartera). */
export function reciboPagoPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, pagoId: string): Promise<Buffer> {
  return reciboPdf(ctx, pagoId);
}

export type ResultadoPazYSalvo = { emitido: true; certificadoId: string } | { emitido: false; saldo: number; mensaje: string };

/** Solicita el paz y salvo: si la unidad está al día se emite (o devuelve el vigente); si no, el saldo pendiente. */
export async function pedirPazYSalvo(ctx: Ctx, unidadId: string): Promise<ResultadoPazYSalvo> {
  const r = await solicitarPazYSalvo(ctx, unidadId);
  if (r.ok) return { emitido: true, certificadoId: r.certificado.id };
  return { emitido: false, saldo: Math.max(0, r.saldo.neto), mensaje: r.mensaje };
}

/** PDF de un certificado de paz y salvo con QR verificable (Cartera). */
export function certificadoPazYSalvoPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, id: string): Promise<Buffer> {
  return pazYSalvoPdf(ctx, id);
}

/** Genera las cuotas de administración del mes (idempotente, Cartera). */
export async function generarCuotasDelMes(ctx: Ctx, periodo: string): Promise<boolean> {
  const r = await generarCuotasMes(ctx, periodo);
  return r.total > 0 || r.creadas > 0;
}
