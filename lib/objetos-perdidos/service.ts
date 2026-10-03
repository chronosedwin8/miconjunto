import type { CategoriaObjeto, EstadoObjetoPerdido, ObjetoPerdido, Prisma, TipoObjetoPerdido } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permisos";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { insensitive } from "@/lib/pagination";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { nextConsecutivo } from "@/lib/consecutivo";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { saveFile } from "@/lib/storage";
import { textoPlano } from "@/lib/muro/contenido";
import { TZ } from "@/lib/format";
import {
  CATEGORIAS_OBJETO,
  ESTADOS_OBJETO,
  ESTADOS_ACTIVOS,
  ESTADOS_FINALES,
  FIRMA_RE,
  UMBRAL_SUGERENCIA,
  admiteCustodia,
  admiteDisposicion,
  admiteEntrega,
  admiteReclamo,
  calcularVencimiento,
  categoriaLabel,
  custodiaVencida,
  formatoCodigo,
  mejoresCoincidencias,
  accionVencimiento,
} from "./reglas";

/**
 * Objetos perdidos y encontrados: reportes con fotos, custodia en portería/administración,
 * coincidencias automáticas perdido ↔ encontrado, reclamos verificados con rasgos privados,
 * entrega con documento y firma, y vencimientos (disposición y cierre automático).
 *
 * Privacidad: `rasgosPrivados`, documento, firma y datos de quien reporta o reclama solo los ven
 * quien reportó (lo suyo) y quien gestiona (`objetos.gestionar`). Las vistas públicas usan `aPublico`.
 */

type DB = Ctx["db"];
const ENLACE = "/objetos-perdidos";

export function esGestorObjetos(ctx: Pick<Ctx, "esSuperAdmin" | "permisos" | "unidadIds" | "userId" | "rolBase">) {
  return can(ctx, "objetos.gestionar");
}

function usuarioReal(ctx: Pick<Ctx, "userId">) {
  return ctx.userId === "sistema" || ctx.userId.startsWith("api:") ? null : ctx.userId;
}

const limpio = (s: string | null | undefined, max: number) => {
  const t = s ? textoPlano(s).slice(0, max).trim() : "";
  return t || null;
};

function validarFotos(ctx: Ctx, fotos: string[]) {
  const prefijo = `/api/files/${ctx.conjuntoId}/`;
  const unicas = [...new Set(fotos.filter(Boolean))];
  if (unicas.length > 6) throw new AppError("Máximo 6 fotos por reporte.", 400, { fotos: "Máximo 6 fotos" });
  for (const u of unicas) {
    if (!u.startsWith(prefijo) || u.includes("..")) throw new AppError("Una de las fotos no es válida. Súbela de nuevo.", 400, { fotos: "Súbela de nuevo" });
  }
  return unicas;
}

// ───────────────────────── Proyección pública ─────────────────────────

