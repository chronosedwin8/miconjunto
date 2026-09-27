import { Prisma, type CategoriaPublicacion, type Publicacion } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso, type Canal } from "@/lib/notificaciones";
import { insensitive } from "@/lib/pagination";
import { normalizarDef, resolverUsuarios, usuarioEnSegmento, esVacia, type SegmentoDef } from "@/lib/segmentos";
import { ContenidoInvalido, limpiarContenido, resumenDe, textoPlano, primeraImagen, metaDe, type Bloque } from "./contenido";

export const CATEGORIAS_OFICIALES = ["AVISO", "NOTICIA", "EVENTO", "EMERGENCIA", "PERDIDO_ENCONTRADO"] as const;
export const CATEGORIAS_MURO = ["AVISO", "NOTICIA", "EVENTO", "EMERGENCIA", "CLASIFICADO", "PERDIDO_ENCONTRADO"] as const;
export const REACCIONES = [
  { tipo: "LIKE", emoji: "👍", label: "Me gusta" },
  { tipo: "GRACIAS", emoji: "🙏", label: "Gracias" },
  { tipo: "CORAZON", emoji: "❤️", label: "Me encanta" },
  { tipo: "IMPORTANTE", emoji: "❗", label: "Importante" },
] as const;
export type TipoReaccion = (typeof REACCIONES)[number]["tipo"];

/** ¿Gestiona el muro? (ve todas las publicaciones, incluidas las de otras audiencias). */
export function esGestorMuro(ctx: Pick<Ctx, "esSuperAdmin" | "permisos" | "unidadIds" | "userId" | "rolBase">) {
  return can(ctx, ["comunicaciones.publicar", "comunicaciones.moderar"]);
}

export function esModeradorClasificados(ctx: Pick<Ctx, "esSuperAdmin" | "permisos" | "unidadIds" | "userId" | "rolBase">) {
  return can(ctx, ["clasificados.moderar", "comunicaciones.moderar"]);
}

/** Definición de audiencia de una publicación (segmento guardado o ad hoc). `null` = todo el conjunto. */
export function audienciaDe(p: Pick<Publicacion, "segmentoId" | "audiencia">, segmentos: Map<string, unknown>): SegmentoDef | null {
  if (p.segmentoId) return normalizarDef(segmentos.get(p.segmentoId) ?? { unidades: ["__segmento_eliminado__"] });
  if (p.audiencia) {
    const d = normalizarDef(p.audiencia);
    return esVacia(d) ? null : d;
  }
  return null;
}

async function mapaSegmentos(ctx: Pick<Ctx, "db">, ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unicos.length) return new Map<string, unknown>();
  const segs = await ctx.db.segmento.findMany({ where: { id: { in: unicos }, deletedAt: undefined } });
  return new Map(segs.map((s) => [s.id, s.definicion as unknown]));
}

/** Filtra publicaciones visibles para el usuario según audiencia (cachea por definición). */
async function filtrarPorAudiencia<T extends Pick<Publicacion, "id" | "segmentoId" | "audiencia" | "autorId">>(ctx: Ctx, rows: T[]): Promise<T[]> {
  if (esGestorMuro(ctx)) return rows;
  const segs = await mapaSegmentos(ctx, rows.map((r) => r.segmentoId));
  const cache = new Map<string, boolean>();
  const out: T[] = [];
  for (const r of rows) {
    if (r.autorId === ctx.userId) {
      out.push(r);
      continue;
    }
    const def = audienciaDe(r, segs);
    if (!def) {
      out.push(r);
      continue;
    }
    const k = JSON.stringify(def);
    if (!cache.has(k)) cache.set(k, await usuarioEnSegmento(ctx, def, ctx.userId));
    if (cache.get(k)) out.push(r);
  }
  return out;
}

const vigente = (): Prisma.PublicacionWhereInput => ({ OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }] });

export type FiltrosFeed = { categoria?: string | null; q?: string | null; page?: number; pageSize?: number; incluirClasificados?: boolean };

