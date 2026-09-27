import { Prisma, type Votacion } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { unidadAlDia } from "@/lib/cartera/core";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit, publishRealtime } from "@/lib/events";
import { notify } from "@/lib/notificaciones";
import { can } from "@/lib/permisos";
import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/format";
import {
  calcularResultado,
  codigoVerificacion,
  comprobanteHash,
  esComprobanteValido,
  nuevoNonce,
  parseOpciones,
  type Ponderacion,
  type ResultadoVotacion,
  type TipoMayoria,
} from "./calculos";

type Db = Pick<Ctx, "db">;

/** Totales del conjunto para quórum y mayorías (unidades con coeficiente > 0). */
export async function totalesConjunto(ctx: Db) {
  const agg = await ctx.db.unidad.aggregate({ where: { coeficiente: { gt: 0 } }, _sum: { coeficiente: true }, _count: { _all: true } });
  return { totalCoeficientes: toNumber(agg._sum.coeficiente) || 100, totalUnidades: agg._count._all };
}

// ───────────────────────────── CREAR / LISTAR ─────────────────────────────

export type CrearVotacionInput = {
  pregunta: string;
  descripcion?: string | null;
  opciones: string[];
  tipoMayoria: TipoMayoria;
  ponderacion: Ponderacion;
  quienVota: "PROPIETARIOS_AL_DIA" | "PROPIETARIOS" | "TODOS";
  secreto: boolean;
  inicio?: Date | null;
  fin: Date;
  asambleaId?: string | null;
  puntoOrden?: number | null;
  /** BORRADOR para puntos de asamblea que se abren durante la sesión. */
  estado?: "ABIERTA" | "BORRADOR";
  notificar?: boolean;
};

export async function crearVotacion(ctx: Ctx, input: CrearVotacionInput) {
  const textos = [...new Set(input.opciones.map((o) => o.trim()).filter(Boolean))];
  if (textos.length < 2) throw new AppError("Agrega al menos dos opciones diferentes.", 400, { opciones: "Mínimo dos opciones" });
  const inicio = input.inicio ?? new Date();
  if (input.fin.getTime() <= inicio.getTime()) throw new AppError("La fecha de cierre debe ser posterior a la de inicio.", 400, { fin: "Debe ser posterior al inicio" });
  if (input.asambleaId) {
    const a = await ctx.db.asamblea.findUnique({ where: { id: input.asambleaId } });
    if (!a) notFound("La asamblea");
  }
  const v = await ctx.db.votacion.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      pregunta: input.pregunta,
      descripcion: input.descripcion ?? null,
      opciones: textos.map((texto, i) => ({ id: `o${i + 1}`, texto })),
      tipoMayoria: input.tipoMayoria,
      ponderacion: input.ponderacion,
      quienVota: input.quienVota,
      secreto: input.secreto,
      inicio,
      fin: input.fin,
      asambleaId: input.asambleaId ?? null,
      puntoOrden: input.puntoOrden ?? null,
      estado: input.estado ?? "ABIERTA",
    },
  });
  await audit(ctx, "crear", "Votacion", v.id, undefined, { pregunta: v.pregunta, tipoMayoria: v.tipoMayoria, ponderacion: v.ponderacion, quienVota: v.quienVota, secreto: v.secreto, fin: v.fin });
  if (v.estado === "ABIERTA") {
    await emit({ tipo: "votacion.abierta", conjuntoId: ctx.conjuntoId, data: { id: v.id, asambleaId: v.asambleaId }, actorId: ctx.userId });
    if (input.notificar !== false && !v.asambleaId) await notificarVotantes(ctx, v, "Nueva votación", `Ya puedes votar: ${v.pregunta}`);
  }
  return v;
}

/** Usuarios que pueden votar (propietarios o todos los vinculados) para avisos. */
export async function usuariosVotantes(ctx: Pick<Ctx, "conjuntoId">, quienVota: Votacion["quienVota"], excluirUnidades: string[] = []) {
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: {
      conjuntoId: ctx.conjuntoId,
      estado: "ACTIVO",
      deletedAt: null,
      unidadId: excluirUnidades.length ? { notIn: excluirUnidades } : undefined,
      tipo: quienVota === "TODOS" ? { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE"] } : { in: ["PROPIETARIO", "COPROPIETARIO"] },
      persona: { usuarioId: { not: null }, deletedAt: null },
    },
    select: { persona: { select: { usuarioId: true } } },
  });
  return [...new Set(vinculos.map((v) => v.persona.usuarioId!).filter(Boolean))];
}