/** Campos seguros para listas (nunca rasgos privados, documento, firma ni receptor de la entrega). */
const SELECT_LISTA = {
  id: true,
  codigo: true,
  tipo: true,
  categoria: true,
  titulo: true,
  descripcion: true,
  color: true,
  marca: true,
  lugar: true,
  zonaId: true,
  fecha: true,
  fotoUrl: true,
  fotos: true,
  contacto: true,
  recompensa: true,
  estado: true,
  custodia: true,
  recibidoEn: true,
  venceEn: true,
  reportadoPorId: true,
  unidadId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ObjetoPerdidoSelect;

export type ObjetoLista = Prisma.ObjetoPerdidoGetPayload<{ select: typeof SELECT_LISTA }>;

export function tituloDe(o: { titulo?: string | null; descripcion: string }) {
  return o.titulo?.trim() || (o.descripcion.length > 60 ? `${o.descripcion.slice(0, 57)}…` : o.descripcion);
}

export function fotosDe(o: { fotos?: string[] | null; fotoUrl?: string | null }) {
  const f = [...(o.fotos ?? [])];
  if (o.fotoUrl && !f.includes(o.fotoUrl)) f.unshift(o.fotoUrl);
  return f;
}

/** Vista pública de un objeto (API y tarjetas). Rasgos privados solo para quien reportó o gestiona. */
export function aPublico(ctx: Ctx, o: ObjetoLista & { rasgosPrivados?: string | null }) {
  const propio = !!o.reportadoPorId && o.reportadoPorId === ctx.userId;
  const gestor = esGestorObjetos(ctx);
  return {
    id: o.id,
    codigo: o.codigo,
    tipo: o.tipo,
    categoria: o.categoria,
    titulo: tituloDe(o),
    descripcion: o.descripcion,
    color: o.color,
    marca: o.marca,
    lugar: o.lugar,
    zonaId: o.zonaId,
    fecha: o.fecha,
    fotos: fotosDe(o),
    contacto: o.contacto,
    recompensa: o.recompensa,
    estado: o.estado,
    custodia: o.custodia,
    recibidoEn: o.recibidoEn,
    venceEn: propio || gestor ? o.venceEn : null,
    propio,
    ...(propio || gestor ? { rasgosPrivados: o.rasgosPrivados ?? null } : {}),
    creado: o.createdAt,
  };
}

// ───────────────────────── Reportar ─────────────────────────

export type ReporteInput = {
  tipo: TipoObjetoPerdido;
  categoria: CategoriaObjeto;
  titulo: string;
  descripcion: string;
  rasgosPrivados?: string | null;
  color?: string | null;
  marca?: string | null;
  lugar?: string | null;
  zonaId?: string | null;
  fecha?: Date | null;
  fotos?: string[];
  contacto?: string | null;
  recompensa?: string | null;
  /** Solo gestores: si se indica en un ENCONTRADO, queda directamente en custodia. */
  custodia?: string | null;
};

async function siguienteCodigo(ctx: Ctx) {
  const anio = Number(formatInTimeZone(new Date(), TZ, "yyyy"));
  return formatoCodigo(anio, await nextConsecutivo(ctx.conjuntoId, "OBJETO_PERDIDO", anio));
}

export async function reportarObjeto(ctx: Ctx, input: ReporteInput) {
  if (!can(ctx, ["objetos.reportar", "objetos.gestionar"])) throw new AppError("No tienes permiso para reportar objetos.", 403);
  const titulo = limpio(input.titulo, 80);
  const descripcion = limpio(input.descripcion, 600);
  if (!titulo || titulo.length < 3) throw new AppError("Escribe qué es (mínimo 3 letras).", 400, { titulo: "Obligatorio" });
  if (!descripcion || descripcion.length < 5) throw new AppError("Describe el objeto.", 400, { descripcion: "Describe el objeto" });
  const fotos = validarFotos(ctx, input.fotos ?? []);
  const ahora = new Date();
  const fecha = input.fecha && input.fecha.getTime() <= ahora.getTime() + 3_600_000 ? input.fecha : ahora;
  let lugar = limpio(input.lugar, 120);
  if (input.zonaId) {
    const zona = await ctx.db.zonaComun.findFirst({ where: { id: input.zonaId }, select: { nombre: true } });
    if (!zona) throw new AppError("La zona no existe.", 400, { zonaId: "Zona no válida" });
    lugar ??= zona.nombre;
  }
  const gestor = esGestorObjetos(ctx);
  const custodia = gestor && input.tipo === "ENCONTRADO" ? limpio(input.custodia, 120) : null;
  const cfg = conjuntoConfig(ctx).objetosPerdidos;
  const autor = usuarioReal(ctx);
  const o = await ctx.db.objetoPerdido.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      codigo: await siguienteCodigo(ctx),
      tipo: input.tipo,
      categoria: input.categoria,
      titulo,
      descripcion,
      rasgosPrivados: limpio(input.rasgosPrivados, 600),
      color: limpio(input.color, 40),
      marca: limpio(input.marca, 60),
      lugar,
      zonaId: input.zonaId ?? null,
      fecha,
      fotos,
      fotoUrl: fotos[0] ?? null,
      contacto: limpio(input.contacto, 120),
      recompensa: input.tipo === "PERDIDO" ? limpio(input.recompensa, 120) : null,
      reportadoPorId: autor,
      unidadId: ctx.unidadIds[0] ?? null,
      estado: custodia ? "EN_CUSTODIA" : "ABIERTO",
      custodia,
      recibidoPorId: custodia ? autor : null,
      recibidoEn: custodia ? ahora : null,
      venceEn: input.tipo === "PERDIDO" ? calcularVencimiento("PERDIDO", ahora, cfg) : custodia ? calcularVencimiento("ENCONTRADO", ahora, cfg) : null,
    },
  });
  await audit(ctx, "reportar", "ObjetoPerdido", o.id, undefined, { codigo: o.codigo, tipo: o.tipo, categoria: o.categoria, titulo: o.titulo, estado: o.estado });
  await emit({ tipo: "objeto.reportado", conjuntoId: ctx.conjuntoId, actorId: autor, data: { id: o.id, codigo: o.codigo, tipo: o.tipo, categoria: o.categoria, estado: o.estado } });

  let coincidencias = 0;
  if (o.tipo === "ENCONTRADO") {
    coincidencias = await avisarDuenosPosibles(ctx, o);
    if (!custodia) {
      // Un vecino lo tiene: avisar a portería/administración para coordinar la custodia.
      const gestores = (await usuariosConPermiso(ctx.conjuntoId, ["objetos.gestionar"])).filter((u) => u !== autor);
      await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: gestores, titulo: `Objeto encontrado: ${tituloDe(o)}`, cuerpo: `${o.codigo} · ${o.lugar ?? "lugar sin indicar"}. Coordina que lo entreguen en portería.`, enlace: `${ENLACE}/${o.id}`, tipo: "OBJETO_PERDIDO" });
    }
  } else {
    coincidencias = (await coincidenciasDe(ctx, o)).length;
  }
  return { ...o, coincidencias };
}

// ───────────────────────── Coincidencias ─────────────────────────

/** Candidatos de la contraparte (tipo opuesto, activos, últimos 6 meses). */
async function candidatos(db: DB, o: Pick<ObjetoPerdido, "id" | "tipo">) {
  const desde = new Date(Date.now() - 180 * 86_400_000);
  return db.objetoPerdido.findMany({
    where: {
      id: { not: o.id },
      tipo: o.tipo === "PERDIDO" ? "ENCONTRADO" : "PERDIDO",
      estado: o.tipo === "PERDIDO" ? { in: ["ABIERTO", "EN_CUSTODIA"] } : "ABIERTO",
      fecha: { gte: desde },
    },
    select: SELECT_LISTA,
    orderBy: { fecha: "desc" },
    take: 400,
  });
}

/** Sugerencias "Puede ser este" para un reporte (ordenadas por puntaje). */
export async function coincidenciasDe(ctx: Ctx, o: ObjetoLista | ObjetoPerdido, max = 5) {
  if (!ESTADOS_ACTIVOS.includes(o.estado)) return [];
  return mejoresCoincidencias(o, await candidatos(ctx.db, o), { max });
}

/** Al reportarse o recibirse un objeto encontrado, avisa a los dueños de pérdidas parecidas. */
async function avisarDuenosPosibles(ctx: Ctx, encontrado: ObjetoPerdido) {
  const matches = await coincidenciasDe(ctx, encontrado, 10);
  let n = 0;
  for (const m of matches) {
    const dueno = m.objeto.reportadoPorId;
    if (!dueno || dueno === ctx.userId || m.puntaje < UMBRAL_SUGERENCIA) continue;
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [dueno],
      titulo: `¿Es tuyo? Encontraron: ${tituloDe(encontrado)}`,
      cuerpo: `Se parece a lo que reportaste (${tituloDe(m.objeto)}). Revísalo y, si es tuyo, reclámalo.`,
      enlace: `${ENLACE}/${encontrado.id}`,
      tipo: "OBJETO_PERDIDO",
      canales: ["push", "email"],
      data: { objetoId: encontrado.id, perdidoId: m.objeto.id, puntaje: m.puntaje },
    });
    n++;
  }
  return n;
}

