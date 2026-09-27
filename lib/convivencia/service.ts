import type { EstadoIncidente, EstadoMulta, GravedadLlamado, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { can, seesAll } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso, usuariosDeUnidad } from "@/lib/notificaciones";
import { crearCargo } from "@/lib/cartera/core";
import { cop, fecha, toNumber } from "@/lib/format";
import { DIAS_DESCARGOS, plazoDescargos, puedeDecidir, puedePresentarDescargos, puedeTransicionarMulta } from "./debido-proceso";

/**
 * Convivencia: llamados de atención, multas con debido proceso, catálogo de infracciones e incidentes.
 * Privacidad: sin `convivencia.ver_todos` el usuario solo ve lo de sus unidades; nada de esto es
 * visible para otros residentes. El tono de los mensajes es respetuoso y no confrontacional.
 */

type CCtx = Ctx;

const usuarioReal = (ctx: Pick<Ctx, "userId">) => (ctx.userId === "sistema" || ctx.userId.startsWith("api:") ? null : ctx.userId);

export function esGestor(ctx: CCtx) {
  return seesAll(ctx, "convivencia");
}

function assertUnidadPropia(ctx: CCtx, unidadId: string) {
  if (!esGestor(ctx) && !ctx.unidadIds.includes(unidadId)) notFound("El registro");
}

/** Destinatarios de una comunicación a la unidad: residentes vinculados y la persona involucrada. */
async function destinatariosUnidad(ctx: CCtx, unidadId: string, personaId?: string | null) {
  const ids = await usuariosDeUnidad(ctx.conjuntoId, unidadId);
  if (personaId) {
    const p = await ctx.db.persona.findUnique({ where: { id: personaId }, select: { usuarioId: true } });
    if (p?.usuarioId) ids.push(p.usuarioId);
  }
  return [...new Set(ids)].filter((u) => u !== ctx.userId);
}

// ─────────────────────────────── Catálogo ───────────────────────────────

export async function listarInfracciones(ctx: CCtx, soloActivas = false) {
  return ctx.db.catalogoInfraccion.findMany({ where: soloActivas ? { activo: true } : {}, orderBy: { codigo: "asc" } });
}

export async function guardarInfraccion(
  ctx: CCtx,
  input: { id?: string | null; codigo: string; nombre: string; descripcion?: string | null; valorSugerido: number; gravedad: GravedadLlamado; articulo?: string | null; activo: boolean },
) {
  if (!can(ctx, "convivencia.infracciones")) throw new AppError("No tienes permiso para editar el catálogo.", 403);
  const data = {
    codigo: input.codigo.toUpperCase(),
    nombre: input.nombre,
    descripcion: input.descripcion ?? null,
    valorSugerido: input.valorSugerido,
    gravedad: input.gravedad,
    articulo: input.articulo ?? null,
    activo: input.activo,
  };
  if (input.id) {
    const antes = await ctx.db.catalogoInfraccion.findUnique({ where: { id: input.id } });
    if (!antes) notFound("La infracción");
    const r = await ctx.db.catalogoInfraccion.update({ where: { id: input.id }, data });
    await audit(ctx, "editar", "CatalogoInfraccion", r.id, antes, data);
    return r;
  }
  const r = await ctx.db.catalogoInfraccion.create({ data: { conjuntoId: ctx.conjuntoId, ...data } });
  await audit(ctx, "crear", "CatalogoInfraccion", r.id, undefined, data);
  return r;
}

// ─────────────────────────────── Llamados de atención ───────────────────────────────

export function whereLlamados(ctx: CCtx): Prisma.LlamadoAtencionWhereInput {
  return esGestor(ctx) ? {} : { unidadId: { in: ctx.unidadIds } };
}

export async function obtenerLlamado(ctx: CCtx, id: string) {
  const l = await ctx.db.llamadoAtencion.findFirst({
    where: { AND: [{ id }, whereLlamados(ctx)] },
    include: { unidad: { select: { id: true, codigo: true } }, persona: { select: { id: true, nombres: true, apellidos: true } } },
  });
  if (!l) notFound("El llamado de atención");
  const [infraccion, enviadoPor, multa] = await Promise.all([
    l.infraccionId ? ctx.db.catalogoInfraccion.findUnique({ where: { id: l.infraccionId } }) : null,
    l.enviadoPorId ? prisma.usuario.findUnique({ where: { id: l.enviadoPorId }, select: { nombre: true } }) : null,
    l.multaId ? ctx.db.multa.findUnique({ where: { id: l.multaId }, select: { id: true, estado: true, valor: true } }) : null,
  ]);
  return { ...l, infraccion, enviadoPor, multa };
}

