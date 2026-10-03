import crypto from "node:crypto";
import type { Encuesta, PreguntaEncuesta, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit, publishRealtime } from "@/lib/events";
import { notify } from "@/lib/notificaciones";
import { can } from "@/lib/permisos";
import { prisma } from "@/lib/db";
import { definicionEfectiva, resolverUsuarios, usuarioEnSegmento, type SegmentoDef } from "@/lib/segmentos";
import { MAX_OPCIONES, MAX_PREGUNTAS } from "./limites";

/**
 * Encuestas rápidas: preguntas de opción única, múltiple, escala 1–5 y texto; audiencia por segmento
 * (lib/segmentos); anónimas con `votanteHash` (una respuesta por usuario sin guardar quién respondió);
 * resultados en vivo por el canal "encuesta:<id>" y cierre automático (jobs/gobierno.ts).
 */

export type TipoPregunta = "UNICA" | "MULTIPLE" | "ESCALA" | "TEXTO";
export type Audiencia = "TODOS" | "PROPIETARIOS" | "TORRE" | "SEGMENTO";

export type PreguntaInput = { tipo: TipoPregunta; texto: string; opciones?: string[]; requerida?: boolean };

export type CrearEncuestaInput = {
  titulo: string;
  descripcion?: string | null;
  anonima: boolean;
  inicio?: Date | null;
  fin: Date;
  audiencia: Audiencia;
  torreId?: string | null;
  segmentoId?: string | null;
  preguntas: PreguntaInput[];
  notificar?: boolean;
};

/**
 * Traduce la audiencia simple a un segmento guardado (compatible con el motor de lib/segmentos):
 * TODOS → sin segmento; PROPIETARIOS → vínculos PROPIETARIO/COPROPIETARIO; TORRE → la torre;
 * SEGMENTO → el segmento elegido. Los segmentos simples se reutilizan si ya existen.
 */
async function segmentoParaAudiencia(ctx: Ctx, input: Pick<CrearEncuestaInput, "audiencia" | "torreId" | "segmentoId">): Promise<string | null> {
  if (input.audiencia === "TODOS") return null;
  if (input.audiencia === "SEGMENTO") {
    if (!input.segmentoId) throw new AppError("Elige el segmento de la audiencia.", 400, { segmentoId: "Obligatorio" });
    const s = await ctx.db.segmento.findUnique({ where: { id: input.segmentoId } });
    if (!s) notFound("El segmento");
    return s.id;
  }
  let nombre: string;
  let definicion: SegmentoDef;
  if (input.audiencia === "PROPIETARIOS") {
    nombre = "Solo propietarios";
    definicion = { vinculos: ["PROPIETARIO", "COPROPIETARIO"] };
  } else {
    if (!input.torreId) throw new AppError("Elige la torre.", 400, { torreId: "Obligatorio" });
    const t = await ctx.db.torre.findUnique({ where: { id: input.torreId } });
    if (!t) notFound("La torre");
    nombre = `Residentes de ${t.nombre}`;
    definicion = { torres: [t.id] };
  }
  const existente = await ctx.db.segmento.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (existente && JSON.stringify(existente.definicion) === JSON.stringify(definicion)) return existente.id;
  const s = await ctx.db.segmento.create({
    data: { conjuntoId: ctx.conjuntoId, nombre: existente ? `${nombre} (encuestas)` : nombre, descripcion: "Creado automáticamente para la audiencia de una encuesta", definicion: definicion as Prisma.InputJsonValue },
  });
  return s.id;
}

function validarPreguntas(preguntas: PreguntaInput[]) {
  if (!preguntas.length) throw new AppError("Agrega al menos una pregunta.");
  if (preguntas.length > MAX_PREGUNTAS) throw new AppError(`Máximo ${MAX_PREGUNTAS} preguntas por encuesta.`);
  return preguntas.map((p, i) => {
    const texto = p.texto.trim();
    if (!texto) throw new AppError(`La pregunta ${i + 1} no tiene texto.`);
    let opciones: string[] = [];
    if (p.tipo === "UNICA" || p.tipo === "MULTIPLE") {
      opciones = [...new Set((p.opciones ?? []).map((o) => o.trim()).filter(Boolean))];
      if (opciones.length < 2) throw new AppError(`La pregunta ${i + 1} necesita al menos dos opciones.`);
      if (opciones.length > MAX_OPCIONES) throw new AppError(`La pregunta ${i + 1} tiene más de ${MAX_OPCIONES} opciones.`);
    }
    if (p.tipo === "ESCALA") opciones = ["1", "2", "3", "4", "5"];
    return { orden: i + 1, tipo: p.tipo, texto, opciones, requerida: p.requerida ?? true };
  });
}