/** Feed del muro: fijadas primero, luego recientes. Aplica visibilidad por audiencia en el servidor. */
export async function feedMuro(ctx: Ctx, f: FiltrosFeed = {}) {
  const pageSize = f.pageSize ?? 15;
  const page = Math.max(1, f.page ?? 1);
  const categoria = (CATEGORIAS_MURO as readonly string[]).includes(f.categoria ?? "") ? (f.categoria as CategoriaPublicacion) : null;
  const where: Prisma.PublicacionWhereInput = {
    estado: "PUBLICADA",
    AND: [vigente(), ...(f.q ? [{ OR: [{ titulo: insensitive(f.q) }, { resumen: insensitive(f.q) }] }] : [])],
    ...(categoria ? { categoria } : f.incluirClasificados === false ? { categoria: { not: "CLASIFICADO" } } : {}),
  };
  const candidatos = await ctx.db.publicacion.findMany({
    where,
    select: { id: true, segmentoId: true, audiencia: true, autorId: true },
    orderBy: [{ fijada: "desc" }, { createdAt: "desc" }],
    take: 400,
  });
  const visibles = await filtrarPorAudiencia(ctx, candidatos);
  const total = visibles.length;
  const ids = visibles.slice((page - 1) * pageSize, page * pageSize).map((v) => v.id);
  const rows = ids.length ? await cargarTarjetas(ctx, ids) : [];
  return { total, page, pageSize, items: ids.map((id) => rows.find((r) => r.id === id)!).filter(Boolean) };
}

/** Datos para las tarjetas del feed. */
export async function cargarTarjetas(ctx: Ctx, ids: string[]) {
  const [pubs, mias, leidas, reacc, coment] = await Promise.all([
    ctx.db.publicacion.findMany({ where: { id: { in: ids } }, include: { autor: { select: { nombre: true, fotoUrl: true } } } }),
    ctx.db.reaccionPublicacion.findMany({ where: { publicacionId: { in: ids }, usuarioId: ctx.userId }, select: { publicacionId: true, tipo: true } }),
    ctx.db.lecturaPublicacion.findMany({ where: { publicacionId: { in: ids }, usuarioId: ctx.userId }, select: { publicacionId: true } }),
    ctx.db.reaccionPublicacion.groupBy({ by: ["publicacionId"], where: { publicacionId: { in: ids } }, _count: { _all: true } }),
    ctx.db.comentarioPublicacion.groupBy({ by: ["publicacionId"], where: { publicacionId: { in: ids }, oculto: false }, _count: { _all: true } }),
  ]);
  const miaMap = new Map(mias.map((m) => [m.publicacionId, m.tipo]));
  const leidaSet = new Set(leidas.map((l) => l.publicacionId));
  const reMap = new Map(reacc.map((r) => [r.publicacionId, r._count._all]));
  const coMap = new Map(coment.map((c) => [c.publicacionId, c._count._all]));
  return pubs.map((p) => {
    const bloques = (Array.isArray(p.contenido) ? p.contenido : []) as Bloque[];
    return {
      id: p.id,
      titulo: p.titulo,
      resumen: p.resumen ?? resumenDe(bloques),
      categoria: p.categoria,
      estado: p.estado,
      fijada: p.fijada,
      permiteComentarios: p.permiteComentarios,
      venceEn: p.venceEn,
      createdAt: p.createdAt,
      autor: p.autor.nombre,
      autorId: p.autorId,
      imagen: p.imagenes[0] ?? primeraImagen(bloques),
      precio: p.precio ? Number(p.precio) : null,
      subcategoria: metaDe(p.contenido)?.subcategoria ?? null,
      conAudiencia: !!(p.segmentoId || p.audiencia),
      miReaccion: miaMap.get(p.id) ?? null,
      leida: leidaSet.has(p.id),
      reacciones: reMap.get(p.id) ?? 0,
      comentarios: coMap.get(p.id) ?? 0,
    };
  });
}

export type TarjetaPublicacion = Awaited<ReturnType<typeof cargarTarjetas>>[number];