export async function crearLlamado(
  ctx: CCtx,
  input: { unidadId: string; personaId?: string | null; infraccionId?: string | null; motivo?: string | null; descripcion: string; evidencias?: string[]; gravedad?: GravedadLlamado | null },
) {
  if (!can(ctx, "convivencia.crear")) throw new AppError("No tienes permiso para enviar llamados de atención.", 403);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const infraccion = input.infraccionId ? await ctx.db.catalogoInfraccion.findUnique({ where: { id: input.infraccionId } }) : null;
  if (input.infraccionId && !infraccion) notFound("La infracción");
  const motivo = input.motivo?.trim() || infraccion?.nombre;
  if (!motivo) throw new AppError("Indica el motivo o selecciona una infracción del catálogo.", 400, { motivo: "Indica el motivo" });
  if (input.personaId) {
    const v = await ctx.db.vinculoUnidad.findFirst({ where: { personaId: input.personaId, unidadId: input.unidadId } });
    if (!v) throw new AppError("La persona seleccionada no está vinculada a esa unidad.");
  }
  const l = await ctx.db.llamadoAtencion.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      personaId: input.personaId ?? null,
      infraccionId: infraccion?.id ?? null,
      motivo,
      descripcion: input.descripcion,
      evidencias: input.evidencias ?? [],
      gravedad: input.gravedad ?? infraccion?.gravedad ?? "LEVE",
      enviadoPorId: usuarioReal(ctx),
    },
  });
  await audit(ctx, "crear", "LlamadoAtencion", l.id, undefined, { unidad: unidad.codigo, motivo, gravedad: l.gravedad });
  await emit({ tipo: "convivencia.llamado_creado", conjuntoId: ctx.conjuntoId, data: { id: l.id, unidadId: l.unidadId }, actorId: usuarioReal(ctx) });
  const ids = await destinatariosUnidad(ctx, l.unidadId, l.personaId);
  if (ids.length) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: ids,
      titulo: "Tienes una comunicación de convivencia",
      cuerpo: `La administración te comparte un llamado de atención sobre: ${motivo}. Te invitamos a leerlo y, si lo deseas, responder.`,
      enlace: `/convivencia/llamados/${l.id}`,
      tipo: "CONVIVENCIA",
      canales: ["push", "email"],
    });
  }
  return l;
}

/** Acuse de recibo del residente (queda la fecha en que lo leyó). Idempotente. */
export async function acusarLlamado(ctx: CCtx, id: string) {
  const l = await ctx.db.llamadoAtencion.findFirst({ where: { AND: [{ id }, whereLlamados(ctx)] } });
  if (!l) notFound("El llamado de atención");
  if (!ctx.unidadIds.includes(l.unidadId)) throw new AppError("Solo los residentes de la unidad pueden confirmar la lectura.", 403);
  if (l.acuseEn) return l;
  const u = await ctx.db.llamadoAtencion.update({ where: { id }, data: { acuseEn: new Date(), ...(l.estado === "ENVIADO" ? { estado: "LEIDO" } : {}) } });
  await audit(ctx, "acuse", "LlamadoAtencion", id, { estado: l.estado }, { estado: u.estado, acuseEn: u.acuseEn });
  return u;
}

export async function responderLlamado(ctx: CCtx, id: string, respuesta: string) {
  const l = await ctx.db.llamadoAtencion.findFirst({ where: { AND: [{ id }, whereLlamados(ctx)] } });
  if (!l) notFound("El llamado de atención");
  if (!ctx.unidadIds.includes(l.unidadId)) throw new AppError("Solo los residentes de la unidad pueden responder.", 403);
  if (l.estado === "CERRADO" || l.estado === "ESCALADO_MULTA") throw new AppError("Este llamado ya fue cerrado. Si lo escalaron a multa, presenta tus descargos en la multa.");
  if (l.respuesta) throw new AppError("Ya enviaste tu respuesta a este llamado.");
  const ahora = new Date();
  const u = await ctx.db.llamadoAtencion.update({ where: { id }, data: { respuesta, respuestaEn: ahora, acuseEn: l.acuseEn ?? ahora, estado: "RESPONDIDO" } });
  await audit(ctx, "responder", "LlamadoAtencion", id, { estado: l.estado }, { estado: "RESPONDIDO" });
  const ids = [...new Set([...(l.enviadoPorId ? [l.enviadoPorId] : []), ...(await usuariosConPermiso(ctx.conjuntoId, ["convivencia.crear"]))])].filter((x) => x !== ctx.userId);
  if (ids.length) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: ids, titulo: "Respuesta a un llamado de atención", cuerpo: respuesta.slice(0, 200), enlace: `/convivencia/llamados/${id}`, tipo: "CONVIVENCIA" });
  }
  return u;
}

