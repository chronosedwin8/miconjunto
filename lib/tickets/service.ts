import type { EstadoTicket, OrigenTicket, Prisma, PrioridadTicket, TipoTicket } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { can, seesAll } from "@/lib/permisos";
import { nextConsecutivo } from "@/lib/consecutivo";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { notify, usuariosConRol, usuariosDeUnidad } from "@/lib/notificaciones";
import { queueBrandedEmail, renderTemplate } from "@/lib/email";
import { fecha, fechaHora, nowBogota } from "@/lib/format";
import { label } from "@/lib/labels";
import { insensitive } from "@/lib/pagination";
import {
  ESTADOS_ABIERTOS,
  TIPOS_POR_PRIORIDAD,
  TIPO_INFO,
  fechaLimiteSla,
  formatoRadicado,
  prioridadSugerida,
  puedeCalificar,
  puedeReabrir,
  puedeTransicionar,
} from "./reglas";

/**
 * Mesa de ayuda: PQRS y reportes de daños. Las acciones y la API solo validan y delegan aquí.
 * Visibilidad: con `tickets.ver_todos` se ve todo; si no, solo los tickets que el usuario radicó,
 * los de sus unidades y los que tiene asignados (mantenimiento).
 */

type TCtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre" | "permisos" | "esSuperAdmin" | "unidadIds" | "rolBase"> & Partial<Ctx>;

/** Id de usuario real (los contextos de sistema y de token de API no tienen usuario). */
export function usuarioReal(ctx: Pick<Ctx, "userId">) {
  return ctx.userId === "sistema" || ctx.userId.startsWith("api:") ? null : ctx.userId;
}

export function whereVisibles(ctx: TCtx): Prisma.TicketWhereInput {
  if (seesAll(ctx, "tickets")) return {};
  return { OR: [{ solicitanteId: ctx.userId }, { unidadId: { in: ctx.unidadIds } }, { asignadoAId: ctx.userId }] };
}

/** ¿Es el residente dueño del ticket (lo radicó o es de su unidad)? */
export function esDelResidente(ctx: Pick<Ctx, "userId" | "unidadIds">, t: { solicitanteId: string | null; unidadId: string | null }) {
  return (t.solicitanteId !== null && t.solicitanteId === ctx.userId) || (!!t.unidadId && ctx.unidadIds.includes(t.unidadId));
}

const puedeGestionar = (ctx: TCtx) => can(ctx, "tickets.gestionar");

export type FiltrosTickets = {
  q?: string;
  estado?: string;
  tipo?: string;
  prioridad?: string;
  asignado?: string;
  torre?: string;
  sla?: string;
  unidad?: string;
  abiertos?: boolean;
};

export function whereFiltros(ctx: TCtx, f: FiltrosTickets, ahora = new Date()): Prisma.TicketWhereInput {
  const and: Prisma.TicketWhereInput[] = [whereVisibles(ctx)];
  if (f.q) and.push({ OR: [{ radicado: insensitive(f.q) }, { titulo: insensitive(f.q) }, { descripcion: insensitive(f.q) }, { unidad: { codigo: insensitive(f.q) } }] });
  if (f.estado) and.push({ estado: f.estado as EstadoTicket });
  if (f.tipo) and.push({ tipo: f.tipo as TipoTicket });
  if (f.prioridad) and.push({ prioridad: f.prioridad as PrioridadTicket });
  if (f.asignado === "sin") and.push({ asignadoAId: null, proveedorId: null });
  else if (f.asignado === "yo") and.push({ asignadoAId: ctx.userId });
  else if (f.asignado) and.push({ asignadoAId: f.asignado });
  if (f.torre) and.push({ unidad: { torreId: f.torre } });
  if (f.unidad) and.push({ unidadId: f.unidad });
  if (f.sla === "vencidos") and.push({ estado: { in: [...ESTADOS_ABIERTOS] }, fechaLimite: { lt: ahora } });
  if (f.sla === "por_vencer") and.push({ estado: { in: [...ESTADOS_ABIERTOS] }, fechaLimite: { gte: ahora, lt: new Date(ahora.getTime() + 86_400_000) } });
  if (f.abiertos) and.push({ estado: { in: [...ESTADOS_ABIERTOS] } });
  return { AND: and };
}

