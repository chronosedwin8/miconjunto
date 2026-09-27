import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { feedMuro, type TarjetaPublicacion } from "./service";

/**
 * Widgets del Inicio para el muro.
 * - `ultimasPublicaciones`: últimas publicaciones visibles para el usuario (respeta audiencia).
 * - `resumenModeracion`: publicaciones pendientes de moderación (para moderadores).
 */
export type InicioMuroResidente = {
  publicaciones: Pick<TarjetaPublicacion, "id" | "titulo" | "resumen" | "categoria" | "fijada" | "createdAt" | "leida" | "imagen">[];
  sinLeer: number;
};

export async function ultimasPublicaciones(ctx: Ctx, limite = 5): Promise<InicioMuroResidente> {
  if (!can(ctx, "comunicaciones.ver")) return { publicaciones: [], sinLeer: 0 };
  const f = await feedMuro(ctx, { pageSize: 20, incluirClasificados: false });
  return {
    publicaciones: f.items.slice(0, limite).map((p) => ({ id: p.id, titulo: p.titulo, resumen: p.resumen, categoria: p.categoria, fijada: p.fijada, createdAt: p.createdAt, leida: p.leida, imagen: p.imagen })),
    sinLeer: f.items.filter((p) => !p.leida).length,
  };
}

export type InicioMuroAdmin = {
  pendientesModeracion: number;
  pendientes: { id: string; titulo: string; autor: string; createdAt: Date }[];
  comentariosUltimaSemana: number;
};

export async function resumenModeracion(ctx: Ctx): Promise<InicioMuroAdmin> {
  if (!can(ctx, ["clasificados.moderar", "comunicaciones.moderar"])) return { pendientesModeracion: 0, pendientes: [], comentariosUltimaSemana: 0 };
  const [pend, total, comentarios] = await Promise.all([
    ctx.db.publicacion.findMany({ where: { estado: "PENDIENTE_MODERACION" }, include: { autor: { select: { nombre: true } } }, orderBy: { createdAt: "asc" }, take: 5 }),
    ctx.db.publicacion.count({ where: { estado: "PENDIENTE_MODERACION" } }),
    ctx.db.comentarioPublicacion.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
  ]);
  return {
    pendientesModeracion: total,
    pendientes: pend.map((p) => ({ id: p.id, titulo: p.titulo, autor: p.autor.nombre, createdAt: p.createdAt })),
    comentariosUltimaSemana: comentarios,
  };
}