/** Verifica que el usuario pueda ver la publicación (estado, vigencia y audiencia). */
export async function obtenerVisible(ctx: Ctx, id: string) {
  const p = await ctx.db.publicacion.findUnique({ where: { id }, include: { autor: { select: { nombre: true, fotoUrl: true } } } });
  if (!p) notFound("La publicación");
  const gestor = esGestorMuro(ctx) || (p.categoria === "CLASIFICADO" && esModeradorClasificados(ctx));
  if (gestor || p.autorId === ctx.userId) return p;
  if (p.estado !== "PUBLICADA") notFound("La publicación");
  if (p.venceEn && p.venceEn < new Date()) notFound("La publicación");
  const [visible] = await filtrarPorAudiencia(ctx, [p]);
  if (!visible) notFound("La publicación");
  return p;
}

export async function detallePublicacion(ctx: Ctx, id: string) {
  const p = await obtenerVisible(ctx, id);
  const moderador = can(ctx, "comunicaciones.moderar") || (p.categoria === "CLASIFICADO" && esModeradorClasificados(ctx));
  const [comentarios, reacciones, mia, lecturas] = await Promise.all([
    ctx.db.comentarioPublicacion.findMany({
      where: { publicacionId: id, ...(moderador ? {} : { OR: [{ oculto: false }, { autorId: ctx.userId }] }) },
      orderBy: { createdAt: "asc" },
    }),
    ctx.db.reaccionPublicacion.groupBy({ by: ["tipo"], where: { publicacionId: id }, _count: { _all: true } }),
    ctx.db.reaccionPublicacion.findFirst({ where: { publicacionId: id, usuarioId: ctx.userId } }),
    ctx.db.lecturaPublicacion.count({ where: { publicacionId: id } }),
  ]);
  return {
    publicacion: p,
    moderador,
    comentarios,
    reacciones: Object.fromEntries(reacciones.map((r) => [r.tipo, r._count._all])) as Record<string, number>,
    miReaccion: mia?.tipo ?? null,
    lecturas,
  };
}