export async function listarTickets(ctx: TCtx, f: FiltrosTickets & { take?: number; skip?: number } = {}) {
  const where = whereFiltros(ctx, f);
  const [items, total] = await Promise.all([
    ctx.db.ticket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: f.take ?? 50,
      skip: f.skip ?? 0,
      include: {
        unidad: { select: { codigo: true } },
        zona: { select: { nombre: true } },
        asignadoA: { select: { id: true, nombre: true } },
      },
    }),
    ctx.db.ticket.count({ where }),
  ]);
  return { items, total };
}

export async function obtenerTicket(ctx: TCtx, id: string) {
  const verInternos = can(ctx, "tickets.comentario_interno");
  const t = await ctx.db.ticket.findFirst({
    where: { AND: [{ id }, whereVisibles(ctx)] },
    include: {
      unidad: { select: { id: true, codigo: true, torreId: true } },
      zona: { select: { id: true, nombre: true } },
      activo: { select: { id: true, nombre: true } },
      solicitante: { select: { id: true, nombre: true, email: true } },
      asignadoA: { select: { id: true, nombre: true } },
      comentarios: {
        where: { deletedAt: null, ...(verInternos ? {} : { interno: false }) },
        orderBy: { createdAt: "asc" },
        include: { autor: { select: { id: true, nombre: true } } },
      },
    },
  });
  if (!t) notFound("El ticket");
  const [proveedor, orden] = await Promise.all([
    t.proveedorId ? ctx.db.proveedor.findUnique({ where: { id: t.proveedorId }, select: { id: true, razonSocial: true } }) : null,
    ctx.db.ordenTrabajo.findFirst({ where: { ticketId: t.id }, select: { id: true, numero: true, estado: true, fechaProgramada: true } }),
  ]);
  return { ...t, proveedor, orden };
}

async function cargar(ctx: TCtx, id: string) {
  const t = await ctx.db.ticket.findFirst({ where: { AND: [{ id }, whereVisibles(ctx)] } });
  if (!t) notFound("El ticket");
  return t;
}

async function registrarComentario(
  ctx: TCtx,
  ticketId: string,
  data: { contenido: string; interno?: boolean; adjuntos?: string[]; tipo?: "COMENTARIO" | "CAMBIO_ESTADO" | "ASIGNACION" | "SISTEMA"; data?: Prisma.InputJsonValue },
) {
  return ctx.db.comentarioTicket.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      ticketId,
      autorId: usuarioReal(ctx),
      contenido: data.contenido,
      interno: data.interno ?? false,
      adjuntos: data.adjuntos ?? [],
      tipo: data.tipo ?? "COMENTARIO",
      data: data.data,
    },
  });
}

/** Notifica al solicitante (app/push/correo) y, si vino de la página pública, le escribe al correo. */
async function avisarSolicitante(ctx: TCtx, t: { id: string; radicado: string; solicitanteId: string | null; solicitanteEmail: string | null; solicitanteNombre: string | null; origen: OrigenTicket; unidadId: string | null }, titulo: string, cuerpo: string) {
  if (t.origen === "PUBLICO" && t.solicitanteEmail) {
    await queueBrandedEmail(
      t.solicitanteEmail,
      `${titulo} — radicado ${t.radicado}`,
      { conjuntoNombre: ctx.conjunto.nombre, color: ctx.conjunto.colorPrimario ?? undefined, parrafos: [`Hola ${t.solicitanteNombre ?? ""}:`, cuerpo, `Radicado: ${t.radicado}.`] },
      { conjuntoId: ctx.conjuntoId },
    ).catch(() => undefined);
    return;
  }
  const ids = t.solicitanteId ? [t.solicitanteId] : t.unidadId ? await usuariosDeUnidad(ctx.conjuntoId, t.unidadId) : [];
  const destinatarios = ids.filter((u) => u !== ctx.userId);
  if (destinatarios.length) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: destinatarios, titulo, cuerpo, enlace: `/tickets/${t.id}`, tipo: "TICKET", canales: ["push", "email"] });
  }
}

async function administradores(conjuntoId: string) {
  return usuariosConRol(conjuntoId, ["ADMINISTRADOR", "ASISTENTE_ADMIN"]);
}

export type CrearTicketInput = {
  tipo: TipoTicket;
  titulo?: string | null;
  descripcion: string;
  adjuntos?: string[];
  unidadId?: string | null;
  zonaId?: string | null;
  activoId?: string | null;
  ubicacion?: string | null;
  prioridad?: PrioridadTicket | null;
  urgente?: boolean;
  solicitanteNombre?: string | null;
  solicitanteEmail?: string | null;
  solicitanteTelefono?: string | null;
};

