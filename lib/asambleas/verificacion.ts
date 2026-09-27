import { prisma } from "@/lib/db";

/**
 * Consulta pública de actas por código de verificación (para /verificar/<codigo>, que construye otro
 * módulo). Busca en `Votacion.codigoActa` (actas de resultados, prefijo VOT-) y `Asamblea.actaCodigo`
 * (actas de asamblea, prefijo ACT-). Solo devuelve datos agregados, nunca votos individuales.
 */
export type ActaVerificada =
  | {
      tipo: "VOTACION";
      codigo: string;
      conjunto: string;
      titulo: string;
      cerradaEn: Date;
      decision: string | null;
      aprobada: boolean | null;
      participacionCoeficiente: number | null;
      totalVotos: number | null;
      asamblea: string | null;
    }
  | {
      tipo: "ASAMBLEA";
      codigo: string;
      conjunto: string;
      titulo: string;
      fecha: Date;
      asambleaTipo: string;
      publicadaEn: Date | null;
      presidente: string | null;
      secretario: string | null;
      firmada: boolean;
    };

export async function buscarActaPorCodigo(codigo: string): Promise<ActaVerificada | null> {
  const c = codigo.trim().toUpperCase();
  if (!/^[A-Z]{3}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null;
  const v = await prisma.votacion.findFirst({ where: { codigoActa: c, deletedAt: null, estado: "CERRADA" }, include: { conjunto: { select: { nombre: true } }, asamblea: { select: { titulo: true } } } });
  if (v) {
    const r = (v.resultado ?? {}) as { decision?: string; aprobada?: boolean; participacionCoeficiente?: number; totalVotos?: number };
    return {
      tipo: "VOTACION",
      codigo: c,
      conjunto: v.conjunto.nombre,
      titulo: v.pregunta,
      cerradaEn: v.fin,
      decision: r.decision ?? null,
      aprobada: r.aprobada ?? null,
      participacionCoeficiente: r.participacionCoeficiente ?? null,
      totalVotos: r.totalVotos ?? null,
      asamblea: v.asamblea?.titulo ?? null,
    };
  }
  const a = await prisma.asamblea.findFirst({ where: { actaCodigo: c, deletedAt: null }, include: { conjunto: { select: { nombre: true } } } });
  if (a) {
    return {
      tipo: "ASAMBLEA",
      codigo: c,
      conjunto: a.conjunto.nombre,
      titulo: a.titulo,
      fecha: a.fecha,
      asambleaTipo: a.tipo,
      publicadaEn: a.actaPublicadaEn,
      presidente: a.presidenteNombre,
      secretario: a.secretarioNombre,
      firmada: !!(a.firmaPresidente && a.firmaSecretario),
    };
  }
  return null;
}