async function notificarVotantes(ctx: Ctx, v: Votacion, titulo: string, cuerpo: string) {
  const ids = await usuariosVotantes(ctx, v.quienVota);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: ids, titulo, cuerpo, enlace: `/votaciones/${v.id}`, tipo: "VOTACION", canales: ["push"] });
}

export async function listarVotaciones(ctx: Ctx, filtro: { estado?: string; asambleaId?: string | null; take?: number; skip?: number } = {}) {
  const verBorradores = can(ctx, ["votaciones.crear", "asambleas.gestionar"]);
  const where: Prisma.VotacionWhereInput = {
    ...(filtro.estado ? { estado: filtro.estado as Votacion["estado"] } : verBorradores ? {} : { estado: { in: ["ABIERTA", "CERRADA"] } }),
    ...(filtro.asambleaId !== undefined ? { asambleaId: filtro.asambleaId } : {}),
  };
  const [items, total] = await Promise.all([
    ctx.db.votacion.findMany({
      where,
      orderBy: [{ estado: "asc" }, { fin: "desc" }],
      take: filtro.take ?? 50,
      skip: filtro.skip ?? 0,
      include: { asamblea: { select: { id: true, titulo: true } }, _count: { select: { votos: { where: { deletedAt: null } } } } },
    }),
    ctx.db.votacion.count({ where }),
  ]);
  return { items, total };
}

export async function obtenerVotacion(ctx: Db, id: string) {
  const v = await ctx.db.votacion.findUnique({ where: { id }, include: { asamblea: { select: { id: true, titulo: true, estado: true } } } });
  if (!v) notFound("La votación");
  return v;
}

// ───────────────────────────── ELEGIBILIDAD ─────────────────────────────

export type UnidadVotante = {
  unidadId: string;
  codigo: string;
  coeficiente: number;
  porPoder: boolean;
  otorgante?: string | null;
  yaVoto: boolean;
  comprobante?: string | null;
  opcionVotada?: string | null;
  bloqueo?: string | null;
};

/**
 * Unidades por las que el usuario puede votar en una votación:
 * - Propias (propietario/copropietario) o, si la votación es para TODOS, cualquier unidad vinculada.
 * - Unidades representadas con un poder APROBADO (votaciones de asamblea): el apoderado vota por ellas
 *   y el poderdante deja de votar directamente por esa unidad.
 * - Si se exige estar al día (PROPIETARIOS_AL_DIA o `bloqueoMora.votacion`), las unidades con saldo
 *   vencido quedan bloqueadas.
 * - En votaciones de asamblea, la unidad debe tener asistencia registrada (presente o representada).
 */
export async function unidadesHabilitadas(ctx: Ctx, v: Pick<Votacion, "id" | "quienVota" | "asambleaId">): Promise<UnidadVotante[]> {
  const cfg = conjuntoConfig(ctx);
  // Sin `votaciones.votar` (p. ej. arrendatarios) solo se vota por poder o en consultas abiertas a TODOS.
  const votaPropias = v.quienVota === "TODOS" || can(ctx, "votaciones.votar");
  const propias = !votaPropias ? [] : v.quienVota === "TODOS" ? ctx.unidadIds : ctx.unidadesPropias;
  const poderes = v.asambleaId
    ? await ctx.db.poderAsamblea.findMany({ where: { asambleaId: v.asambleaId, estado: "APROBADO" }, select: { unidadId: true, apoderadoUsuarioId: true, otorganteNombre: true } })
    : [];
  const delegadas = new Set(poderes.filter((p) => p.apoderadoUsuarioId !== ctx.userId).map((p) => p.unidadId));
  const representadas = poderes.filter((p) => p.apoderadoUsuarioId === ctx.userId);
  const ids = [...new Set([...propias.filter((u) => !delegadas.has(u)), ...representadas.map((p) => p.unidadId)])];
  if (!ids.length) return [];
  const [unidades, votos, asistencias] = await Promise.all([
    ctx.db.unidad.findMany({ where: { id: { in: ids } }, select: { id: true, codigo: true, coeficiente: true }, orderBy: { codigo: "asc" } }),
    ctx.db.voto.findMany({ where: { votacionId: v.id, unidadId: { in: ids } }, select: { unidadId: true, comprobanteHash: true, opcionId: true } }),
    v.asambleaId ? ctx.db.asistenciaAsamblea.findMany({ where: { asambleaId: v.asambleaId, unidadId: { in: ids }, salidaEn: null }, select: { unidadId: true } }) : Promise.resolve([]),
  ]);
  const presentes = new Set(asistencias.map((a) => a.unidadId));
  const exigeAlDia = v.quienVota === "PROPIETARIOS_AL_DIA" || cfg.bloqueoMora.votacion;
  const out: UnidadVotante[] = [];
  for (const u of unidades) {
    const voto = votos.find((x) => x.unidadId === u.id);
    const poder = representadas.find((p) => p.unidadId === u.id);
    let bloqueo: string | null = null;
    if (!voto) {
      if (v.asambleaId && !presentes.has(u.id)) bloqueo = "Registra tu asistencia a la asamblea para votar por esta unidad.";
      else if (exigeAlDia) {
        const { alDia } = await unidadAlDia(ctx, u.id);
        if (!alDia) bloqueo = "La unidad tiene saldo vencido: esta votación exige estar al día.";
      }
    }
    out.push({
      unidadId: u.id,
      codigo: u.codigo,
      coeficiente: toNumber(u.coeficiente),
      porPoder: !!poder,
      otorgante: poder?.otorganteNombre ?? null,
      yaVoto: !!voto,
      comprobante: voto?.comprobanteHash ?? null,
      opcionVotada: voto?.opcionId ?? null,
      bloqueo,
    });
  }
  return out;
}

