import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { listarEncuestas } from "@/lib/encuestas/service";
import { unidadesHabilitadas } from "@/lib/votaciones/service";

/**
 * Widgets de gobierno para /inicio (encuestas, votaciones y asambleas).
 *
 * - `resumenResidente(ctx)`: encuestas y votaciones pendientes por responder y la próxima asamblea.
 * - `resumenAdmin(ctx)`: asambleas y votaciones activas, poderes por aprobar y próxima asamblea.
 */

export type ItemPendiente = { id: string; titulo: string; cierra: Date; href: string };
export type ProximaAsamblea = { id: string; titulo: string; fecha: Date; tipo: string; modalidad: string; estado: string; enlace: string | null; href: string } | null;

export type ResumenGobiernoResidente = {
  encuestasPendientes: ItemPendiente[];
  votacionesPendientes: (ItemPendiente & { unidades: string[] })[];
  proximaAsamblea: ProximaAsamblea;
};

export type ResumenGobiernoAdmin = {
  asambleasActivas: { id: string; titulo: string; estado: string; fecha: Date; href: string }[];
  votacionesActivas: { id: string; pregunta: string; votos: number; cierra: Date; href: string }[];
  poderesPendientes: number;
  encuestasAbiertas: number;
  proximaAsamblea: ProximaAsamblea;
};

async function proximaAsamblea(ctx: Ctx): Promise<ProximaAsamblea> {
  const a = await ctx.db.asamblea.findFirst({
    where: { estado: { in: ["CONVOCADA", "EN_CURSO"] }, fecha: { gte: new Date(Date.now() - 12 * 3_600_000) } },
    orderBy: { fecha: "asc" },
  });
  return a ? { id: a.id, titulo: a.titulo, fecha: a.fecha, tipo: a.tipo, modalidad: a.modalidad, estado: a.estado, enlace: a.enlace, href: `/asambleas/${a.id}` } : null;
}

export async function resumenResidente(ctx: Ctx): Promise<ResumenGobiernoResidente> {
  const ahora = new Date();
  const [encuestas, votaciones, proxima] = await Promise.all([
    can(ctx, "encuestas.ver") ? listarEncuestas(ctx, { estado: "ABIERTA" }) : Promise.resolve([]),
    can(ctx, "votaciones.ver") ? ctx.db.votacion.findMany({ where: { estado: "ABIERTA", inicio: { lte: ahora }, fin: { gt: ahora } }, orderBy: { fin: "asc" }, take: 20 }) : Promise.resolve([]),
    can(ctx, "asambleas.ver") ? proximaAsamblea(ctx) : Promise.resolve(null),
  ]);
  const votacionesPendientes: ResumenGobiernoResidente["votacionesPendientes"] = [];
  for (const v of votaciones) {
    const us = await unidadesHabilitadas(ctx, v);
    const faltan = us.filter((u) => !u.yaVoto && !u.bloqueo);
    if (faltan.length) votacionesPendientes.push({ id: v.id, titulo: v.pregunta, cierra: v.fin, href: `/votaciones/${v.id}`, unidades: faltan.map((u) => u.codigo) });
  }
  return {
    encuestasPendientes: encuestas.filter((e) => !e.respondida && e.fin > ahora).map((e) => ({ id: e.id, titulo: e.titulo, cierra: e.fin, href: `/encuestas/${e.id}` })),
    votacionesPendientes,
    proximaAsamblea: proxima,
  };
}

export async function resumenAdmin(ctx: Ctx): Promise<ResumenGobiernoAdmin> {
  const [asambleas, votaciones, poderes, encuestas, proxima] = await Promise.all([
    ctx.db.asamblea.findMany({ where: { estado: { in: ["BORRADOR", "CONVOCADA", "EN_CURSO"] } }, orderBy: { fecha: "asc" }, take: 5 }),
    ctx.db.votacion.findMany({ where: { estado: "ABIERTA" }, orderBy: { fin: "asc" }, take: 5, include: { _count: { select: { votos: { where: { deletedAt: null } } } } } }),
    ctx.db.poderAsamblea.count({ where: { estado: "PENDIENTE", asamblea: { estado: { in: ["BORRADOR", "CONVOCADA", "EN_CURSO"] } } } }),
    ctx.db.encuesta.count({ where: { estado: "ABIERTA" } }),
    proximaAsamblea(ctx),
  ]);
  return {
    asambleasActivas: asambleas.map((a) => ({ id: a.id, titulo: a.titulo, estado: a.estado, fecha: a.fecha, href: `/asambleas/${a.id}` })),
    votacionesActivas: votaciones.map((v) => ({ id: v.id, pregunta: v.pregunta, votos: v._count.votos, cierra: v.fin, href: `/votaciones/${v.id}` })),
    poderesPendientes: poderes,
    encuestasAbiertas: encuestas,
    proximaAsamblea: proxima,
  };
}
