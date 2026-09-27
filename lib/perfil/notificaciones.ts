import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";

/** Centro de notificaciones del usuario (las notificaciones son del usuario, no del conjunto). */
function base(ctx: Ctx, soloNoLeidas: boolean): Prisma.NotificacionWhereInput {
  return { usuarioId: ctx.userId, deletedAt: null, OR: [{ conjuntoId: ctx.conjuntoId }, { conjuntoId: null }], ...(soloNoLeidas ? { leida: false } : {}) };
}

export async function listarNotificaciones(ctx: Ctx, opts: { soloNoLeidas: boolean; skip: number; take: number }) {
  const where = base(ctx, opts.soloNoLeidas);
  const [rows, total, noLeidas] = await Promise.all([
    prisma.notificacion.findMany({ where, orderBy: { createdAt: "desc" }, skip: opts.skip, take: opts.take }),
    prisma.notificacion.count({ where }),
    prisma.notificacion.count({ where: base(ctx, true) }),
  ]);
  return { rows, total, noLeidas };
}

export async function marcarLeida(ctx: Ctx, id: string) {
  const r = await prisma.notificacion.updateMany({ where: { id, usuarioId: ctx.userId, leida: false }, data: { leida: true, leidaEn: new Date() } });
  return r.count;
}

export async function marcarTodasLeidas(ctx: Ctx) {
  const r = await prisma.notificacion.updateMany({ where: base(ctx, true), data: { leida: true, leidaEn: new Date() } });
  return r.count;
}

export async function eliminarLeidas(ctx: Ctx) {
  const r = await prisma.notificacion.updateMany({ where: { ...base(ctx, false), leida: true }, data: { deletedAt: new Date() } });
  return r.count;
}