/** Radica un ticket: consecutivo por año, SLA calculado, historial inicial, evento y avisos. */
export async function crearTicket(ctx: TCtx, input: CrearTicketInput, opts: { origen?: OrigenTicket } = {}) {
  const gestiona = seesAll(ctx, "tickets") || puedeGestionar(ctx);
  let unidadId = input.unidadId ?? null;
  if (unidadId && !seesAll(ctx, "tickets") && !ctx.unidadIds.includes(unidadId) && !can(ctx, "porteria.ver")) {
    throw new AppError("Solo puedes radicar tickets de tus propias unidades.", 403);
  }
  if (!unidadId && !seesAll(ctx, "tickets") && ctx.unidadIds.length > 0 && input.tipo !== "DANO_ZONA_COMUN") unidadId = ctx.unidadIds[0];
  if (unidadId && !(await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { id: true } }))) notFound("La unidad");
  if (input.zonaId && !(await ctx.db.zonaComun.findUnique({ where: { id: input.zonaId }, select: { id: true } }))) notFound("La zona común");
  let zonaId = input.zonaId ?? null;
  if (input.activoId) {
    const a = await ctx.db.activo.findUnique({ where: { id: input.activoId }, select: { id: true, zonaId: true } });
    if (!a) notFound("El activo");
    zonaId ??= a.zonaId;
  }
  let prioridad: PrioridadTicket = prioridadSugerida(input.tipo);
  if (gestiona && input.prioridad) prioridad = input.prioridad;
  else if (input.urgente && TIPOS_POR_PRIORIDAD.includes(input.tipo)) prioridad = "URGENTE";

  const ahora = new Date();
  const anio = nowBogota(ahora).year;
  const radicado = formatoRadicado(anio, await nextConsecutivo(ctx.conjuntoId, "RADICADO", anio));
  const descripcion = input.descripcion.trim();
  const titulo = input.titulo?.trim() || `${TIPO_INFO[input.tipo].titulo}: ${descripcion.split("\n")[0].slice(0, 70)}`;
  const solicitanteId = opts.origen === "PUBLICO" ? null : usuarioReal(ctx);

  const t = await ctx.db.ticket.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      radicado,
      tipo: input.tipo,
      unidadId,
      solicitanteId,
      solicitanteNombre: input.solicitanteNombre ?? (solicitanteId ? ctx.nombre : null),
      solicitanteEmail: input.solicitanteEmail ?? null,
      solicitanteTelefono: input.solicitanteTelefono ?? null,
      zonaId,
      activoId: input.activoId ?? null,
      titulo: titulo.slice(0, 140),
      descripcion,
      adjuntos: input.adjuntos ?? [],
      ubicacion: input.ubicacion ?? null,
      prioridad,
      fechaLimite: fechaLimiteSla(input.tipo, prioridad, ahora),
      origen: opts.origen ?? "APP",
    },
  });
  await registrarComentario(ctx, t.id, {
    tipo: "SISTEMA",
    contenido: `Radicado ${radicado}. Fecha límite de respuesta: ${fecha(t.fechaLimite)}.`,
    data: { estado: "ABIERTO" },
  });
  await emit({ tipo: "ticket.creado", conjuntoId: ctx.conjuntoId, data: { id: t.id, radicado, tipo: t.tipo, prioridad, unidadId, origen: t.origen }, actorId: usuarioReal(ctx) });
  const admins = (await administradores(ctx.conjuntoId)).filter((u) => u !== ctx.userId);
  if (admins.length) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo: `${prioridad === "URGENTE" ? "URGENTE · " : ""}Nuevo ticket ${radicado}`,
      cuerpo: `${label(t.tipo)}: ${t.titulo}`,
      enlace: `/tickets/${t.id}`,
      tipo: "TICKET",
      canales: prioridad === "URGENTE" ? ["push", "email"] : ["push"],
    });
  }
  return t;
}

export type CambioEstadoInput = { estado: EstadoTicket; nota?: string | null; adjuntos?: string[] };