// ───────────────────────────── VOTAR ─────────────────────────────

export async function votar(ctx: Ctx, input: { votacionId: string; unidadId: string; opcionId: string }) {
  const v = await obtenerVotacion(ctx, input.votacionId);
  const ahora = new Date();
  if (v.estado !== "ABIERTA") throw new AppError("La votación no está abierta.");
  if (ahora < v.inicio) throw new AppError("La votación aún no ha comenzado.");
  if (ahora > v.fin) throw new AppError("La votación ya cerró.");
  const opciones = parseOpciones(v.opciones);
  if (!opciones.some((o) => o.id === input.opcionId)) throw new AppError("La opción elegida no es válida.");

  const habilitadas = await unidadesHabilitadas(ctx, v);
  const u = habilitadas.find((x) => x.unidadId === input.unidadId);
  if (!u) throw new AppError("No puedes votar por esta unidad.", 403);
  if (u.yaVoto) throw new AppError(`La unidad ${u.codigo} ya votó en esta votación.`);
  if (u.bloqueo) throw new AppError(u.bloqueo, 403);

  const hash = comprobanteHash(v.id, u.unidadId, nuevoNonce());
  let voto;
  try {
    voto = await ctx.db.voto.create({
      data: {
        conjuntoId: ctx.conjuntoId,
        votacionId: v.id,
        unidadId: u.unidadId,
        opcionId: input.opcionId,
        // Voto secreto: no se guarda quién votó, solo la unidad (un voto por unidad) y el comprobante.
        usuarioId: v.secreto ? null : ctx.userId,
        votanteNombre: v.secreto ? null : ctx.nombre,
        coeficiente: u.coeficiente,
        porPoder: u.porPoder,
        comprobanteHash: hash,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError(`La unidad ${u.codigo} ya votó en esta votación.`);
    throw e;
  }
  await audit(ctx, "votar", "Voto", voto.id, undefined, {
    votacionId: v.id,
    unidad: u.codigo,
    porPoder: u.porPoder,
    comprobante: hash,
    ...(v.secreto ? {} : { opcionId: input.opcionId }),
  });
  await publicarConteo(ctx, v.id, v.asambleaId);
  return { id: voto.id, comprobante: hash, unidad: u.codigo, emitidoEn: voto.emitidoEn };
}

/** Publica el nuevo conteo en tiempo real (canal votacion:<id> y asamblea:<id>). */
export async function publicarConteo(ctx: Pick<Ctx, "conjuntoId" | "db">, votacionId: string, asambleaId?: string | null) {
  const votos = await ctx.db.voto.count({ where: { votacionId } });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `votacion:${votacionId}`, tipo: "voto", data: { votacionId, votos } });
  if (asambleaId) await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${asambleaId}`, tipo: "voto", data: { votacionId, votos } });
}

// ───────────────────────────── RESULTADOS ─────────────────────────────

export type ResultadoGuardado = ResultadoVotacion & {
  totalCoeficientes: number;
  totalUnidades: number;
  presentes?: { coeficiente: number; unidades: number } | null;
  calculadoEn: string;
};

/** Resultado en vivo (o el guardado al cierre si la votación está cerrada). */
export async function resultadosVotacion(ctx: Db, v: Votacion): Promise<ResultadoGuardado> {
  if (v.estado === "CERRADA" && v.resultado) return v.resultado as unknown as ResultadoGuardado;
  return calcularResultadoActual(ctx, v);
}

export async function calcularResultadoActual(ctx: Db, v: Votacion): Promise<ResultadoGuardado> {
  const [votos, totales, presentes] = await Promise.all([
    ctx.db.voto.findMany({ where: { votacionId: v.id }, select: { unidadId: true, opcionId: true, coeficiente: true } }),
    totalesConjunto(ctx),
    v.asambleaId
      ? ctx.db.asistenciaAsamblea.aggregate({ where: { asambleaId: v.asambleaId, salidaEn: null }, _sum: { coeficiente: true }, _count: { _all: true } })
      : Promise.resolve(null),
  ]);
  const pres = presentes ? { coeficiente: toNumber(presentes._sum.coeficiente), unidades: presentes._count._all } : undefined;
  const r = calcularResultado({
    opciones: parseOpciones(v.opciones),
    votos: votos.map((x) => ({ unidadId: x.unidadId, opcionId: x.opcionId, coeficiente: toNumber(x.coeficiente) })),
    ponderacion: v.ponderacion,
    tipoMayoria: v.tipoMayoria,
    totalCoeficientes: totales.totalCoeficientes,
    totalUnidades: totales.totalUnidades,
    presentes: pres,
  });
  return { ...r, ...totales, presentes: pres ?? null, calculadoEn: new Date().toISOString() };
}

// ───────────────────────────── ABRIR / CERRAR / ANULAR ─────────────────────────────

/** Abre una votación en borrador (puntos de asamblea): inicia ahora y cierra en `minutos`. */
export async function abrirVotacion(ctx: Ctx, id: string, minutos = 15) {
  const v = await obtenerVotacion(ctx, id);
  if (v.estado !== "BORRADOR") throw new AppError("Solo se pueden abrir votaciones en borrador.");
  if (v.asambleaId && v.asamblea?.estado !== "EN_CURSO") throw new AppError("Inicia la asamblea antes de abrir la votación del punto.");
  const inicio = new Date();
  const u = await ctx.db.votacion.update({ where: { id }, data: { estado: "ABIERTA", inicio, fin: new Date(inicio.getTime() + minutos * 60_000) } });
  await audit(ctx, "abrir", "Votacion", id, { estado: v.estado }, { estado: "ABIERTA", fin: u.fin });
  await emit({ tipo: "votacion.abierta", conjuntoId: ctx.conjuntoId, data: { id, asambleaId: v.asambleaId }, actorId: ctx.userId });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `votacion:${id}`, tipo: "estado", data: { estado: "ABIERTA" } });
  if (v.asambleaId) await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${v.asambleaId}`, tipo: "votacion", data: { votacionId: id, estado: "ABIERTA" } });
  return u;
}