/** Estadísticas de lectura (para quien publica): destinatarios, lecturas y % de alcance. */
export async function estadisticasLectura(ctx: Ctx, id: string) {
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p) notFound("La publicación");
  const segs = await mapaSegmentos(ctx, [p.segmentoId]);
  const def = audienciaDe(p, segs);
  const [destinatarios, lecturas] = await Promise.all([
    resolverUsuarios(ctx, def ?? {}),
    ctx.db.lecturaPublicacion.findMany({ where: { publicacionId: id }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  const usuarios = await ctx.db.membresiaConjunto.findMany({
    where: { usuarioId: { in: lecturas.map((l) => l.usuarioId) } },
    select: { usuarioId: true, usuario: { select: { nombre: true } } },
  });
  const nombres = new Map(usuarios.map((u) => [u.usuarioId, u.usuario.nombre]));
  const total = destinatarios.length;
  return {
    destinatarios: total,
    lecturas: lecturas.length,
    porcentaje: total ? Math.min(100, (lecturas.length / total) * 100) : 0,
    lectores: lecturas.slice(0, 50).map((l) => ({ nombre: nombres.get(l.usuarioId) ?? "Usuario", fecha: l.createdAt })),
  };
}

export async function registrarLectura(ctx: Pick<Ctx, "db" | "conjuntoId" | "userId">, publicacionId: string) {
  if (ctx.userId.startsWith("api:") || ctx.userId === "sistema") return;
  await ctx.db.lecturaPublicacion.upsert({
    where: { publicacionId_usuarioId: { publicacionId, usuarioId: ctx.userId } },
    create: { conjuntoId: ctx.conjuntoId, publicacionId, usuarioId: ctx.userId },
    update: {},
  });
}

// ── Escritura ──

export type PublicacionInput = {
  id?: string | null;
  titulo: string;
  categoria: CategoriaPublicacion;
  contenido: unknown;
  fijada?: boolean;
  permiteComentarios?: boolean;
  venceEn?: Date | null;
  segmentoId?: string | null;
  audiencia?: unknown;
  precio?: number | null;
  imagenes?: string[];
  notificar?: boolean;
};

function limpiar(ctx: Pick<Ctx, "conjuntoId">, raw: unknown) {
  try {
    return limpiarContenido(raw, ctx.conjuntoId);
  } catch (e) {
    if (e instanceof ContenidoInvalido) throw new AppError(e.message, 400, { contenido: e.message });
    throw e;
  }
}

export async function guardarPublicacion(ctx: Ctx, input: PublicacionInput) {
  const esClasificado = input.categoria === "CLASIFICADO";
  const antes = input.id ? await ctx.db.publicacion.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !antes) notFound("La publicación");

  // Autorización por categoría (en servidor).
  if (esClasificado) {
    if (!can(ctx, ["clasificados.publicar", "clasificados.moderar"])) throw new AppError("No tienes permiso para publicar clasificados.", 403);
  } else if (input.categoria === "PERDIDO_ENCONTRADO") {
    if (!can(ctx, ["comunicaciones.publicar", "clasificados.publicar"])) throw new AppError("No tienes permiso para publicar.", 403);
  } else if (!can(ctx, "comunicaciones.publicar")) {
    throw new AppError("Solo la administración puede publicar avisos oficiales.", 403);
  }
  if (antes && antes.autorId !== ctx.userId && !esGestorMuro(ctx)) throw new AppError("Solo el autor o la administración pueden editar esta publicación.", 403);

  const bloques = limpiar(ctx, input.contenido);
  const imagenes = (input.imagenes ?? []).filter((u) => u.startsWith(`/api/files/${ctx.conjuntoId}/`) && !u.includes("..")).slice(0, 8);
  if (!bloques.some((b) => b.tipo !== "meta") && !imagenes.length) throw new AppError("Escribe el contenido de la publicación.", 400, { contenido: "Agrega al menos un bloque" });

  const oficial = can(ctx, "comunicaciones.publicar");
  // Audiencia: solo quien publica oficialmente puede segmentar. Clasificados siempre para todos.
  let segmentoId: string | null = null;
  let audiencia: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
  if (oficial && !esClasificado) {
    if (input.segmentoId) {
      const s = await ctx.db.segmento.findUnique({ where: { id: input.segmentoId } });
      if (!s) notFound("El segmento");
      segmentoId = s.id;
    } else if (input.audiencia) {
      const def = normalizarDef(input.audiencia);
      if (!esVacia(def)) audiencia = def as Prisma.InputJsonValue;
    }
  }
  const encuesta = bloques.find((b) => b.tipo === "encuesta");
  if (encuesta && encuesta.tipo === "encuesta") {
    const e = await ctx.db.encuesta.findUnique({ where: { id: encuesta.encuestaId } });
    if (!e) throw new AppError("La encuesta enlazada no existe.", 400, { contenido: "Encuesta no encontrada" });
  }

  const estado = esClasificado && !esModeradorClasificados(ctx) ? "PENDIENTE_MODERACION" : antes?.estado === "BORRADOR" || !antes ? "PUBLICADA" : antes.estado;
  const data = {
    titulo: input.titulo.trim(),
    contenido: bloques as unknown as Prisma.InputJsonValue,
    resumen: resumenDe(bloques) || null,
    categoria: input.categoria,
    fijada: oficial && !esClasificado ? !!input.fijada : false,
    permiteComentarios: input.permiteComentarios ?? true,
    venceEn: input.venceEn ?? null,
    segmentoId,
    audiencia,
    precio: esClasificado && input.precio != null ? input.precio : null,
    imagenes,
    encuestaId: encuesta && encuesta.tipo === "encuesta" ? encuesta.encuestaId : null,
    // Editar un clasificado lo devuelve a moderación (evita cambiar el contenido después de aprobado).
    estado: esClasificado && antes && !esModeradorClasificados(ctx) ? ("PENDIENTE_MODERACION" as const) : estado,
  };

  const p = antes
    ? await ctx.db.publicacion.update({ where: { id: antes.id }, data })
    : await ctx.db.publicacion.create({ data: { ...data, conjuntoId: ctx.conjuntoId, autorId: ctx.userId } });
  await audit(ctx, antes ? "editar" : "crear", "Publicacion", p.id, antes ? { titulo: antes.titulo, estado: antes.estado } : undefined, { titulo: p.titulo, categoria: p.categoria, estado: p.estado });

  if (!antes && p.estado === "PUBLICADA") {
    await emit({ tipo: "publicacion.creada", conjuntoId: ctx.conjuntoId, data: { id: p.id, categoria: p.categoria }, actorId: ctx.userId });
    if (input.notificar || p.categoria === "AVISO" || p.categoria === "EMERGENCIA") await notificarAudiencia(ctx, p);
  }
  if (p.estado === "PENDIENTE_MODERACION" && antes?.estado !== "PENDIENTE_MODERACION") {
    const mods = (await usuariosConPermiso(ctx.conjuntoId, ["clasificados.moderar", "comunicaciones.moderar"])).filter((u) => u !== ctx.userId);
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: mods, titulo: "Clasificado por revisar", cuerpo: `${ctx.nombre}: ${p.titulo}`, enlace: "/clasificados/moderacion", tipo: "MODERACION" });
  }
  return p;
}