/** Cambia el estado (con validación de transición) y deja la traza en el historial. */
export async function cambiarEstado(ctx: TCtx, id: string, input: CambioEstadoInput) {
  const t = await cargar(ctx, id);
  if (!puedeGestionar(ctx)) throw new AppError("No tienes permiso para cambiar el estado del ticket.", 403);
  if (input.estado === "REABIERTO") return reabrirTicket(ctx, id, input.nota ?? "Reabierto por la administración");
  if (t.estado === input.estado) return t;
  if (!puedeTransicionar(t.estado, input.estado)) throw new AppError(`No se puede pasar de "${label(t.estado)}" a "${label(input.estado)}".`);
  const ahora = new Date();
  const actualizado = await ctx.db.ticket.update({
    where: { id },
    data: {
      estado: input.estado,
      primeraRespuestaEn: t.primeraRespuestaEn ?? ahora,
      ...(input.estado === "RESUELTO" ? { resueltoEn: ahora } : {}),
      ...(input.estado === "CERRADO" ? { cerradoEn: ahora, resueltoEn: t.resueltoEn ?? ahora } : {}),
    },
  });
  await registrarComentario(ctx, id, {
    tipo: "CAMBIO_ESTADO",
    contenido: input.nota?.trim() || `Estado: ${label(t.estado)} → ${label(input.estado)}`,
    adjuntos: input.adjuntos ?? [],
    data: { de: t.estado, a: input.estado, evidencia: (input.adjuntos?.length ?? 0) > 0 },
  });
  await audit(ctx as Ctx, "cambiar_estado", "Ticket", id, { estado: t.estado }, { estado: input.estado, nota: input.nota });
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, estado: input.estado, de: t.estado }, actorId: usuarioReal(ctx) });
  const msg =
    input.estado === "RESUELTO"
      ? `Tu solicitud ${t.radicado} fue resuelta. ${input.nota ?? ""} Cuéntanos cómo te fue calificando la atención.`
      : input.estado === "EN_ESPERA_RESIDENTE"
        ? `Necesitamos información adicional para avanzar con ${t.radicado}. ${input.nota ?? ""}`
        : `Tu solicitud ${t.radicado} cambió a "${label(input.estado)}". ${input.nota ?? ""}`;
  await avisarSolicitante(ctx, t, input.estado === "RESUELTO" ? "Solicitud resuelta" : "Actualización de tu solicitud", msg.trim());
  return actualizado;
}

/** Asigna a un usuario (mantenimiento, asistente…) y/o a un proveedor. */
export async function asignarTicket(ctx: TCtx, id: string, input: { asignadoAId?: string | null; proveedorId?: string | null; nota?: string | null }) {
  if (!can(ctx, "tickets.asignar")) throw new AppError("No tienes permiso para asignar tickets.", 403);
  const t = await cargar(ctx, id);
  if (t.estado === "CERRADO") throw new AppError("El ticket está cerrado. Reábrelo para asignarlo.");
  let asignadoNombre: string | null = null;
  if (input.asignadoAId) {
    const m = await prisma.membresiaConjunto.findFirst({
      where: { usuarioId: input.asignadoAId, conjuntoId: ctx.conjuntoId, estado: "ACTIVA", deletedAt: null },
      include: { usuario: { select: { nombre: true } } },
    });
    if (!m) throw new AppError("La persona seleccionada no pertenece a este conjunto.");
    asignadoNombre = m.usuario.nombre;
  }
  let proveedorNombre: string | null = null;
  if (input.proveedorId) {
    const p = await ctx.db.proveedor.findUnique({ where: { id: input.proveedorId }, select: { razonSocial: true } });
    if (!p) notFound("El proveedor");
    proveedorNombre = p.razonSocial;
  }
  if (!asignadoNombre && !proveedorNombre) throw new AppError("Selecciona a quién asignar el ticket.");
  const pasaAAsignado = t.estado === "ABIERTO" || t.estado === "EN_REVISION" || t.estado === "REABIERTO";
  const actualizado = await ctx.db.ticket.update({
    where: { id },
    data: {
      asignadoAId: input.asignadoAId ?? null,
      proveedorId: input.proveedorId ?? null,
      primeraRespuestaEn: t.primeraRespuestaEn ?? new Date(),
      ...(pasaAAsignado ? { estado: "ASIGNADO" } : {}),
    },
  });
  const quien = [asignadoNombre, proveedorNombre && `proveedor ${proveedorNombre}`].filter(Boolean).join(" y ");
  await registrarComentario(ctx, id, {
    tipo: "ASIGNACION",
    contenido: `Asignado a ${quien}.${input.nota ? ` ${input.nota}` : ""}`,
    data: { asignadoAId: input.asignadoAId ?? null, proveedorId: input.proveedorId ?? null, de: t.estado, a: pasaAAsignado ? "ASIGNADO" : t.estado },
  });
  await audit(ctx as Ctx, "asignar", "Ticket", id, { asignadoAId: t.asignadoAId, proveedorId: t.proveedorId }, input);
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, estado: actualizado.estado, asignadoAId: input.asignadoAId ?? null }, actorId: usuarioReal(ctx) });
  if (input.asignadoAId && input.asignadoAId !== ctx.userId) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [input.asignadoAId],
      titulo: `Te asignaron el ticket ${t.radicado}`,
      cuerpo: `${t.titulo} · vence ${fecha(t.fechaLimite)}`,
      enlace: `/tickets/${id}`,
      tipo: "TICKET",
      canales: ["push", "email"],
    });
  }
  if (pasaAAsignado) await avisarSolicitante(ctx, t, "Actualización de tu solicitud", `Tu solicitud ${t.radicado} ya fue asignada y está en manos del equipo responsable.`);
  return actualizado;
}