export async function crearEncuesta(ctx: Ctx, input: CrearEncuestaInput) {
  const inicio = input.inicio ?? new Date();
  if (input.fin.getTime() <= inicio.getTime()) throw new AppError("La fecha de cierre debe ser posterior al inicio.", 400, { fin: "Debe ser posterior al inicio" });
  const preguntas = validarPreguntas(input.preguntas);
  const segmentoId = await segmentoParaAudiencia(ctx, input);
  const e = await ctx.db.encuesta.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      titulo: input.titulo,
      descripcion: input.descripcion ?? null,
      anonima: input.anonima,
      inicio,
      fin: input.fin,
      segmentoId,
      estado: "ABIERTA",
      creadaPorId: ctx.userId,
    },
  });
  await ctx.db.preguntaEncuesta.createMany({ data: preguntas.map((p) => ({ ...p, conjuntoId: ctx.conjuntoId, encuestaId: e.id })) });
  await audit(ctx, "crear", "Encuesta", e.id, undefined, { titulo: e.titulo, anonima: e.anonima, fin: e.fin, segmentoId, preguntas: preguntas.length });
  await emit({ tipo: "encuesta.creada", conjuntoId: ctx.conjuntoId, data: { id: e.id }, actorId: ctx.userId });
  if (input.notificar !== false) {
    const ids = await audienciaUsuarios(ctx, e);
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: ids.filter((i) => i !== ctx.userId), titulo: "Nueva encuesta", cuerpo: e.titulo, enlace: `/encuestas/${e.id}`, tipo: "ENCUESTA", canales: ["push"] });
  }
  return e;
}

/** Usuarios de la audiencia (para notificar y calcular participación). */
export async function audienciaUsuarios(ctx: Pick<Ctx, "db" | "conjuntoId" | "conjunto">, e: Pick<Encuesta, "segmentoId">) {
  const def = await definicionEfectiva(ctx, { segmentoId: e.segmentoId }).catch(() => ({}));
  return resolverUsuarios(ctx, def);
}

export async function enAudiencia(ctx: Ctx, e: Pick<Encuesta, "segmentoId">) {
  if (!e.segmentoId) return true;
  const def = await definicionEfectiva(ctx, { segmentoId: e.segmentoId }).catch(() => null);
  if (!def) return true;
  return usuarioEnSegmento(ctx, def, ctx.userId);
}

// ───────────────────────────── LISTAR / DETALLE ─────────────────────────────

export function votanteHash(encuestaId: string, usuarioId: string, anonima: boolean) {
  if (!anonima) return `u:${usuarioId}`;
  const secreto = process.env.NEXTAUTH_SECRET ?? process.env.APP_ENCRYPTION_KEY ?? "miconjunto";
  return crypto.createHmac("sha256", secreto).update(`${encuestaId}:${usuarioId}`).digest("hex");
}

export async function listarEncuestas(ctx: Ctx, filtro: { estado?: "ABIERTA" | "CERRADA" | "BORRADOR" } = {}) {
  const gestor = can(ctx, ["encuestas.crear", "encuestas.resultados"]);
  const where: Prisma.EncuestaWhereInput = filtro.estado ? { estado: filtro.estado } : gestor ? {} : { estado: { in: ["ABIERTA", "CERRADA"] } };
  const encuestas = await ctx.db.encuesta.findMany({
    where,
    orderBy: [{ estado: "asc" }, { fin: "desc" }],
    take: 100,
    include: { _count: { select: { preguntas: { where: { deletedAt: null } }, respuestas: { where: { deletedAt: null } } } } },
  });
  const visibles = gestor ? encuestas : (await Promise.all(encuestas.map(async (e) => ((await enAudiencia(ctx, e)) ? e : null)))).filter((e): e is NonNullable<typeof e> => !!e);
  const hashes = visibles.map((e) => votanteHash(e.id, ctx.userId, e.anonima));
  const respondidas = new Set(
    (await ctx.db.respuestaEncuesta.findMany({ where: { votanteHash: { in: hashes } }, select: { encuestaId: true } })).map((r) => r.encuestaId),
  );
  return visibles.map((e) => ({ ...e, respondida: respondidas.has(e.id) }));
}