/** Push (y WhatsApp para emergencias o avisos fijados) a la audiencia de la publicación. */
export async function notificarAudiencia(ctx: Ctx, p: Publicacion) {
  const segs = await mapaSegmentos(ctx, [p.segmentoId]);
  const def = audienciaDe(p, segs);
  const usuarios = (await resolverUsuarios(ctx, def ?? {})).filter((u) => u !== ctx.userId);
  if (!usuarios.length) return 0;
  const canales: Canal[] = p.categoria === "EMERGENCIA" || p.fijada ? ["push", "whatsapp"] : ["push"];
  const prefijo = p.categoria === "EMERGENCIA" ? "🚨 " : p.categoria === "AVISO" ? "📢 " : "";
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: `${prefijo}${p.titulo}`,
    cuerpo: (p.resumen ?? "").slice(0, 180) || "Nueva publicación en el muro",
    enlace: `/muro/${p.id}`,
    tipo: p.categoria === "EMERGENCIA" ? "EMERGENCIA" : "MURO",
    canales,
  });
  return usuarios.length;
}

export async function eliminarPublicacion(ctx: Ctx, id: string) {
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p) notFound("La publicación");
  const moderador = can(ctx, "comunicaciones.moderar") || (p.categoria === "CLASIFICADO" && esModeradorClasificados(ctx));
  if (p.autorId !== ctx.userId && !moderador && !can(ctx, "comunicaciones.publicar")) throw new AppError("No puedes eliminar esta publicación.", 403);
  await ctx.db.publicacion.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Publicacion", id, { titulo: p.titulo, estado: p.estado });
  return true;
}

export async function fijarPublicacion(ctx: Ctx, id: string, fijada: boolean) {
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p) notFound("La publicación");
  if (p.categoria === "CLASIFICADO") throw new AppError("Los clasificados no se pueden fijar.");
  await ctx.db.publicacion.update({ where: { id }, data: { fijada } });
  return true;
}

export async function archivarPublicacion(ctx: Ctx, id: string) {
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p) notFound("La publicación");
  if (p.autorId !== ctx.userId && !esGestorMuro(ctx) && !(p.categoria === "CLASIFICADO" && esModeradorClasificados(ctx))) throw new AppError("No puedes archivar esta publicación.", 403);
  await ctx.db.publicacion.update({ where: { id }, data: { estado: "ARCHIVADA", fijada: false } });
  await audit(ctx, "archivar", "Publicacion", id, { estado: p.estado }, { estado: "ARCHIVADA" });
  return true;
}

/** Aprobación o rechazo de clasificados (moderación). Notifica al autor. */
export async function moderarPublicacion(ctx: Ctx, id: string, decision: "APROBAR" | "RECHAZAR", motivo?: string | null) {
  if (!esModeradorClasificados(ctx)) throw new AppError("No tienes permiso para moderar.", 403);
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p) notFound("La publicación");
  if (p.estado !== "PENDIENTE_MODERACION") throw new AppError("La publicación ya fue moderada.");
  if (decision === "RECHAZAR" && !motivo?.trim()) throw new AppError("Indica el motivo del rechazo.", 400, { motivo: "Obligatorio" });
  const estado = decision === "APROBAR" ? "PUBLICADA" : "RECHAZADA";
  await ctx.db.publicacion.update({ where: { id }, data: { estado } });
  await audit(ctx, decision === "APROBAR" ? "aprobar" : "rechazar", "Publicacion", id, { estado: p.estado }, { estado, motivo });
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: [p.autorId],
    titulo: decision === "APROBAR" ? "Tu clasificado fue publicado" : "Tu clasificado no fue aprobado",
    cuerpo: decision === "APROBAR" ? p.titulo : `${p.titulo}. Motivo: ${motivo}`,
    enlace: decision === "APROBAR" ? `/muro/${p.id}` : "/clasificados?mis=1",
    tipo: "MODERACION",
  });
  return true;
}