/** Cierra la votación, calcula y guarda el resultado y asigna el código de verificación del acta. */
export async function cerrarVotacion(ctx: Ctx, id: string, opts?: { automatico?: boolean }) {
  const v = await obtenerVotacion(ctx, id);
  if (v.estado === "CERRADA") return v;
  if (v.estado !== "ABIERTA") throw new AppError("Solo se pueden cerrar votaciones abiertas.");
  const resultado = await calcularResultadoActual(ctx, v);
  const ahora = new Date();
  let codigo = v.codigoActa;
  for (let i = 0; !codigo && i < 5; i++) {
    const c = codigoVerificacion("VOT");
    if (!(await prisma.votacion.findUnique({ where: { codigoActa: c } }))) codigo = c;
  }
  const u = await ctx.db.votacion.update({
    where: { id },
    data: { estado: "CERRADA", resultado: resultado as unknown as Prisma.InputJsonValue, codigoActa: codigo, fin: ahora < v.fin ? ahora : v.fin },
  });
  await audit(ctx, opts?.automatico ? "cierre_automatico" : "cerrar", "Votacion", id, { estado: v.estado }, { estado: "CERRADA", decision: resultado.decision, aprobada: resultado.aprobada, codigoActa: codigo });
  await emit({ tipo: "votacion.cerrada", conjuntoId: ctx.conjuntoId, data: { id, asambleaId: v.asambleaId, aprobada: resultado.aprobada, codigoActa: codigo }, actorId: ctx.userId });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `votacion:${id}`, tipo: "estado", data: { estado: "CERRADA" } });
  if (v.asambleaId) await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `asamblea:${v.asambleaId}`, tipo: "votacion", data: { votacionId: id, estado: "CERRADA" } });
  else await notificarVotantes(ctx, u, "Votación cerrada", `${u.pregunta} — ${resultado.decision}`);
  return u;
}