/** Cambia la prioridad; en daños y seguridad recalcula la fecha límite desde la radicación. */
export async function cambiarPrioridad(ctx: TCtx, id: string, prioridad: PrioridadTicket) {
  if (!puedeGestionar(ctx)) throw new AppError("No tienes permiso para cambiar la prioridad.", 403);
  const t = await cargar(ctx, id);
  if (t.prioridad === prioridad) return t;
  const recalcula = TIPOS_POR_PRIORIDAD.includes(t.tipo);
  const fechaLimite = recalcula ? fechaLimiteSla(t.tipo, prioridad, t.createdAt) : t.fechaLimite;
  const u = await ctx.db.ticket.update({ where: { id }, data: { prioridad, fechaLimite } });
  await registrarComentario(ctx, id, {
    tipo: "SISTEMA",
    interno: true,
    contenido: `Prioridad: ${label(t.prioridad)} → ${label(prioridad)}${recalcula ? `. Nueva fecha límite: ${fecha(fechaLimite)}` : ""}.`,
    data: { prioridadDe: t.prioridad, prioridadA: prioridad },
  });
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, prioridad }, actorId: usuarioReal(ctx) });
  return u;
}

/** Comentario público o interno. Si el residente responde a un ticket en espera, vuelve a gestión. */
export async function comentarTicket(ctx: TCtx, id: string, input: { contenido: string; interno?: boolean; adjuntos?: string[] }) {
  const t = await cargar(ctx, id);
  if (input.interno && !can(ctx, "tickets.comentario_interno")) throw new AppError("No tienes permiso para comentarios internos.", 403);
  if (t.estado === "CERRADO" && !puedeGestionar(ctx)) throw new AppError("El ticket está cerrado. Si el problema persiste, puedes reabrirlo.");
  const esResidente = esDelResidente(ctx, t) && !puedeGestionar(ctx);
  const gestor = puedeGestionar(ctx) && !esResidente;
  const contenido = gestor
    ? renderTemplate(input.contenido, { radicado: t.radicado, nombre: t.solicitanteNombre ?? "", fecha_limite: fecha(t.fechaLimite), conjunto: ctx.conjunto.nombre })
    : input.contenido;
  const c = await registrarComentario(ctx, id, { contenido, interno: !!input.interno, adjuntos: input.adjuntos });
  if (gestor && !input.interno && !t.primeraRespuestaEn) await ctx.db.ticket.update({ where: { id }, data: { primeraRespuestaEn: new Date() } });
  if (esResidente && t.estado === "EN_ESPERA_RESIDENTE") {
    const a: EstadoTicket = t.asignadoAId || t.proveedorId ? "EN_PROCESO" : "EN_REVISION";
    await ctx.db.ticket.update({ where: { id }, data: { estado: a } });
    await registrarComentario(ctx, id, { tipo: "CAMBIO_ESTADO", contenido: `El residente respondió. Estado: ${label(t.estado)} → ${label(a)}`, data: { de: t.estado, a } });
  }
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, comentarioId: c.id, interno: !!input.interno }, actorId: usuarioReal(ctx) });
  if (input.interno) return c;
  if (gestor) {
    await avisarSolicitante(ctx, t, `Respuesta a tu solicitud ${t.radicado}`, contenido.slice(0, 400));
  } else {
    const destino = t.asignadoAId ? [t.asignadoAId] : await administradores(ctx.conjuntoId);
    const ids = destino.filter((u) => u !== ctx.userId);
    if (ids.length) {
      await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: ids, titulo: `Nuevo mensaje en ${t.radicado}`, cuerpo: input.contenido.slice(0, 200), enlace: `/tickets/${id}`, tipo: "TICKET" });
    }
  }
  return c;
}