export async function cerrarLlamado(ctx: CCtx, id: string, nota?: string | null) {
  if (!can(ctx, "convivencia.crear")) throw new AppError("No tienes permiso para cerrar llamados.", 403);
  const l = await ctx.db.llamadoAtencion.findUnique({ where: { id } });
  if (!l) notFound("El llamado de atención");
  if (l.estado === "ESCALADO_MULTA") throw new AppError("El llamado ya se escaló a multa.");
  const u = await ctx.db.llamadoAtencion.update({ where: { id }, data: { estado: "CERRADO" } });
  await audit(ctx, "cerrar", "LlamadoAtencion", id, { estado: l.estado }, { estado: "CERRADO", nota });
  return u;
}

// ─────────────────────────────── Multas ───────────────────────────────

/** Los residentes no ven multas en PROPUESTA (aún no han sido notificadas). */
export function whereMultas(ctx: CCtx): Prisma.MultaWhereInput {
  return esGestor(ctx) ? {} : { unidadId: { in: ctx.unidadIds }, estado: { not: "PROPUESTA" } };
}

export async function obtenerMulta(ctx: CCtx, id: string) {
  const m = await ctx.db.multa.findFirst({
    where: { AND: [{ id }, whereMultas(ctx)] },
    include: { unidad: { select: { id: true, codigo: true } }, persona: { select: { id: true, nombres: true, apellidos: true } } },
  });
  if (!m) notFound("La multa");
  const [infraccion, decididaPor, cuota, llamado] = await Promise.all([
    m.infraccionId ? ctx.db.catalogoInfraccion.findUnique({ where: { id: m.infraccionId } }) : null,
    m.decididaPorId ? prisma.usuario.findUnique({ where: { id: m.decididaPorId }, select: { nombre: true } }) : null,
    m.cuotaId ? ctx.db.cuota.findUnique({ where: { id: m.cuotaId }, select: { id: true, saldo: true, estado: true, fechaVencimiento: true, referenciaPago: true } }) : null,
    m.llamadoId ? ctx.db.llamadoAtencion.findUnique({ where: { id: m.llamadoId }, select: { id: true, motivo: true, fecha: true } }) : null,
  ]);
  return { ...m, infraccion, decididaPor, cuota, llamado };
}

export type ProponerMultaInput = {
  unidadId: string;
  personaId?: string | null;
  infraccionId?: string | null;
  llamadoId?: string | null;
  descripcion: string;
  evidencias?: string[];
  /** Si no se indica, se usa el valor sugerido de la infracción del catálogo. */
  valor?: number | null;
};

export async function proponerMulta(ctx: CCtx, input: ProponerMultaInput) {
  if (!can(ctx, "convivencia.crear")) throw new AppError("No tienes permiso para proponer multas.", 403);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  let llamado = null;
  if (input.llamadoId) {
    llamado = await ctx.db.llamadoAtencion.findUnique({ where: { id: input.llamadoId } });
    if (!llamado) notFound("El llamado de atención");
    if (llamado.unidadId !== input.unidadId) throw new AppError("El llamado es de otra unidad.");
    if (llamado.multaId) throw new AppError("Este llamado ya tiene una multa asociada.");
  }
  const infraccionId = input.infraccionId ?? llamado?.infraccionId ?? null;
  const infraccion = infraccionId ? await ctx.db.catalogoInfraccion.findUnique({ where: { id: infraccionId } }) : null;
  if (infraccionId && !infraccion) notFound("La infracción");
  const valor = input.valor && input.valor > 0 ? input.valor : toNumber(infraccion?.valorSugerido);
  if (!(valor > 0)) throw new AppError("Indica el valor de la multa.", 400, { valor: "Indica el valor" });
  const m = await ctx.db.multa.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      personaId: input.personaId ?? llamado?.personaId ?? null,
      infraccionId,
      llamadoId: llamado?.id ?? null,
      descripcion: input.descripcion,
      evidencias: input.evidencias?.length ? input.evidencias : (llamado?.evidencias ?? []),
      valor,
      estado: "PROPUESTA",
    },
  });
  if (llamado) await ctx.db.llamadoAtencion.update({ where: { id: llamado.id }, data: { estado: "ESCALADO_MULTA", multaId: m.id } });
  await audit(ctx, "proponer", "Multa", m.id, undefined, { unidad: unidad.codigo, valor, llamadoId: llamado?.id });
  return m;
}