export async function obtenerEncuesta(ctx: Ctx, id: string) {
  const e = await ctx.db.encuesta.findUnique({ where: { id }, include: { preguntas: { where: { deletedAt: null }, orderBy: { orden: "asc" } } } });
  if (!e) notFound("La encuesta");
  if (!can(ctx, ["encuestas.crear", "encuestas.resultados"]) && !(await enAudiencia(ctx, e))) notFound("La encuesta");
  const propia = await ctx.db.respuestaEncuesta.findFirst({ where: { encuestaId: id, votanteHash: votanteHash(id, ctx.userId, e.anonima) } });
  return { ...e, respondida: !!propia, miRespuesta: propia && !e.anonima ? (propia.respuestas as Record<string, unknown>) : null };
}

// ───────────────────────────── RESPONDER ─────────────────────────────

export type RespuestasInput = Record<string, string | string[] | undefined>;

function normalizarRespuesta(p: PreguntaEncuesta, raw: string | string[] | undefined): string | string[] | number | null {
  const vals = (Array.isArray(raw) ? raw : raw === undefined || raw === "" ? [] : [raw]).map((v) => String(v).trim()).filter(Boolean);
  if (!vals.length) {
    if (p.requerida) throw new AppError(`Responde: «${p.texto}».`, 400, { [`r.${p.id}`]: "Obligatoria" });
    return null;
  }
  switch (p.tipo) {
    case "UNICA":
      if (!p.opciones.includes(vals[0])) throw new AppError(`Opción no válida en «${p.texto}».`);
      return vals[0];
    case "MULTIPLE": {
      const ok = [...new Set(vals)].filter((v) => p.opciones.includes(v));
      if (!ok.length && p.requerida) throw new AppError(`Elige al menos una opción en «${p.texto}».`);
      return ok;
    }
    case "ESCALA": {
      const n = Number(vals[0]);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new AppError(`La calificación de «${p.texto}» debe estar entre 1 y 5.`);
      return n;
    }
    default:
      return vals[0].slice(0, 1000);
  }
}