/** El residente califica la atención (1–5). Si estaba resuelto, queda cerrado. */
export async function calificarTicket(ctx: TCtx, id: string, input: { calificacion: number; comentario?: string | null }) {
  const t = await cargar(ctx, id);
  if (!esDelResidente(ctx, t)) throw new AppError("Solo quien radicó la solicitud puede calificarla.", 403);
  if (!puedeCalificar(t)) throw new AppError(t.calificacion ? "Esta solicitud ya fue calificada." : "Podrás calificar cuando la solicitud esté resuelta.");
  if (input.calificacion < 1 || input.calificacion > 5) throw new AppError("La calificación va de 1 a 5.");
  const ahora = new Date();
  const u = await ctx.db.ticket.update({
    where: { id },
    data: {
      calificacion: input.calificacion,
      comentarioCalificacion: input.comentario ?? null,
      ...(t.estado === "RESUELTO" ? { estado: "CERRADO", cerradoEn: ahora } : {}),
    },
  });
  await registrarComentario(ctx, id, {
    tipo: t.estado === "RESUELTO" ? "CAMBIO_ESTADO" : "SISTEMA",
    contenido: `Calificación del residente: ${"★".repeat(input.calificacion)}${"☆".repeat(5 - input.calificacion)}${input.comentario ? ` — "${input.comentario}"` : ""}`,
    data: { calificacion: input.calificacion, ...(t.estado === "RESUELTO" ? { de: "RESUELTO", a: "CERRADO" } : {}) },
  });
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, estado: u.estado, calificacion: input.calificacion }, actorId: usuarioReal(ctx) });
  if (t.asignadoAId && t.asignadoAId !== ctx.userId) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [t.asignadoAId], titulo: `Calificación de ${t.radicado}: ${input.calificacion}/5`, cuerpo: input.comentario ?? t.titulo, enlace: `/tickets/${id}`, tipo: "TICKET" });
  }
  return u;
}

/** Reabre un ticket resuelto o cerrado (reciente). El SLA se reinicia desde hoy. */
export async function reabrirTicket(ctx: TCtx, id: string, motivo: string) {
  const t = await cargar(ctx, id);
  if (!esDelResidente(ctx, t) && !puedeGestionar(ctx)) throw new AppError("No puedes reabrir este ticket.", 403);
  if (!puedeReabrir(t)) throw new AppError("Solo se pueden reabrir tickets resueltos o cerrados en los últimos 30 días. Radica uno nuevo.");
  const ahora = new Date();
  const u = await ctx.db.ticket.update({
    where: { id },
    data: {
      estado: "REABIERTO",
      reabiertoVeces: { increment: 1 },
      resueltoEn: null,
      cerradoEn: null,
      calificacion: null,
      comentarioCalificacion: null,
      fechaLimite: fechaLimiteSla(t.tipo, t.prioridad, ahora),
    },
  });
  await registrarComentario(ctx, id, { tipo: "CAMBIO_ESTADO", contenido: `Reabierto: ${motivo}`, data: { de: t.estado, a: "REABIERTO" } });
  await audit(ctx as Ctx, "reabrir", "Ticket", id, { estado: t.estado }, { estado: "REABIERTO", motivo });
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, estado: "REABIERTO", de: t.estado }, actorId: usuarioReal(ctx) });
  const destino = [...new Set([...(t.asignadoAId ? [t.asignadoAId] : []), ...(await administradores(ctx.conjuntoId))])].filter((x) => x !== ctx.userId);
  if (destino.length) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: destino, titulo: `Ticket ${t.radicado} reabierto`, cuerpo: motivo, enlace: `/tickets/${id}`, tipo: "TICKET", canales: ["push", "email"] });
  }
  return u;
}

/**
 * Genera una orden de trabajo de mantenimiento a partir de un daño (zona común o activo).
 * El módulo de mantenimiento gestiona la orden; aquí solo se crea y se enlaza con el ticket.
 */