// ───────────────────────── Listado ─────────────────────────

export const VISTAS = ["abiertos", "perdidos", "encontrados", "custodia", "mis", "historial", "atender"] as const;
export type Vista = (typeof VISTAS)[number];

export type FiltrosObjetos = {
  vista?: string | null;
  q?: string | null;
  categoria?: string | null;
  tipo?: string | null;
  estado?: string | null;
  zonaId?: string | null;
  /** Últimos N días según la fecha del reporte. */
  dias?: number | null;
  take?: number;
  skip?: number;
};

export function whereObjetos(ctx: Ctx, f: FiltrosObjetos): Prisma.ObjetoPerdidoWhereInput {
  const vista = (VISTAS as readonly string[]).includes(f.vista ?? "") ? (f.vista as Vista) : "abiertos";
  const gestor = esGestorObjetos(ctx);
  const mios: Prisma.ObjetoPerdidoWhereInput = { OR: [{ reportadoPorId: ctx.userId }, { reclamos: { some: { usuarioId: ctx.userId, deletedAt: null } } }] };
  const and: Prisma.ObjetoPerdidoWhereInput[] = [];
  switch (vista) {
    case "abiertos":
      and.push({ estado: { in: [...ESTADOS_ACTIVOS] } });
      break;
    case "perdidos":
      and.push({ tipo: "PERDIDO", estado: { in: [...ESTADOS_ACTIVOS] } });
      break;
    case "encontrados":
      and.push({ tipo: "ENCONTRADO", estado: { in: [...ESTADOS_ACTIVOS] } });
      break;
    case "custodia":
      and.push({ tipo: "ENCONTRADO", estado: { in: ["EN_CUSTODIA", "RECLAMADO"] } });
      break;
    case "mis":
      and.push(mios);
      break;
    case "historial":
      and.push({ estado: { in: [...ESTADOS_FINALES] } });
      if (!gestor) and.push(mios);
      break;
    case "atender":
      if (!gestor) and.push({ id: "__ninguno__" });
      else and.push({ OR: [{ reclamos: { some: { estado: "PENDIENTE", deletedAt: null } } }, { estado: "RECLAMADO" }, { tipo: "ENCONTRADO", estado: "EN_CUSTODIA", venceEn: { lte: new Date() } }, { tipo: "ENCONTRADO", estado: "ABIERTO" }] });
      break;
  }
  if (f.tipo === "PERDIDO" || f.tipo === "ENCONTRADO") and.push({ tipo: f.tipo });
  if (f.categoria && (CATEGORIAS_OBJETO as readonly string[]).includes(f.categoria)) and.push({ categoria: f.categoria as CategoriaObjeto });
  if (f.estado && (ESTADOS_OBJETO as readonly string[]).includes(f.estado)) and.push({ estado: f.estado as EstadoObjetoPerdido });
  if (f.zonaId) and.push({ zonaId: f.zonaId });
  if (f.dias && f.dias > 0) and.push({ fecha: { gte: new Date(Date.now() - f.dias * 86_400_000) } });
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [{ titulo: insensitive(q) }, { descripcion: insensitive(q) }, { lugar: insensitive(q) }, { marca: insensitive(q) }, { color: insensitive(q) }, { codigo: insensitive(q) }],
    });
  }
  return { AND: and };
}

export async function listarObjetos(ctx: Ctx, f: FiltrosObjetos = {}) {
  const where = whereObjetos(ctx, f);
  const [total, items] = await Promise.all([
    ctx.db.objetoPerdido.count({ where }),
    ctx.db.objetoPerdido.findMany({
      where,
      select: { ...SELECT_LISTA, reclamos: { where: { deletedAt: null }, select: { estado: true, usuarioId: true } } },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      take: Math.min(f.take ?? 60, 200),
      skip: f.skip ?? 0,
    }),
  ]);
  const gestor = esGestorObjetos(ctx);
  // Para los reportes de pérdida propios y activos: cuántas posibles coincidencias hay.
  const propiosPerdidos = items.filter((o) => o.tipo === "PERDIDO" && o.reportadoPorId === ctx.userId && o.estado === "ABIERTO");
  const pool = propiosPerdidos.length ? await candidatos(ctx.db, { id: "", tipo: "PERDIDO" }) : [];
  const ahora = new Date();
  return {
    total,
    items: items.map(({ reclamos, ...o }) => ({
      ...o,
      titulo: tituloDe(o),
      fotos: fotosDe(o),
      propio: !!o.reportadoPorId && o.reportadoPorId === ctx.userId,
      miReclamo: reclamos.find((r) => r.usuarioId === ctx.userId)?.estado ?? null,
      reclamosPendientes: gestor ? reclamos.filter((r) => r.estado === "PENDIENTE").length : 0,
      vencido: gestor && custodiaVencida(o, ahora),
      porRecibir: gestor && o.tipo === "ENCONTRADO" && o.estado === "ABIERTO",
      coincidencias: o.tipo === "PERDIDO" && o.reportadoPorId === ctx.userId && o.estado === "ABIERTO" ? mejoresCoincidencias(o, pool).length : 0,
    })),
  };
}

export type ObjetoTarjeta = Awaited<ReturnType<typeof listarObjetos>>["items"][number];

/** Conteos para las pestañas. */
export async function conteosObjetos(ctx: Ctx) {
  const gestor = esGestorObjetos(ctx);
  const [abiertos, custodia, atender] = await Promise.all([
    ctx.db.objetoPerdido.count({ where: whereObjetos(ctx, { vista: "abiertos" }) }),
    ctx.db.objetoPerdido.count({ where: whereObjetos(ctx, { vista: "custodia" }) }),
    gestor ? ctx.db.objetoPerdido.count({ where: whereObjetos(ctx, { vista: "atender" }) }) : Promise.resolve(0),
  ]);
  return { abiertos, custodia, atender };
}

// ───────────────────────── Detalle ─────────────────────────