async function cargarMultaGestion(ctx: CCtx, id: string) {
  const m = await ctx.db.multa.findUnique({ where: { id } });
  if (!m) notFound("La multa");
  return m;
}

/** Notifica la multa al residente y abre el plazo de descargos (días hábiles). */
export async function notificarMulta(ctx: CCtx, id: string, dias = DIAS_DESCARGOS, ahora = new Date()) {
  if (!can(ctx, "convivencia.crear")) throw new AppError("No tienes permiso para notificar multas.", 403);
  const m = await cargarMultaGestion(ctx, id);
  if (!puedeTransicionarMulta(m.estado, "NOTIFICADA")) throw new AppError("Solo se notifican multas en estado propuesta.");
  const plazo = plazoDescargos(ahora, dias);
  const r = await ctx.db.multa.updateMany({ where: { id, estado: "PROPUESTA" }, data: { estado: "NOTIFICADA", notificadaEn: ahora, plazoDescargos: plazo } });
  if (r.count === 0) throw new AppError("La multa cambió mientras la notificabas. Recarga la página.");
  await audit(ctx, "notificar", "Multa", id, { estado: m.estado }, { estado: "NOTIFICADA", plazoDescargos: plazo, dias });
  await emit({ tipo: "convivencia.multa_notificada", conjuntoId: ctx.conjuntoId, data: { id, unidadId: m.unidadId }, actorId: usuarioReal(ctx) });
  const ids = await destinatariosUnidad(ctx, m.unidadId, m.personaId);
  if (ids.length) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: ids,
      titulo: "Notificación de posible multa",
      cuerpo: `Se inició un proceso por "${m.descripcion.slice(0, 80)}" con un valor propuesto de ${cop(m.valor)}. Tienes hasta el ${fecha(plazo)} para presentar tus descargos; el consejo los tendrá en cuenta antes de decidir.`,
      enlace: `/convivencia/multas/${id}`,
      tipo: "CONVIVENCIA",
      canales: ["push", "email"],
    });
  }
  return { ...m, estado: "NOTIFICADA" as EstadoMulta, notificadaEn: ahora, plazoDescargos: plazo };
}

/** Descargos del residente (o registrados por la administración si llegaron por escrito). */
export async function presentarDescargos(ctx: CCtx, id: string, descargos: string, ahora = new Date()) {
  const m = await ctx.db.multa.findFirst({ where: { AND: [{ id }, whereMultas(ctx)] } });
  if (!m) notFound("La multa");
  const esResidente = ctx.unidadIds.includes(m.unidadId);
  if (!esResidente && !can(ctx, "convivencia.crear")) throw new AppError("Solo los residentes de la unidad pueden presentar descargos.", 403);
  const v = puedePresentarDescargos(m, ahora);
  if (!v.ok) throw new AppError(v.motivo!);
  const r = await ctx.db.multa.updateMany({ where: { id, estado: "NOTIFICADA" }, data: { estado: "EN_DESCARGOS", descargos, descargosEn: ahora } });
  if (r.count === 0) throw new AppError("La multa cambió mientras enviabas tus descargos. Recarga la página.");
  await audit(ctx, "descargos", "Multa", id, { estado: m.estado }, { estado: "EN_DESCARGOS", registradoPor: esResidente ? "residente" : "administracion" });
  const consejo = (await usuariosConPermiso(ctx.conjuntoId, ["convivencia.decidir"])).filter((x) => x !== ctx.userId);
  if (consejo.length) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: consejo, titulo: "Descargos recibidos: multa lista para decisión", cuerpo: descargos.slice(0, 200), enlace: `/convivencia/multas/${id}`, tipo: "CONVIVENCIA" });
  }
  return { ...m, estado: "EN_DESCARGOS" as EstadoMulta, descargos, descargosEn: ahora };
}