export async function crearOrdenDesdeTicket(
  ctx: TCtx,
  id: string,
  input: { titulo?: string | null; descripcion?: string | null; fechaProgramada: Date; asignadoAId?: string | null; proveedorId?: string | null },
) {
  if (!puedeGestionar(ctx)) throw new AppError("No tienes permiso para generar órdenes de trabajo.", 403);
  const t = await cargar(ctx, id);
  if (!(t.tipo === "DANO_ZONA_COMUN" || t.zonaId || t.activoId)) throw new AppError("Solo los daños en zonas comunes o activos generan orden de trabajo.");
  const existente = await ctx.db.ordenTrabajo.findFirst({ where: { ticketId: id }, select: { numero: true } });
  if (existente) throw new AppError(`Este ticket ya tiene la orden de trabajo N.º ${existente.numero}.`);
  const numero = await nextConsecutivo(ctx.conjuntoId, "ORDEN", 0);
  const orden = await ctx.db.ordenTrabajo.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      numero,
      origen: "TICKET",
      ticketId: id,
      activoId: t.activoId,
      zonaId: t.zonaId,
      proveedorId: input.proveedorId ?? t.proveedorId ?? null,
      asignadoAId: input.asignadoAId ?? t.asignadoAId ?? null,
      titulo: (input.titulo?.trim() || `${t.radicado} · ${t.titulo}`).slice(0, 140),
      descripcion: input.descripcion ?? t.descripcion,
      fechaProgramada: input.fechaProgramada,
      evidencias: t.adjuntos,
      estado: "PROGRAMADA",
    },
  });
  await registrarComentario(ctx, id, { tipo: "SISTEMA", contenido: `Se generó la orden de trabajo N.º ${numero}, programada para el ${fecha(input.fechaProgramada)}.`, data: { ordenId: orden.id, numero } });
  if (t.estado === "ABIERTO" || t.estado === "EN_REVISION" || t.estado === "ASIGNADO" || t.estado === "REABIERTO") {
    await ctx.db.ticket.update({ where: { id }, data: { estado: "EN_PROCESO", primeraRespuestaEn: t.primeraRespuestaEn ?? new Date() } });
    await registrarComentario(ctx, id, { tipo: "CAMBIO_ESTADO", contenido: `Estado: ${label(t.estado)} → ${label("EN_PROCESO")}`, data: { de: t.estado, a: "EN_PROCESO" } });
  }
  await audit(ctx as Ctx, "crear_orden", "OrdenTrabajo", orden.id, undefined, { ticketId: id, numero });
  await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id, radicado: t.radicado, ordenId: orden.id }, actorId: usuarioReal(ctx) });
  await emit({ tipo: "mantenimiento.orden_creada", conjuntoId: ctx.conjuntoId, data: { id: orden.id, numero, ticketId: id, origen: "TICKET" }, actorId: usuarioReal(ctx) });
  if (orden.asignadoAId && orden.asignadoAId !== ctx.userId) {
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [orden.asignadoAId], titulo: `Orden de trabajo N.º ${numero}`, cuerpo: `${orden.titulo} · ${fecha(orden.fechaProgramada)}`, enlace: `/mantenimiento`, tipo: "MANTENIMIENTO" });
  }
  return orden;
}

// ── Plantillas de respuesta ──

export async function listarPlantillas(ctx: TCtx, tipo?: TipoTicket | null) {
  return ctx.db.plantillaRespuesta.findMany({
    where: tipo ? { OR: [{ tipoTicket: tipo }, { tipoTicket: null }] } : {},
    orderBy: { titulo: "asc" },
  });
}

export async function guardarPlantilla(ctx: TCtx, input: { id?: string | null; titulo: string; contenido: string; tipoTicket?: TipoTicket | null }) {
  if (!puedeGestionar(ctx)) throw new AppError("No tienes permiso para editar plantillas.", 403);
  const data = { titulo: input.titulo, contenido: input.contenido, tipoTicket: input.tipoTicket ?? null };
  if (input.id) return ctx.db.plantillaRespuesta.update({ where: { id: input.id }, data });
  return ctx.db.plantillaRespuesta.create({ data: { conjuntoId: ctx.conjuntoId, ...data } });
}

export async function eliminarPlantilla(ctx: TCtx, id: string) {
  if (!puedeGestionar(ctx)) throw new AppError("No tienes permiso para editar plantillas.", 403);
  await ctx.db.plantillaRespuesta.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}

/** Opciones para asignar: usuarios de gestión y mantenimiento del conjunto + proveedores activos. */
export async function opcionesAsignacion(ctx: TCtx) {
  const [miembros, proveedores] = await Promise.all([
    prisma.membresiaConjunto.findMany({
      where: {
        conjuntoId: ctx.conjuntoId,
        estado: "ACTIVA",
        deletedAt: null,
        rol: { OR: [{ clave: { in: ["ADMINISTRADOR", "ASISTENTE_ADMIN", "MANTENIMIENTO"] } }, { basadoEnClave: { in: ["ADMINISTRADOR", "ASISTENTE_ADMIN", "MANTENIMIENTO"] } }] },
      },
      include: { usuario: { select: { id: true, nombre: true } }, rol: { select: { nombre: true } } },
    }),
    ctx.db.proveedor.findMany({ where: { activo: true }, select: { id: true, razonSocial: true, categoria: true }, orderBy: { razonSocial: "asc" } }),
  ]);
  return {
    usuarios: miembros.map((m) => ({ value: m.usuario.id, label: m.usuario.nombre, group: m.rol.nombre })).sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
    proveedores: proveedores.map((p) => ({ value: p.id, label: p.razonSocial, group: p.categoria })),
  };
}