async function nombres(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x && x !== "sistema" && !x.startsWith("api:")))];
  if (!unicos.length) return new Map<string, string>();
  const us = await prisma.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, nombre: true } });
  return new Map(us.map((u) => [u.id, u.nombre]));
}

export type EventoLinea = { fecha: Date; titulo: string; detalle?: string | null; tono: "default" | "success" | "warning" | "destructive" | "info" };

/** Detalle con permisos calculados. Lanza 404 si no existe en el conjunto. */
export async function obtenerObjeto(ctx: Ctx, id: string) {
  const o = await ctx.db.objetoPerdido.findFirst({ where: { id }, include: { reclamos: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } } });
  if (!o) notFound("El objeto");
  const gestor = esGestorObjetos(ctx);
  const propio = !!o.reportadoPorId && o.reportadoPorId === ctx.userId;
  const verPrivado = gestor || propio;
  const reclamosVisibles = gestor ? o.reclamos : o.reclamos.filter((r) => r.usuarioId === ctx.userId);
  const miReclamo = o.reclamos.filter((r) => r.usuarioId === ctx.userId).at(-1) ?? null;
  const n = await nombres([o.reportadoPorId, o.recibidoPorId, o.entregadoPorId, ...o.reclamos.flatMap((r) => [r.usuarioId, r.resueltoPorId])]);
  const unidadIds = [o.unidadId, ...o.reclamos.map((r) => r.unidadId)].filter((x): x is string => !!x);
  const unidades = gestor && unidadIds.length ? new Map((await ctx.db.unidad.findMany({ where: { id: { in: unidadIds } }, select: { id: true, codigo: true } })).map((u) => [u.id, u.codigo])) : new Map<string, string>();
  const zona = o.zonaId ? await ctx.db.zonaComun.findFirst({ where: { id: o.zonaId }, select: { nombre: true } }) : null;

  // Para verificar reclamos: rasgos privados de los reportes de pérdida activos de cada reclamante.
  const perdidasReclamantes = gestor && o.tipo === "ENCONTRADO" && o.reclamos.length
    ? await ctx.db.objetoPerdido.findMany({
        where: { tipo: "PERDIDO", reportadoPorId: { in: o.reclamos.map((r) => r.usuarioId) }, estado: { in: ["ABIERTO", "CERRADO"] } },
        select: { id: true, codigo: true, titulo: true, descripcion: true, rasgosPrivados: true, reportadoPorId: true, categoria: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  const coincidencias = await coincidenciasDe(ctx, o, 6);
  const nombreDe = (uid: string | null | undefined) => (uid ? (n.get(uid) ?? "Usuario") : "Sistema");

  // Línea de tiempo (derivada de los campos y los reclamos).
  const linea: EventoLinea[] = [];
  linea.push({
    fecha: o.createdAt,
    titulo: o.tipo === "PERDIDO" ? "Reporte de pérdida" : "Reporte de objeto encontrado",
    detalle: verPrivado ? `Por ${nombreDe(o.reportadoPorId)}${o.unidadId && unidades.get(o.unidadId) ? ` (${unidades.get(o.unidadId)})` : ""}` : "Por un vecino",
    tono: "info",
  });
  if (o.recibidoEn) linea.push({ fecha: o.recibidoEn, titulo: `Recibido en custodia${o.custodia ? `: ${o.custodia}` : ""}`, detalle: gestor || propio ? `Recibió ${nombreDe(o.recibidoPorId)}` : null, tono: "info" });
  for (const r of o.reclamos) {
    const visible = gestor || r.usuarioId === ctx.userId;
    linea.push({ fecha: r.createdAt, titulo: visible ? `Reclamo de ${r.usuarioId === ctx.userId ? "tu parte" : nombreDe(r.usuarioId)}` : "Alguien reclamó este objeto", tono: "warning" });
    if (r.resueltoEn && visible) {
      linea.push({ fecha: r.resueltoEn, titulo: r.estado === "APROBADO" ? "Reclamo aprobado" : "Reclamo rechazado", detalle: r.respuesta, tono: r.estado === "APROBADO" ? "success" : "destructive" });
    }
  }
  if (o.entregadoEn) linea.push({ fecha: o.entregadoEn, titulo: "Entregado a su dueño", detalle: gestor ? `A ${o.entregadoA ?? "—"} · entregó ${nombreDe(o.entregadoPorId)}` : propio && o.entregadoA ? `A ${o.entregadoA}` : null, tono: "success" });
  else if (o.estado === "DEVUELTO") linea.push({ fecha: o.updatedAt, titulo: o.tipo === "PERDIDO" ? "¡Apareció!" : "Devuelto a su dueño", detalle: verPrivado ? o.disposicion ?? (o.entregadoA ? `A ${o.entregadoA}` : null) : null, tono: "success" });
  if (o.estado === "CERRADO" || o.estado === "DONADO") linea.push({ fecha: o.updatedAt, titulo: o.estado === "DONADO" ? "Donado" : "Reporte cerrado", detalle: o.disposicion, tono: "default" });
  linea.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  const reclamoAprobado = o.reclamos.find((r) => r.estado === "APROBADO") ?? null;
  return {
    objeto: {
      ...aPublico(ctx, o),
      zona: zona?.nombre ?? null,
      reportadoPor: verPrivado ? nombreDe(o.reportadoPorId) : null,
      unidad: gestor && o.unidadId ? (unidades.get(o.unidadId) ?? null) : null,
      recibidoPor: gestor ? (o.recibidoPorId ? nombreDe(o.recibidoPorId) : null) : null,
      entregadoA: verPrivado ? o.entregadoA : null,
      entregadoDocumento: gestor ? o.entregadoDocumento : null,
      entregadoEn: o.entregadoEn,
      entregadoPor: gestor && o.entregadoPorId ? nombreDe(o.entregadoPorId) : null,
      firmaUrl: gestor ? o.firmaUrl : null,
      disposicion: verPrivado || o.estado === "DONADO" ? o.disposicion : null,
      coincideConId: o.coincideConId,
    },
    gestor,
    propio,
    reclamos: reclamosVisibles.map((r) => ({
      id: r.id,
      estado: r.estado,
      descripcion: r.descripcion,
      respuesta: r.respuesta,
      creado: r.createdAt,
      resueltoEn: r.resueltoEn,
      usuario: gestor ? nombreDe(r.usuarioId) : null,
      unidad: gestor && r.unidadId ? (unidades.get(r.unidadId) ?? null) : null,
      propio: r.usuarioId === ctx.userId,
      perdidasDelReclamante: perdidasReclamantes
        .filter((p) => p.reportadoPorId === r.usuarioId && (p.categoria === o.categoria || o.categoria === "OTRO" || p.categoria === "OTRO"))
        .map((p) => ({ id: p.id, codigo: p.codigo, titulo: tituloDe(p), rasgosPrivados: p.rasgosPrivados, mismaCategoria: p.categoria === o.categoria })),
    })),
    miReclamo: miReclamo ? { id: miReclamo.id, estado: miReclamo.estado, respuesta: miReclamo.respuesta } : null,
    reclamoAprobado: reclamoAprobado ? { id: reclamoAprobado.id, usuario: nombreDe(reclamoAprobado.usuarioId) } : null,
    reclamosPendientes: o.reclamos.filter((r) => r.estado === "PENDIENTE").length,
    coincidencias: coincidencias.map((c) => ({ ...aPublico(ctx, c.objeto), puntaje: c.puntaje, razones: c.razones })),
    linea,
    puede: {
      // Quien gestiona sin unidades propias (administración, portería) no reclama: entrega.
      reclamar: admiteReclamo(o) && !propio && !(gestor && ctx.unidadIds.length === 0) && can(ctx, ["objetos.reportar", "objetos.gestionar"]) && !(miReclamo && miReclamo.estado !== "RECHAZADO"),
      custodia: gestor && admiteCustodia(o),
      entregar: gestor && admiteEntrega(o),
      disponer: gestor && admiteDisposicion(o),
      resolverReclamos: gestor && ESTADOS_ACTIVOS.includes(o.estado),
      aparecio: (propio || gestor) && o.tipo === "PERDIDO" && o.estado === "ABIERTO",
      devolvioFinder: propio && !gestor && o.tipo === "ENCONTRADO" && o.estado === "ABIERTO",
      // Renovar solo cuando faltan menos de 15 días para el cierre automático.
      renovar: (propio || gestor) && o.tipo === "PERDIDO" && o.estado === "ABIERTO" && !!o.venceEn && o.venceEn.getTime() - Date.now() < 15 * 86_400_000,
    },
  };
}

export type DetalleObjeto = Awaited<ReturnType<typeof obtenerObjeto>>;

// ───────────────────────── Custodia ─────────────────────────

async function cargar(ctx: Ctx, id: string) {
  const o = await ctx.db.objetoPerdido.findFirst({ where: { id } });
  if (!o) notFound("El objeto");
  return o;
}

function exigirGestor(ctx: Ctx) {
  if (!esGestorObjetos(ctx)) throw new AppError("Solo portería o administración pueden hacer esto.", 403);
}

/** Portería/administración recibe físicamente un objeto encontrado (queda EN_CUSTODIA). */
export async function recibirEnCustodia(ctx: Ctx, id: string, custodiaRaw: string) {
  exigirGestor(ctx);
  const o = await cargar(ctx, id);
  if (!admiteCustodia(o)) throw new AppError("Este objeto no se puede recibir en custodia en su estado actual.");
  const custodia = limpio(custodiaRaw, 120);
  if (!custodia) throw new AppError("Indica dónde queda guardado.", 400, { custodia: "Obligatorio" });
  const ahora = new Date();
  const cfg = conjuntoConfig(ctx).objetosPerdidos;
  const u = await ctx.db.objetoPerdido.update({
    where: { id },
    data: { estado: "EN_CUSTODIA", custodia, recibidoPorId: usuarioReal(ctx), recibidoEn: ahora, venceEn: calcularVencimiento("ENCONTRADO", ahora, cfg) },
  });
  await audit(ctx, "recibir_custodia", "ObjetoPerdido", id, { estado: o.estado }, { estado: u.estado, custodia });
  await emit({ tipo: "objeto.custodia", conjuntoId: ctx.conjuntoId, actorId: usuarioReal(ctx), data: { id, codigo: o.codigo, custodia } });
  if (o.reportadoPorId && o.reportadoPorId !== ctx.userId) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [o.reportadoPorId], titulo: "Recibimos el objeto que encontraste", cuerpo: `${tituloDe(o)} quedó guardado en ${custodia}. ¡Gracias por ayudar!`, enlace: `${ENLACE}/${id}`, tipo: "OBJETO_PERDIDO" });
  }
  await avisarDuenosPosibles(ctx, u);
  return u;
}