/**
 * Decisión del consejo. RATIFICADA: se carga a cartera (concepto MULTA, origen MULTA) y se guarda
 * `cuotaId`; se notifica con el valor y el enlace de pago. REVOCADA: se archiva con la resolución.
 */
export async function decidirMulta(ctx: CCtx, id: string, input: { decision: "RATIFICADA" | "REVOCADA"; resolucion: string; valor?: number | null; diasVencimiento?: number }, ahora = new Date()) {
  if (!can(ctx, "convivencia.decidir")) throw new AppError("Solo el consejo de administración puede decidir multas.", 403);
  const m = await cargarMultaGestion(ctx, id);
  if (m.estado === "PROPUESTA" && input.decision === "REVOCADA") {
    // Desistir de una propuesta que nunca se notificó.
  } else {
    const v = puedeDecidir(m, ahora);
    if (!v.ok) throw new AppError(v.motivo!);
  }
  const valor = input.decision === "RATIFICADA" ? (input.valor && input.valor > 0 ? input.valor : toNumber(m.valor)) : toNumber(m.valor);
  const r = await ctx.db.multa.updateMany({
    where: { id, estado: m.estado },
    data: { estado: input.decision, resolucion: input.resolucion, resolucionEn: ahora, decididaPorId: usuarioReal(ctx), valor },
  });
  if (r.count === 0) throw new AppError("La multa ya fue decidida por otra persona. Recarga la página.");
  let cuotaId: string | null = null;
  if (input.decision === "RATIFICADA") {
    try {
      const infraccion = m.infraccionId ? await ctx.db.catalogoInfraccion.findUnique({ where: { id: m.infraccionId }, select: { nombre: true } }) : null;
      const cuota = await crearCargo(ctx, {
        unidadId: m.unidadId,
        conceptoTipo: "MULTA",
        valorBase: valor,
        descripcion: `Multa: ${(infraccion?.nombre ?? m.descripcion).slice(0, 90)}`,
        fechaEmision: ahora,
        fechaVencimiento: new Date(ahora.getTime() + (input.diasVencimiento ?? 30) * 86_400_000),
        origen: "MULTA",
      });
      cuotaId = cuota.id;
      await ctx.db.multa.update({ where: { id }, data: { cuotaId } });
    } catch (e) {
      await ctx.db.multa.update({ where: { id }, data: { estado: m.estado, resolucion: m.resolucion, resolucionEn: m.resolucionEn, decididaPorId: m.decididaPorId, valor: m.valor } });
      throw e;
    }
  }
  await audit(ctx, input.decision === "RATIFICADA" ? "ratificar" : "revocar", "Multa", id, { estado: m.estado, valor: toNumber(m.valor) }, { estado: input.decision, valor, resolucion: input.resolucion, cuotaId });
  await emit({ tipo: input.decision === "RATIFICADA" ? "multa.ratificada" : "multa.revocada", conjuntoId: ctx.conjuntoId, data: { id, unidadId: m.unidadId, valor, cuotaId }, actorId: usuarioReal(ctx) });
  if (m.estado !== "PROPUESTA") {
    const ids = await destinatariosUnidad(ctx, m.unidadId, m.personaId);
    if (ids.length) {
      await notify(
        input.decision === "RATIFICADA"
          ? {
              conjuntoId: ctx.conjuntoId,
              usuarioIds: ids,
              titulo: `Multa ratificada por ${cop(valor)}`,
              cuerpo: `El consejo revisó el caso y ratificó la multa. Resolución: ${input.resolucion.slice(0, 200)}. El valor quedó cargado en el estado de cuenta de la unidad.`,
              enlace: `/cuenta/pagar?cuotas=${cuotaId}&unidad=${m.unidadId}`,
              tipo: "CONVIVENCIA",
              canales: ["push", "email"],
              data: { multaId: id, cuotaId },
            }
          : {
              conjuntoId: ctx.conjuntoId,
              usuarioIds: ids,
              titulo: "La multa fue revocada",
              cuerpo: `El consejo revisó el caso y decidió no imponer la multa. Resolución: ${input.resolucion.slice(0, 200)}`,
              enlace: `/convivencia/multas/${id}`,
              tipo: "CONVIVENCIA",
              canales: ["push", "email"],
            },
      );
    }
  }
  return { id, estado: input.decision, cuotaId, valor };
}

// ─────────────────────────────── Incidentes ───────────────────────────────

