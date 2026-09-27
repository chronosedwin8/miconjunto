import type { Prisma, TipoObjetoPerdido } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { insensitive } from "@/lib/pagination";
import { notify } from "@/lib/notificaciones";
import { textoPlano, metaDe, SUBCATEGORIAS_CLASIFICADO } from "@/lib/muro/contenido";
import { esModeradorClasificados, cargarTarjetas } from "@/lib/muro/service";

/** Clasificados vecinales (Publicacion CLASIFICADO, moderados) y objetos perdidos / encontrados. */
export { SUBCATEGORIAS_CLASIFICADO };

export async function listarClasificados(ctx: Ctx, f: { subcategoria?: string | null; q?: string | null; mis?: boolean } = {}) {
  const where: Prisma.PublicacionWhereInput = {
    categoria: "CLASIFICADO",
    ...(f.mis ? { autorId: ctx.userId } : { estado: "PUBLICADA", OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }] }),
    ...(f.q ? { AND: [{ OR: [{ titulo: insensitive(f.q) }, { resumen: insensitive(f.q) }] }] } : {}),
  };
  const rows = await ctx.db.publicacion.findMany({ where, select: { id: true, contenido: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const ids = rows.filter((r) => !f.subcategoria || metaDe(r.contenido)?.subcategoria === f.subcategoria).map((r) => r.id);
  const tarjetas = ids.length ? await cargarTarjetas(ctx, ids) : [];
  return ids.map((id) => tarjetas.find((t) => t.id === id)!).filter(Boolean);
}

// ── Objetos perdidos y encontrados ──

export type ObjetoInput = { tipo: TipoObjetoPerdido; descripcion: string; lugar?: string | null; fecha?: Date | null; fotoUrl?: string | null; contacto?: string | null };

export function puedeGestionarObjeto(ctx: Ctx, o: { reportadoPorId: string | null }) {
  return o.reportadoPorId === ctx.userId || esModeradorClasificados(ctx) || can(ctx, "porteria.registrar");
}

export async function listarObjetos(ctx: Ctx, f: { tipo?: string | null; estado?: string | null; q?: string | null } = {}) {
  return ctx.db.objetoPerdido.findMany({
    where: {
      ...(f.tipo === "PERDIDO" || f.tipo === "ENCONTRADO" ? { tipo: f.tipo } : {}),
      ...(f.estado === "ABIERTO" || f.estado === "DEVUELTO" || f.estado === "CERRADO" ? { estado: f.estado } : { estado: "ABIERTO" }),
      ...(f.q ? { OR: [{ descripcion: insensitive(f.q) }, { lugar: insensitive(f.q) }] } : {}),
    },
    orderBy: { fecha: "desc" },
    take: 100,
  });
}

export async function reportarObjeto(ctx: Ctx, input: ObjetoInput) {
  if (input.fotoUrl && (!input.fotoUrl.startsWith(`/api/files/${ctx.conjuntoId}/`) || input.fotoUrl.includes(".."))) throw new AppError("La foto no es válida.", 400, { fotoUrl: "Súbela de nuevo" });
  const o = await ctx.db.objetoPerdido.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      tipo: input.tipo,
      descripcion: textoPlano(input.descripcion).slice(0, 500),
      lugar: input.lugar ? textoPlano(input.lugar).slice(0, 120) : null,
      fecha: input.fecha ?? new Date(),
      fotoUrl: input.fotoUrl ?? null,
      contacto: input.contacto ? textoPlano(input.contacto).slice(0, 120) : null,
      reportadoPorId: ctx.userId,
    },
  });
  await audit(ctx, "reportar", "ObjetoPerdido", o.id, undefined, { tipo: o.tipo, descripcion: o.descripcion });
  return o;
}

export async function marcarDevuelto(ctx: Ctx, id: string, entregadoA: string) {
  const o = await ctx.db.objetoPerdido.findUnique({ where: { id } });
  if (!o) notFound("El objeto");
  if (!puedeGestionarObjeto(ctx, o)) throw new AppError("Solo quien lo reportó o la administración pueden cerrarlo.", 403);
  if (o.estado !== "ABIERTO") throw new AppError("El reporte ya está cerrado.");
  const quien = textoPlano(entregadoA).slice(0, 120);
  if (!quien) throw new AppError("Indica a quién se entregó.", 400, { entregadoA: "Obligatorio" });
  await ctx.db.objetoPerdido.update({ where: { id }, data: { estado: "DEVUELTO", entregadoA: quien } });
  await audit(ctx, "devolver", "ObjetoPerdido", id, { estado: o.estado }, { estado: "DEVUELTO", entregadoA: quien });
  if (o.reportadoPorId && o.reportadoPorId !== ctx.userId) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [o.reportadoPorId], titulo: "Objeto devuelto", cuerpo: `${o.descripcion.slice(0, 80)} fue entregado a ${quien}.`, enlace: "/clasificados/perdidos?estado=DEVUELTO", tipo: "GENERAL" });
  }
  return true;
}

export async function cerrarObjeto(ctx: Ctx, id: string) {
  const o = await ctx.db.objetoPerdido.findUnique({ where: { id } });
  if (!o) notFound("El objeto");
  if (!puedeGestionarObjeto(ctx, o)) throw new AppError("Solo quien lo reportó o la administración pueden cerrarlo.", 403);
  await ctx.db.objetoPerdido.update({ where: { id }, data: { estado: "CERRADO" } });
  await audit(ctx, "cerrar", "ObjetoPerdido", id, { estado: o.estado }, { estado: "CERRADO" });
  return true;
}