// ───────────────────────── Reclamos ─────────────────────────

/** Un residente dice que el objeto encontrado es suyo y describe rasgos que solo el dueño conoce. */
export async function reclamarObjeto(ctx: Ctx, id: string, descripcionRaw: string) {
  if (!can(ctx, ["objetos.reportar", "objetos.gestionar"])) throw new AppError("No tienes permiso para reclamar objetos.", 403);
  const o = await cargar(ctx, id);
  if (!admiteReclamo(o)) throw new AppError("Este objeto ya no se puede reclamar.");
  if (o.reportadoPorId === ctx.userId) throw new AppError("No puedes reclamar un objeto que tú reportaste como encontrado.");
  const descripcion = limpio(descripcionRaw, 800);
  if (!descripcion || descripcion.length < 10) throw new AppError("Describe detalles que solo el dueño conocería (mínimo 10 caracteres).", 400, { descripcion: "Danos más detalles" });
  const previo = await ctx.db.reclamoObjeto.findFirst({ where: { objetoId: id, usuarioId: ctx.userId, estado: { in: ["PENDIENTE", "APROBADO"] } } });
  if (previo) throw new AppError("Ya tienes un reclamo en revisión para este objeto.");
  const r = await ctx.db.reclamoObjeto.create({ data: { conjuntoId: ctx.conjuntoId, objetoId: id, usuarioId: ctx.userId, unidadId: ctx.unidadIds[0] ?? null, descripcion } });
  await audit(ctx, "reclamar", "ObjetoPerdido", id, undefined, { reclamoId: r.id });
  const gestores = (await usuariosConPermiso(ctx.conjuntoId, ["objetos.gestionar"])).filter((u) => u !== ctx.userId);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: gestores, titulo: `Reclamo de objeto ${o.codigo ?? ""}`.trim(), cuerpo: `${ctx.nombre} dice que ${tituloDe(o)} es suyo. Verifica los rasgos antes de aprobar.`, enlace: `${ENLACE}/${id}`, tipo: "OBJETO_PERDIDO" });
  return r;
}