export async function anularVotacion(ctx: Ctx, id: string, motivo: string) {
  const v = await obtenerVotacion(ctx, id);
  if (v.estado === "ANULADA") return v;
  const u = await ctx.db.votacion.update({ where: { id }, data: { estado: "ANULADA", descripcion: [v.descripcion, `Anulada: ${motivo}`].filter(Boolean).join("\n\n") } });
  await audit(ctx, "anular", "Votacion", id, { estado: v.estado }, { estado: "ANULADA", motivo });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `votacion:${id}`, tipo: "estado", data: { estado: "ANULADA" } });
  return u;
}

// ───────────────────────────── COMPROBANTES ─────────────────────────────

export type VerificacionComprobante =
  | { valido: false }
  | { valido: true; votacionId: string; pregunta: string; emitidoEn: Date; estado: string; unidad: string | null; opcion: string | null; porPoder: boolean };

/**
 * Verifica un comprobante de voto. Cualquier usuario del conjunto confirma que el voto existe y cuándo
 * se registró; la unidad y la opción solo se revelan a quien pertenece la unidad (o si el voto es nominal
 * y quien consulta puede gestionar votaciones).
 */
export async function verificarComprobante(ctx: Ctx, hash: string): Promise<VerificacionComprobante> {
  const h = hash.trim().toLowerCase();
  if (!esComprobanteValido(h)) return { valido: false };
  const voto = await ctx.db.voto.findUnique({ where: { comprobanteHash: h }, include: { votacion: true, unidad: { select: { codigo: true } } } });
  if (!voto) return { valido: false };
  const propio = ctx.unidadIds.includes(voto.unidadId) || voto.usuarioId === ctx.userId;
  const gestor = !voto.votacion.secreto && can(ctx, ["votaciones.crear", "asambleas.gestionar"]);
  const ver = propio || gestor;
  const opcion = parseOpciones(voto.votacion.opciones).find((o) => o.id === voto.opcionId)?.texto ?? null;
  return {
    valido: true,
    votacionId: voto.votacionId,
    pregunta: voto.votacion.pregunta,
    emitidoEn: voto.emitidoEn,
    estado: voto.votacion.estado,
    unidad: ver ? voto.unidad.codigo : null,
    opcion: ver ? opcion : null,
    porPoder: voto.porPoder,
  };
}

/** Votos nominales (para el acta). En votaciones secretas no se revela la opción de cada unidad. */
export async function detalleVotos(ctx: Db, v: Votacion) {
  const votos = await ctx.db.voto.findMany({ where: { votacionId: v.id }, include: { unidad: { select: { codigo: true } } }, orderBy: { emitidoEn: "asc" } });
  const opciones = parseOpciones(v.opciones);
  return votos.map((x) => ({
    unidad: x.unidad.codigo,
    coeficiente: toNumber(x.coeficiente),
    votante: v.secreto ? null : x.votanteNombre,
    opcion: v.secreto ? null : (opciones.find((o) => o.id === x.opcionId)?.texto ?? x.opcionId),
    porPoder: x.porPoder,
    emitidoEn: x.emitidoEn,
    comprobante: x.comprobanteHash,
  }));
}

// ───────────────────────────── JOB ─────────────────────────────

/** Cierra las votaciones abiertas cuya fecha de cierre ya pasó (todos los conjuntos). */
export async function cerrarVotacionesVencidas(ctxFor: (conjuntoId: string) => Promise<Ctx>, ahora = new Date()) {
  const vencidas = await prisma.votacion.findMany({ where: { estado: "ABIERTA", fin: { lte: ahora }, deletedAt: null }, select: { id: true, conjuntoId: true } });
  let n = 0;
  for (const v of vencidas) {
    try {
      await cerrarVotacion(await ctxFor(v.conjuntoId), v.id, { automatico: true });
      n++;
    } catch (e) {
      console.error("[votaciones] no se pudo cerrar", v.id, (e as Error).message);
    }
  }
  return n;
}