export async function reaccionar(ctx: Ctx, publicacionId: string, tipo: TipoReaccion) {
  await obtenerVisible(ctx, publicacionId);
  const actual = await ctx.db.reaccionPublicacion.findFirst({ where: { publicacionId, usuarioId: ctx.userId, deletedAt: undefined } });
  if (actual && actual.tipo === tipo && !actual.deletedAt) {
    await ctx.db.reaccionPublicacion.delete({ where: { id: actual.id } });
    return { tipo: null };
  }
  if (actual) await ctx.db.reaccionPublicacion.update({ where: { id: actual.id }, data: { tipo, deletedAt: null } });
  else await ctx.db.reaccionPublicacion.create({ data: { conjuntoId: ctx.conjuntoId, publicacionId, usuarioId: ctx.userId, tipo } });
  return { tipo };
}

export async function comentar(ctx: Ctx, publicacionId: string, contenido: string) {
  const p = await obtenerVisible(ctx, publicacionId);
  if (!p.permiteComentarios) throw new AppError("Esta publicación no admite comentarios.");
  if (p.estado !== "PUBLICADA") throw new AppError("Solo se puede comentar publicaciones publicadas.");
  const texto = textoPlano(contenido).slice(0, 1000);
  if (!texto) throw new AppError("Escribe un comentario.", 400, { contenido: "Obligatorio" });
  const c = await ctx.db.comentarioPublicacion.create({
    data: { conjuntoId: ctx.conjuntoId, publicacionId, autorId: ctx.userId, autorNombre: ctx.nombre, contenido: texto },
  });
  if (p.autorId !== ctx.userId && p.categoria === "CLASIFICADO") {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [p.autorId], titulo: "Nuevo comentario en tu clasificado", cuerpo: `${ctx.nombre}: ${texto.slice(0, 120)}`, enlace: `/muro/${p.id}`, tipo: "MURO" });
  }
  return c;
}

export async function moderarComentario(ctx: Ctx, comentarioId: string, oculto: boolean) {
  const c = await ctx.db.comentarioPublicacion.findUnique({ where: { id: comentarioId }, include: { publicacion: { select: { categoria: true } } } });
  if (!c) notFound("El comentario");
  const puede = can(ctx, "comunicaciones.moderar") || (c.publicacion.categoria === "CLASIFICADO" && esModeradorClasificados(ctx));
  if (!puede) throw new AppError("No tienes permiso para moderar comentarios.", 403);
  await ctx.db.comentarioPublicacion.update({ where: { id: comentarioId }, data: { oculto, moderadoPorId: ctx.userId } });
  await audit(ctx, oculto ? "ocultar" : "mostrar", "ComentarioPublicacion", comentarioId, { oculto: c.oculto, contenido: c.contenido }, { oculto });
  return true;
}

export async function eliminarComentario(ctx: Ctx, comentarioId: string) {
  const c = await ctx.db.comentarioPublicacion.findUnique({ where: { id: comentarioId } });
  if (!c) notFound("El comentario");
  if (c.autorId !== ctx.userId && !can(ctx, "comunicaciones.moderar")) throw new AppError("Solo puedes eliminar tus comentarios.", 403);
  await ctx.db.comentarioPublicacion.update({ where: { id: comentarioId }, data: { deletedAt: new Date() } });
  return true;
}

/** Pendientes de moderación (clasificados) y comentarios ocultos recientes. */
export async function pendientesModeracion(ctx: Ctx) {
  return ctx.db.publicacion.findMany({
    where: { estado: "PENDIENTE_MODERACION" },
    include: { autor: { select: { nombre: true } } },
    orderBy: { createdAt: "asc" },
  });
}