/** Aprueba (el objeto queda RECLAMADO, listo para entregar) o rechaza un reclamo. */
export async function resolverReclamo(ctx: Ctx, reclamoId: string, decision: "APROBAR" | "RECHAZAR", respuestaRaw?: string | null) {
  exigirGestor(ctx);
  const r = await ctx.db.reclamoObjeto.findFirst({ where: { id: reclamoId }, include: { objeto: true } });
  if (!r) notFound("El reclamo");
  const o = r.objeto;
  if (!ESTADOS_ACTIVOS.includes(o.estado)) throw new AppError("El objeto ya fue entregado o cerrado.");
  const respuesta = limpio(respuestaRaw, 500);
  const ahora = new Date();
  const resuelto = { resueltoPorId: usuarioReal(ctx), resueltoEn: ahora };
  if (decision === "APROBAR") {
    if (r.estado !== "PENDIENTE") throw new AppError("Este reclamo ya fue resuelto.");
    const otros = await ctx.db.reclamoObjeto.findMany({ where: { objetoId: o.id, id: { not: r.id }, estado: { in: ["PENDIENTE", "APROBADO"] } } });
    await ctx.db.reclamoObjeto.update({ where: { id: r.id }, data: { estado: "APROBADO", respuesta, ...resuelto } });
    if (otros.length) {
      await ctx.db.reclamoObjeto.updateMany({ where: { id: { in: otros.map((x) => x.id) } }, data: { estado: "RECHAZADO", respuesta: "Se verificó que el objeto pertenece a otra persona.", ...resuelto } });
      await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: otros.map((x) => x.usuarioId), titulo: "Tu reclamo no fue aprobado", cuerpo: `${tituloDe(o)}: se verificó que pertenece a otra persona.`, enlace: `${ENLACE}/${o.id}`, tipo: "OBJETO_PERDIDO" });
    }
    await ctx.db.objetoPerdido.update({ where: { id: o.id }, data: { estado: "RECLAMADO" } });
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [r.usuarioId],
      titulo: "¡Tu reclamo fue aprobado!",
      cuerpo: `${tituloDe(o)}: recógelo en ${o.custodia ?? "portería"} con tu documento de identidad.${respuesta ? ` ${respuesta}` : ""}`,
      enlace: `${ENLACE}/${o.id}`,
      tipo: "OBJETO_PERDIDO",
      canales: ["push", "email"],
    });
  } else {
    if (r.estado === "RECHAZADO") throw new AppError("Este reclamo ya fue rechazado.");
    if (!respuesta) throw new AppError("Explica por qué se rechaza.", 400, { respuesta: "Obligatorio al rechazar" });
    await ctx.db.reclamoObjeto.update({ where: { id: r.id }, data: { estado: "RECHAZADO", respuesta, ...resuelto } });
    if (r.estado === "APROBADO" && o.estado === "RECLAMADO") {
      await ctx.db.objetoPerdido.update({ where: { id: o.id }, data: { estado: o.recibidoEn ? "EN_CUSTODIA" : "ABIERTO" } });
    }
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [r.usuarioId], titulo: "Tu reclamo no fue aprobado", cuerpo: `${tituloDe(o)}: ${respuesta}`, enlace: `${ENLACE}/${o.id}`, tipo: "OBJETO_PERDIDO" });
  }
  await audit(ctx, decision === "APROBAR" ? "aprobar_reclamo" : "rechazar_reclamo", "ReclamoObjeto", r.id, { estado: r.estado }, { estado: decision === "APROBAR" ? "APROBADO" : "RECHAZADO", objetoId: o.id });
  return true;
}

// ───────────────────────── Entrega ─────────────────────────

export type EntregaInput = { entregadoA: string; entregadoDocumento: string; firma: string; perdidoId?: string | null };