// ── Procesos automáticos (jobs) ──

/** Cierra tickets resueltos sin respuesta del residente tras N días. Devuelve cuántos cerró. */
export async function cierreAutomatico(ctx: TCtx, dias = 7, ahora = new Date()) {
  const limite = new Date(ahora.getTime() - dias * 86_400_000);
  const tickets = await ctx.db.ticket.findMany({ where: { estado: "RESUELTO", resueltoEn: { lt: limite } }, select: { id: true, radicado: true } });
  for (const t of tickets) {
    await ctx.db.ticket.update({ where: { id: t.id }, data: { estado: "CERRADO", cerradoEn: ahora } });
    await registrarComentario(ctx, t.id, {
      tipo: "CAMBIO_ESTADO",
      contenido: `Cerrado automáticamente: no recibimos respuesta en ${dias} días desde que se resolvió. Si el problema persiste, puedes reabrirlo.`,
      data: { de: "RESUELTO", a: "CERRADO", automatico: true },
    });
    await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, data: { id: t.id, radicado: t.radicado, estado: "CERRADO", automatico: true } });
  }
  return tickets.length;
}

/**
 * Alertas de SLA. `soloUrgentes`: tickets urgentes que vencen en la próxima hora o que vencieron en la
 * última hora (job horario). Si no: resumen diario de vencidos y por vencer (24 h) a administración y
 * aviso individual a cada responsable.
 */
export async function alertasSla(ctx: TCtx, opts: { soloUrgentes?: boolean; ahora?: Date } = {}) {
  const ahora = opts.ahora ?? new Date();
  const abiertos = { estado: { in: [...ESTADOS_ABIERTOS] } };
  const hora = 3_600_000;
  const tickets = await ctx.db.ticket.findMany({
    where: opts.soloUrgentes
      ? { ...abiertos, prioridad: "URGENTE", fechaLimite: { gte: new Date(ahora.getTime() - hora), lt: new Date(ahora.getTime() + hora) } }
      : { ...abiertos, fechaLimite: { lt: new Date(ahora.getTime() + 24 * hora) } },
    select: { id: true, radicado: true, titulo: true, fechaLimite: true, asignadoAId: true, prioridad: true },
    orderBy: { fechaLimite: "asc" },
  });
  if (!tickets.length) return { vencidos: 0, porVencer: 0 };
  const vencidos = tickets.filter((t) => t.fechaLimite < ahora);
  const porVencer = tickets.filter((t) => t.fechaLimite >= ahora);
  const admins = await administradores(ctx.conjuntoId);
  if (admins.length) {
    const titulo = opts.soloUrgentes ? `Tickets urgentes: ${vencidos.length} vencido(s), ${porVencer.length} por vencer` : `SLA: ${vencidos.length} ticket(s) vencido(s) y ${porVencer.length} por vencer`;
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo,
      cuerpo: tickets.slice(0, 5).map((t) => `${t.radicado} (${fechaHora(t.fechaLimite)})`).join(" · "),
      enlace: "/tickets?sla=vencidos",
      tipo: "TICKET_SLA",
      canales: opts.soloUrgentes ? ["push", "email"] : ["push"],
    });
  }
  const porResponsable = new Map<string, typeof tickets>();
  for (const t of tickets) if (t.asignadoAId) porResponsable.set(t.asignadoAId, [...(porResponsable.get(t.asignadoAId) ?? []), t]);
  for (const [uid, lista] of porResponsable) {
    if (admins.includes(uid)) continue;
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [uid],
      titulo: `Tienes ${lista.length} ticket(s) con el plazo ${lista.some((t) => t.fechaLimite < ahora) ? "vencido" : "por vencer"}`,
      cuerpo: lista.slice(0, 5).map((t) => `${t.radicado}: ${t.titulo}`).join(" · "),
      enlace: "/tickets",
      tipo: "TICKET_SLA",
    });
  }
  return { vencidos: vencidos.length, porVencer: porVencer.length };
}