export async function responderEncuesta(ctx: Ctx, encuestaId: string, respuestas: RespuestasInput) {
  const e = await obtenerEncuesta(ctx, encuestaId);
  const ahora = new Date();
  if (e.estado !== "ABIERTA" || ahora > e.fin) throw new AppError("La encuesta ya está cerrada.");
  if (ahora < e.inicio) throw new AppError("La encuesta aún no ha comenzado.");
  if (e.respondida) throw new AppError("Ya respondiste esta encuesta. ¡Gracias!");
  const data: Record<string, unknown> = {};
  for (const p of e.preguntas) {
    const v = normalizarRespuesta(p, respuestas[p.id]);
    if (v !== null) data[p.id] = v;
  }
  const unidadId = e.anonima ? null : (ctx.unidadIds[0] ?? null);
  try {
    await ctx.db.respuestaEncuesta.create({
      data: {
        conjuntoId: ctx.conjuntoId,
        encuestaId,
        usuarioId: e.anonima ? null : ctx.userId,
        unidadId,
        respuestas: data as Prisma.InputJsonValue,
        votanteHash: votanteHash(encuestaId, ctx.userId, e.anonima),
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw new AppError("Ya respondiste esta encuesta. ¡Gracias!");
    throw err;
  }
  const total = await ctx.db.respuestaEncuesta.count({ where: { encuestaId } });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `encuesta:${encuestaId}`, tipo: "respuesta", data: { encuestaId, total } });
  return { total };
}

// ───────────────────────────── RESULTADOS ─────────────────────────────

export type ResultadoPregunta = {
  id: string;
  texto: string;
  tipo: TipoPregunta;
  respuestas: number;
  opciones: { opcion: string; votos: number; pct: number }[];
  promedio?: number | null;
  textos?: string[];
};

export type ResultadosEncuesta = { total: number; audiencia: number; participacion: number; preguntas: ResultadoPregunta[] };

export async function resultadosEncuesta(ctx: Ctx, e: Encuesta & { preguntas: PreguntaEncuesta[] }, opts?: { incluirTextos?: boolean }): Promise<ResultadosEncuesta> {
  const [filas, audiencia] = await Promise.all([
    ctx.db.respuestaEncuesta.findMany({ where: { encuestaId: e.id }, select: { respuestas: true }, orderBy: { createdAt: "desc" } }),
    audienciaUsuarios(ctx, e).then((u) => u.length),
  ]);
  const total = filas.length;
  const preguntas = e.preguntas.map<ResultadoPregunta>((p) => {
    const vals = filas.map((f) => (f.respuestas as Record<string, unknown>)[p.id]).filter((v) => v !== undefined && v !== null && v !== "");
    const tipo = p.tipo as TipoPregunta;
    const conteo = new Map<string, number>();
    const base = tipo === "ESCALA" ? ["1", "2", "3", "4", "5"] : p.opciones;
    for (const o of base) conteo.set(o, 0);
    let suma = 0;
    for (const v of vals) {
      if (Array.isArray(v)) for (const x of v) conteo.set(String(x), (conteo.get(String(x)) ?? 0) + 1);
      else if (tipo !== "TEXTO") conteo.set(String(v), (conteo.get(String(v)) ?? 0) + 1);
      if (tipo === "ESCALA") suma += Number(v);
    }
    const r = vals.length;
    return {
      id: p.id,
      texto: p.texto,
      tipo,
      respuestas: r,
      opciones: tipo === "TEXTO" ? [] : [...conteo.entries()].map(([opcion, votos]) => ({ opcion, votos, pct: r ? Math.round((votos / r) * 1000) / 10 : 0 })),
      promedio: tipo === "ESCALA" ? (r ? Math.round((suma / r) * 100) / 100 : null) : undefined,
      textos: tipo === "TEXTO" && opts?.incluirTextos !== false ? vals.slice(0, 50).map(String) : undefined,
    };
  });
  return { total, audiencia, participacion: audiencia ? Math.round((total / audiencia) * 1000) / 10 : 0, preguntas };
}

// ───────────────────────────── CIERRE ─────────────────────────────

export async function cerrarEncuesta(ctx: Ctx, id: string, opts?: { automatico?: boolean }) {
  const e = await ctx.db.encuesta.findUnique({ where: { id } });
  if (!e) notFound("La encuesta");
  if (e.estado === "CERRADA") return e;
  const u = await ctx.db.encuesta.update({ where: { id }, data: { estado: "CERRADA", fin: new Date() < e.fin ? new Date() : e.fin } });
  await audit(ctx, opts?.automatico ? "cierre_automatico" : "cerrar", "Encuesta", id, { estado: e.estado }, { estado: "CERRADA" });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `encuesta:${id}`, tipo: "estado", data: { estado: "CERRADA" } });
  await emit({ tipo: "encuesta.cerrada", conjuntoId: ctx.conjuntoId, data: { id }, actorId: ctx.userId });
  return u;
}

export async function eliminarEncuesta(ctx: Ctx, id: string) {
  const e = await ctx.db.encuesta.findUnique({ where: { id } });
  if (!e) notFound("La encuesta");
  await ctx.db.encuesta.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Encuesta", id, { titulo: e.titulo });
  return true;
}

export async function cerrarEncuestasVencidas(ctxFor: (conjuntoId: string) => Promise<Ctx>, ahora = new Date()) {
  const vencidas = await prisma.encuesta.findMany({ where: { estado: "ABIERTA", fin: { lte: ahora }, deletedAt: null }, select: { id: true, conjuntoId: true } });
  let n = 0;
  for (const e of vencidas) {
    try {
      await cerrarEncuesta(await ctxFor(e.conjuntoId), e.id, { automatico: true });
      n++;
    } catch (err) {
      console.error("[encuestas] no se pudo cerrar", e.id, (err as Error).message);
    }
  }
  return n;
}