/** Entrega al dueño con documento de identidad y firma en pantalla → DEVUELTO. Enlaza la pérdida correspondiente. */
export async function entregarObjeto(ctx: Ctx, id: string, input: EntregaInput) {
  exigirGestor(ctx);
  const o = await ctx.db.objetoPerdido.findFirst({ where: { id }, include: { reclamos: { where: { deletedAt: null } } } });
  if (!o) notFound("El objeto");
  if (!admiteEntrega(o)) throw new AppError("Este objeto ya fue entregado o cerrado.");
  const entregadoA = limpio(input.entregadoA, 120);
  const documento = limpio(input.entregadoDocumento, 40);
  if (!entregadoA) throw new AppError("Indica quién lo recibe.", 400, { entregadoA: "Obligatorio" });
  if (!documento || documento.replace(/[^0-9a-z]/gi, "").length < 5) throw new AppError("Registra el número de documento de quien recibe.", 400, { entregadoDocumento: "Documento obligatorio" });
  if (!input.firma || !FIRMA_RE.test(input.firma) || input.firma.length > 400_000) throw new AppError("Pide la firma en pantalla de quien recibe.", 400, { firma: "La firma es obligatoria" });

  const ext = input.firma.startsWith("data:image/png") ? "png" : input.firma.startsWith("data:image/webp") ? "webp" : "jpg";
  const { url: firmaUrl } = await saveFile({ conjuntoId: ctx.conjuntoId, folder: "objetos-firmas", body: Buffer.from(input.firma.split(",")[1], "base64"), filename: `firma-${o.codigo ?? o.id}.${ext}`, mime: `image/${ext === "jpg" ? "jpeg" : ext}` });

  // Pérdida enlazada: la indicada, o la más parecida del reclamante aprobado.
  const aprobado = o.reclamos.find((r) => r.estado === "APROBADO") ?? null;
  let perdido: ObjetoPerdido | null = null;
  if (input.perdidoId) {
    perdido = await ctx.db.objetoPerdido.findFirst({ where: { id: input.perdidoId, tipo: "PERDIDO", estado: "ABIERTO" } });
  } else if (aprobado) {
    const suyas = await ctx.db.objetoPerdido.findMany({ where: { tipo: "PERDIDO", estado: "ABIERTO", reportadoPorId: aprobado.usuarioId } });
    perdido = mejoresCoincidencias(o, suyas, { umbral: 30, max: 1 })[0]?.objeto ?? null;
  }

  const ahora = new Date();
  const entregador = usuarioReal(ctx);
  await ctx.db.objetoPerdido.update({
    where: { id },
    data: { estado: "DEVUELTO", entregadoA, entregadoDocumento: documento, firmaUrl, entregadoPorId: entregador, entregadoEn: ahora, coincideConId: perdido?.id ?? o.coincideConId },
  });
  const pendientes = o.reclamos.filter((r) => r.estado === "PENDIENTE");
  if (pendientes.length) {
    await ctx.db.reclamoObjeto.updateMany({ where: { id: { in: pendientes.map((r) => r.id) } }, data: { estado: "RECHAZADO", respuesta: "El objeto fue entregado a su dueño.", resueltoPorId: entregador, resueltoEn: ahora } });
  }
  if (perdido) {
    await ctx.db.objetoPerdido.update({ where: { id: perdido.id }, data: { estado: "DEVUELTO", coincideConId: o.id, entregadoA, entregadoEn: ahora, entregadoPorId: entregador, disposicion: `Recuperado con el reporte ${o.codigo ?? ""}`.trim() } });
  }
  await audit(ctx, "entregar", "ObjetoPerdido", id, { estado: o.estado }, { estado: "DEVUELTO", entregadoA, conFirma: true, perdidoId: perdido?.id ?? null });
  await emit({ tipo: "objeto.entregado", conjuntoId: ctx.conjuntoId, actorId: entregador, data: { id, codigo: o.codigo, perdidoId: perdido?.id ?? null } });

  const avisar = new Set<string>();
  if (o.reportadoPorId && o.reportadoPorId !== ctx.userId) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [o.reportadoPorId], titulo: "¡Gracias! El objeto volvió a su dueño", cuerpo: `${tituloDe(o)} que reportaste fue entregado a su dueño.`, enlace: `${ENLACE}/${id}`, tipo: "OBJETO_PERDIDO" });
  }
  if (aprobado) avisar.add(aprobado.usuarioId);
  if (perdido?.reportadoPorId) avisar.add(perdido.reportadoPorId);
  avisar.delete(ctx.userId);
  if (avisar.size) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [...avisar], titulo: "Recuperaste tu objeto", cuerpo: `${tituloDe(o)} fue entregado a ${entregadoA}. Si no fuiste tú, comunícate con la administración.`, enlace: `${ENLACE}/${id}`, tipo: "OBJETO_PERDIDO" });
  }
  return { id, perdidoId: perdido?.id ?? null };
}

// ───────────────────────── Cierres ─────────────────────────

/** "¡Ya apareció!": quien reportó la pérdida (o un gestor) la cierra. */
export async function marcarAparecio(ctx: Ctx, id: string) {
  const o = await cargar(ctx, id);
  if (o.reportadoPorId !== ctx.userId && !esGestorObjetos(ctx)) throw new AppError("Solo quien lo reportó o la administración pueden cerrarlo.", 403);
  if (o.tipo !== "PERDIDO" || o.estado !== "ABIERTO") throw new AppError("Este reporte ya está cerrado.");
  await ctx.db.objetoPerdido.update({ where: { id }, data: { estado: "DEVUELTO", disposicion: "¡Apareció! Cerrado por quien lo reportó." } });
  await audit(ctx, "aparecio", "ObjetoPerdido", id, { estado: o.estado }, { estado: "DEVUELTO" });
  return true;
}

/** Quien encontró algo (y aún lo tiene) informa que lo devolvió directamente a su dueño. */
export async function devolvioDirecto(ctx: Ctx, id: string, entregadoARaw: string) {
  const o = await cargar(ctx, id);
  if (o.reportadoPorId !== ctx.userId && !esGestorObjetos(ctx)) throw new AppError("Solo quien lo reportó o la administración pueden cerrarlo.", 403);
  if (o.tipo !== "ENCONTRADO" || o.estado !== "ABIERTO") throw new AppError("Este reporte ya no está abierto.");
  const entregadoA = limpio(entregadoARaw, 120);
  if (!entregadoA) throw new AppError("Indica a quién se lo devolviste.", 400, { entregadoA: "Obligatorio" });
  await ctx.db.objetoPerdido.update({ where: { id }, data: { estado: "DEVUELTO", entregadoA, entregadoEn: new Date(), disposicion: "Devuelto directamente por quien lo encontró." } });
  await ctx.db.reclamoObjeto.updateMany({ where: { objetoId: id, estado: "PENDIENTE" }, data: { estado: "RECHAZADO", respuesta: "El objeto fue devuelto a su dueño.", resueltoEn: new Date() } });
  await audit(ctx, "devolver", "ObjetoPerdido", id, { estado: o.estado }, { estado: "DEVUELTO", entregadoA });
  return true;
}

