import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { insensitive } from "@/lib/pagination";
import { metaDe, SUBCATEGORIAS_CLASIFICADO } from "@/lib/muro/contenido";
import { cargarTarjetas } from "@/lib/muro/service";

/** Clasificados vecinales (Publicacion CLASIFICADO, moderados). Los objetos perdidos viven en lib/objetos-perdidos. */
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
