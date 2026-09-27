import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";

/**
 * Seguimiento de correos (`queueEmail({ tracking: true })`): pixel de apertura y redirección de clics.
 * Actualiza `CorreoSaliente.abiertoEn/clicEn` una sola vez y los contadores de la campaña.
 */
export async function registrarApertura(trackingId: string) {
  const c = await prisma.correoSaliente.findUnique({ where: { trackingId }, select: { id: true, campanaId: true, abiertoEn: true } });
  if (!c || c.abiertoEn) return;
  const r = await prisma.correoSaliente.updateMany({ where: { id: c.id, abiertoEn: null }, data: { abiertoEn: new Date() } });
  if (r.count === 1 && c.campanaId) await prisma.campanaCorreo.update({ where: { id: c.campanaId }, data: { aperturas: { increment: 1 } } });
}

/** Registra el clic y devuelve la URL de destino validada (solo URLs presentes en el correo o de la app). */
export async function registrarClic(trackingId: string, destino: string | null): Promise<string> {
  const inicio = appUrl("/");
  const c = await prisma.correoSaliente.findUnique({ where: { trackingId }, select: { id: true, campanaId: true, clicEn: true, html: true } });
  let url = inicio;
  if (destino && /^https?:\/\//i.test(destino)) {
    const valida = destino.startsWith(inicio) || (!!c && c.html.includes(encodeURIComponent(destino)));
    if (valida) url = destino;
  }
  if (!c) return url;
  // Un clic implica apertura (muchos clientes bloquean el pixel).
  await registrarApertura(trackingId);
  if (!c.clicEn) {
    const r = await prisma.correoSaliente.updateMany({ where: { id: c.id, clicEn: null }, data: { clicEn: new Date() } });
    if (r.count === 1 && c.campanaId) await prisma.campanaCorreo.update({ where: { id: c.campanaId }, data: { clics: { increment: 1 } } });
  }
  return url;
}