export type SesionMediacion = { id: string; fecha: string; asistentes: string; notas: string; compromisos: string; registradaPor: string };

export function whereIncidentes(ctx: CCtx): Prisma.IncidenteConvivenciaWhereInput {
  return esGestor(ctx) ? {} : { unidadesIds: { hasSome: ctx.unidadIds.length ? ctx.unidadIds : ["-"] } };
}

export async function obtenerIncidente(ctx: CCtx, id: string) {
  const i = await ctx.db.incidenteConvivencia.findFirst({ where: { AND: [{ id }, whereIncidentes(ctx)] } });
  if (!i) notFound("El incidente");
  const [unidades, mediador] = await Promise.all([
    ctx.db.unidad.findMany({ where: { id: { in: i.unidadesIds } }, select: { id: true, codigo: true } }),
    i.mediadorId ? prisma.usuario.findUnique({ where: { id: i.mediadorId }, select: { nombre: true } }) : null,
  ]);
  return { ...i, unidades, mediador, sesionesLista: (Array.isArray(i.sesiones) ? i.sesiones : []) as unknown as SesionMediacion[] };
}

function assertIncidentes(ctx: CCtx) {
  if (!can(ctx, "convivencia.incidentes")) throw new AppError("No tienes permiso para gestionar incidentes de convivencia.", 403);
}

export async function crearIncidente(ctx: CCtx, input: { titulo: string; descripcion: string; unidadesIds: string[] }) {
  assertIncidentes(ctx);
  const ids = [...new Set(input.unidadesIds.filter(Boolean))];
  if (ids.length < 1) throw new AppError("Selecciona al menos una unidad involucrada.", 400, { unidadesIds: "Selecciona las unidades" });
  const n = await ctx.db.unidad.count({ where: { id: { in: ids } } });
  if (n !== ids.length) notFound("Una de las unidades");
  const i = await ctx.db.incidenteConvivencia.create({
    data: { conjuntoId: ctx.conjuntoId, titulo: input.titulo, descripcion: input.descripcion, unidadesIds: ids, creadoPorId: usuarioReal(ctx) },
  });
  await audit(ctx, "crear", "IncidenteConvivencia", i.id, undefined, { titulo: i.titulo, unidadesIds: ids });
  return i;
}

export async function agregarSesion(ctx: CCtx, id: string, input: { fecha: Date; asistentes: string; notas: string; compromisos?: string | null }) {
  assertIncidentes(ctx);
  const i = await ctx.db.incidenteConvivencia.findUnique({ where: { id } });
  if (!i) notFound("El incidente");
  if (i.estado === "CERRADO") throw new AppError("El incidente está cerrado.");
  const sesiones = (Array.isArray(i.sesiones) ? i.sesiones : []) as unknown as SesionMediacion[];
  const nueva: SesionMediacion = {
    id: Math.random().toString(36).slice(2, 10),
    fecha: input.fecha.toISOString(),
    asistentes: input.asistentes,
    notas: input.notas,
    compromisos: input.compromisos ?? "",
    registradaPor: ctx.nombre,
  };
  const u = await ctx.db.incidenteConvivencia.update({
    where: { id },
    data: { sesiones: [...sesiones, nueva] as unknown as Prisma.InputJsonValue, estado: i.estado === "ABIERTO" ? "EN_MEDIACION" : i.estado, mediadorId: i.mediadorId ?? usuarioReal(ctx) },
  });
  await audit(ctx, "sesion_mediacion", "IncidenteConvivencia", id, undefined, { fecha: nueva.fecha });
  return u;
}

export async function actualizarIncidente(ctx: CCtx, id: string, input: { estado: EstadoIncidente; acuerdos?: string | null }) {
  assertIncidentes(ctx);
  const i = await ctx.db.incidenteConvivencia.findUnique({ where: { id } });
  if (!i) notFound("El incidente");
  if (input.estado === "ACUERDO" && !(input.acuerdos ?? i.acuerdos)) throw new AppError("Describe los acuerdos alcanzados.", 400, { acuerdos: "Describe los acuerdos" });
  const u = await ctx.db.incidenteConvivencia.update({ where: { id }, data: { estado: input.estado, ...(input.acuerdos !== undefined ? { acuerdos: input.acuerdos } : {}) } });
  await audit(ctx, "actualizar", "IncidenteConvivencia", id, { estado: i.estado }, { estado: input.estado, acuerdos: input.acuerdos });
  if (input.estado === "ACUERDO" || input.estado === "CERRADO") {
    const destinatarios = new Set<string>();
    for (const uid of i.unidadesIds) for (const x of await usuariosDeUnidad(ctx.conjuntoId, uid)) destinatarios.add(x);
    destinatarios.delete(ctx.userId);
    if (destinatarios.size) {
      await notify({
        conjuntoId: ctx.conjuntoId,
        usuarioIds: [...destinatarios],
        titulo: input.estado === "ACUERDO" ? "Se registraron acuerdos de convivencia" : "Incidente de convivencia cerrado",
        cuerpo: i.titulo,
        enlace: `/convivencia/incidentes/${id}`,
        tipo: "CONVIVENCIA",
      });
    }
  }
  return u;
}