/** Disposición de un objeto encontrado sin reclamar: donación o cierre, con nota obligatoria. */
export async function disponerObjeto(ctx: Ctx, id: string, disposicion: "DONADO" | "CERRADO", notaRaw: string) {
  exigirGestor(ctx);
  const o = await cargar(ctx, id);
  if (!admiteDisposicion(o)) throw new AppError("Este objeto no admite disposición en su estado actual.");
  const nota = limpio(notaRaw, 500);
  if (!nota || nota.length < 5) throw new AppError("Describe la disposición (a quién se donó, acta, etc.).", 400, { nota: "Obligatorio" });
  await ctx.db.objetoPerdido.update({ where: { id }, data: { estado: disposicion, disposicion: nota } });
  await ctx.db.reclamoObjeto.updateMany({ where: { objetoId: id, estado: "PENDIENTE" }, data: { estado: "RECHAZADO", respuesta: "El objeto fue dispuesto por la administración tras el plazo de custodia.", resueltoPorId: usuarioReal(ctx), resueltoEn: new Date() } });
  await audit(ctx, disposicion === "DONADO" ? "donar" : "cerrar", "ObjetoPerdido", id, { estado: o.estado }, { estado: disposicion, disposicion: nota });
  return true;
}

/** Extiende el plazo de un reporte de pérdida que sigue abierto. */
export async function renovarReporte(ctx: Ctx, id: string) {
  const o = await cargar(ctx, id);
  if (o.reportadoPorId !== ctx.userId && !esGestorObjetos(ctx)) throw new AppError("Solo quien lo reportó puede renovarlo.", 403);
  if (o.tipo !== "PERDIDO" || o.estado !== "ABIERTO") throw new AppError("Solo se renuevan reportes de pérdida abiertos.");
  const venceEn = calcularVencimiento("PERDIDO", new Date(), conjuntoConfig(ctx).objetosPerdidos);
  await ctx.db.objetoPerdido.update({ where: { id }, data: { venceEn } });
  await audit(ctx, "renovar", "ObjetoPerdido", id, { venceEn: o.venceEn }, { venceEn });
  return { venceEn };
}

// ───────────────────────── Job diario ─────────────────────────

/** Aplica las reglas de vencimiento a los objetos del conjunto. Idempotente dentro del mismo día. */
export async function procesarVencimientos(ctx: Ctx, ahora = new Date()) {
  const objetos = await ctx.db.objetoPerdido.findMany({
    where: { venceEn: { not: null, lte: new Date(ahora.getTime() + 8 * 86_400_000) }, OR: [{ tipo: "PERDIDO", estado: "ABIERTO" }, { tipo: "ENCONTRADO", estado: "EN_CUSTODIA" }] },
  });
  const r = { avisos: 0, cerrados: 0, disposicion: 0 };
  const porDisponer: ObjetoPerdido[] = [];
  for (const o of objetos) {
    const accion = accionVencimiento(o, ahora);
    if (accion === "AVISAR_CIERRE" && o.reportadoPorId) {
      await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [o.reportadoPorId], titulo: "Tu reporte de pérdida se cerrará pronto", cuerpo: `${tituloDe(o)} se cerrará en 7 días. Si aún lo buscas, renuévalo desde la app.`, enlace: `${ENLACE}/${o.id}`, tipo: "OBJETO_PERDIDO" });
      r.avisos++;
    } else if (accion === "CERRAR") {
      await ctx.db.objetoPerdido.update({ where: { id: o.id }, data: { estado: "CERRADO", disposicion: "Cerrado automáticamente por tiempo sin novedades." } });
      await audit(ctx, "cierre_automatico", "ObjetoPerdido", o.id, { estado: o.estado }, { estado: "CERRADO" });
      if (o.reportadoPorId) {
        await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [o.reportadoPorId], titulo: "Cerramos tu reporte de pérdida", cuerpo: `${tituloDe(o)} se cerró por tiempo. Si aparece algo parecido te avisaremos; también puedes reportarlo de nuevo.`, enlace: `${ENLACE}/${o.id}`, tipo: "OBJETO_PERDIDO" });
      }
      r.cerrados++;
    } else if (accion === "PEDIR_DISPOSICION") {
      porDisponer.push(o);
    }
  }
  if (porDisponer.length) {
    const gestores = await usuariosConPermiso(ctx.conjuntoId, ["objetos.gestionar"]);
    const admins = await usuariosConPermiso(ctx.conjuntoId, ["configuracion.editar"]);
    const destino = admins.filter((a) => gestores.includes(a));
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: destino.length ? destino : gestores,
      titulo: `${porDisponer.length} objeto(s) en custodia superaron el plazo`,
      cuerpo: `${porDisponer.slice(0, 3).map((o) => `${o.codigo ?? ""} ${tituloDe(o)}`.trim()).join(", ")}${porDisponer.length > 3 ? "…" : ""}. Decide si se donan o se cierran.`,
      enlace: `${ENLACE}?vista=atender`,
      tipo: "OBJETO_PERDIDO",
      canales: ["push", "email"],
    });
    r.disposicion = porDisponer.length;
  }
  return r;
}

// ───────────────────────── Resumen (inicio y portería) ─────────────────────────

export async function resumenObjetosGestion(ctx: Ctx) {
  const ahora = new Date();
  const inicioMes = new Date(ahora.getTime() - 30 * 86_400_000);
  const [reclamosPendientes, enCustodia, vencidos, porRecibir, devueltosMes, reportadosMes] = await Promise.all([
    ctx.db.reclamoObjeto.count({ where: { estado: "PENDIENTE", objeto: { estado: { in: [...ESTADOS_ACTIVOS] } } } }),
    ctx.db.objetoPerdido.count({ where: { tipo: "ENCONTRADO", estado: { in: ["EN_CUSTODIA", "RECLAMADO"] } } }),
    ctx.db.objetoPerdido.count({ where: { tipo: "ENCONTRADO", estado: "EN_CUSTODIA", venceEn: { lte: ahora } } }),
    ctx.db.objetoPerdido.count({ where: { tipo: "ENCONTRADO", estado: "ABIERTO" } }),
    ctx.db.objetoPerdido.count({ where: { estado: "DEVUELTO", updatedAt: { gte: inicioMes }, tipo: "ENCONTRADO" } }),
    ctx.db.objetoPerdido.count({ where: { createdAt: { gte: inicioMes } } }),
  ]);
  return { reclamosPendientes, enCustodia, vencidos, porRecibir, devueltosMes, reportadosMes };
}

export { categoriaLabel };