// ─────────────────────────────── Historial por unidad ───────────────────────────────

export async function historialUnidad(ctx: CCtx, unidadId: string) {
  assertUnidadPropia(ctx, unidadId);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const [llamados, multas, incidentes] = await Promise.all([
    ctx.db.llamadoAtencion.findMany({ where: { AND: [{ unidadId }, whereLlamados(ctx)] }, orderBy: { fecha: "desc" } }),
    ctx.db.multa.findMany({ where: { AND: [{ unidadId }, whereMultas(ctx)] }, orderBy: { fecha: "desc" } }),
    ctx.db.incidenteConvivencia.findMany({ where: { AND: [{ unidadesIds: { has: unidadId } }, whereIncidentes(ctx)] }, orderBy: { fecha: "desc" } }),
  ]);
  const eventos = [
    ...llamados.map((l) => ({ id: l.id, tipo: "Llamado de atención", titulo: l.motivo, estado: l.estado as string, fecha: l.fecha, href: `/convivencia/llamados/${l.id}`, valor: null as number | null })),
    ...multas.map((m) => ({ id: m.id, tipo: "Multa", titulo: m.descripcion, estado: m.estado as string, fecha: m.fecha, href: `/convivencia/multas/${m.id}`, valor: toNumber(m.valor) })),
    ...incidentes.map((i) => ({ id: i.id, tipo: "Incidente", titulo: i.titulo, estado: i.estado as string, fecha: i.fecha, href: `/convivencia/incidentes/${i.id}`, valor: null })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return { unidad, eventos, totales: { llamados: llamados.length, multas: multas.length, ratificadas: multas.filter((m) => m.estado === "RATIFICADA" || m.estado === "PAGADA").length, incidentes: incidentes.length } };
}

// ─────────────────────────────── Jobs ───────────────────────────────

/** Recordatorio a residentes con plazo de descargos por vencer (≤ 2 días) y aviso al consejo de plazos vencidos. */
export async function recordatoriosDescargos(ctx: CCtx, ahora = new Date()) {
  const pronto = await ctx.db.multa.findMany({ where: { estado: "NOTIFICADA", plazoDescargos: { gte: ahora, lt: new Date(ahora.getTime() + 2 * 86_400_000) } } });
  for (const m of pronto) {
    const ids = await destinatariosUnidad(ctx, m.unidadId, m.personaId);
    if (ids.length) {
      await notify({
        conjuntoId: ctx.conjuntoId,
        usuarioIds: ids,
        titulo: "Tu plazo para presentar descargos está por vencer",
        cuerpo: `Puedes presentar tus descargos hasta el ${fecha(m.plazoDescargos)}. Es tu oportunidad de contar tu versión antes de que el consejo decida.`,
        enlace: `/convivencia/multas/${m.id}`,
        tipo: "CONVIVENCIA",
        canales: ["push", "email"],
      });
    }
  }
  const vencidas = await ctx.db.multa.findMany({ where: { estado: "NOTIFICADA", plazoDescargos: { gte: new Date(ahora.getTime() - 86_400_000), lt: ahora } }, select: { id: true } });
  if (vencidas.length) {
    const consejo = await usuariosConPermiso(ctx.conjuntoId, ["convivencia.decidir"]);
    if (consejo.length) {
      await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: consejo, titulo: `${vencidas.length} multa(s) listas para decisión`, cuerpo: "Venció el plazo de descargos sin respuesta del residente.", enlace: "/convivencia/multas?estado=NOTIFICADA", tipo: "CONVIVENCIA" });
    }
  }
  return { recordatorios: pronto.length, listasParaDecision: vencidas.length };
}
