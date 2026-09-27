import type { TipoVisitante } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { emit, publishRealtime } from "@/lib/events";
import { audit } from "@/lib/audit";
import { notify, usuariosDeUnidad } from "@/lib/notificaciones";
import { can } from "@/lib/permisos";
import { label } from "@/lib/labels";
import { registrarIngreso, sujetoDeTipo, verificarListaNegra } from "./service";

/**
 * Autorización en tiempo real: el portero notifica al residente (push con Autorizar/Rechazar + SSE),
 * el residente responde desde la notificación o desde /visitantes y la respuesta llega a portería al instante.
 * Si no responde en N minutos, el portero registra la decisión telefónica.
 */

export type DecisionResidente = "AUTORIZADA" | "RECHAZADA";

export async function crearSolicitud(
  ctx: Ctx,
  input: { unidadId: string; visitanteNombre: string; visitanteDocumento?: string | null; tipo?: TipoVisitante | null; fotoUrl?: string | null; placa?: string | null },
) {
  const unidad = await ctx.db.unidad.findFirst({ where: { id: input.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const negra = await verificarListaNegra(ctx, { documento: input.visitanteDocumento, nombre: input.visitanteNombre });
  if (negra) throw new AppError(`⛔ ${negra.nombre} tiene orden de no ingreso${negra.motivoListaNegra ? `: ${negra.motivoListaNegra}` : "."}`, 409);
  const cfg = conjuntoConfig(ctx);
  const s = await ctx.db.solicitudIngreso.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: unidad.id,
      visitanteNombre: input.visitanteNombre.trim(),
      visitanteDocumento: input.visitanteDocumento?.trim() || null,
      tipo: input.tipo ?? "VISITA",
      fotoUrl: input.fotoUrl ?? null,
      placa: input.placa ? input.placa.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
      porteroId: ctx.userId,
      expiraEn: new Date(Date.now() + cfg.porteria.minutosRespuestaAutorizacion * 60_000),
    },
  });
  const usuarios = await usuariosDeUnidad(ctx.conjuntoId, unidad.id);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: `🔔 ${s.visitanteNombre} está en portería`,
    cuerpo: `${label(s.tipo)} para ${unidad.codigo}${s.placa ? ` · vehículo ${s.placa}` : ""}. ¿Autorizas el ingreso?`,
    enlace: "/visitantes",
    tipo: "SOLICITUD_INGRESO",
    canales: ["push"],
    data: { solicitudId: s.id },
    acciones: [
      { action: "autorizar", title: "Autorizar" },
      { action: "rechazar", title: "Rechazar" },
    ],
  });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `unidad:${unidad.id}`, tipo: "solicitud.nueva", data: { id: s.id } });
  await emit({ tipo: "porteria.solicitud_creada", conjuntoId: ctx.conjuntoId, data: { id: s.id, unidadId: unidad.id }, actorId: ctx.userId });
  return { ...s, destinatarios: usuarios.length };
}

/** Respuesta del residente (desde la notificación push, el banner en tiempo real o la API). Solo usuarios de esa unidad. */
export async function responderSolicitud(ctx: Ctx, id: string, decision: DecisionResidente) {
  const s = await ctx.db.solicitudIngreso.findFirst({ where: { id } });
  if (!s) notFound("La solicitud");
  if (!ctx.unidadIds.includes(s.unidadId)) throw new AppError("Solo los residentes de la unidad pueden responder esta solicitud.", 403);
  if (s.estado !== "PENDIENTE") throw new AppError(s.estado === "EXPIRADA" ? "La solicitud expiró: portería te llamará." : "Esta solicitud ya fue respondida.", 409);
  const r = await ctx.db.solicitudIngreso.updateMany({
    where: { id: s.id, estado: "PENDIENTE" },
    data: { estado: decision, respondidaPorId: ctx.userId, respondidaEn: new Date() },
  });
  if (r.count !== 1) throw new AppError("Esta solicitud ya fue respondida.", 409);
  await emit({ tipo: "porteria.solicitud_respondida", conjuntoId: ctx.conjuntoId, data: { id: s.id, decision }, actorId: ctx.userId });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `unidad:${s.unidadId}`, tipo: "solicitud.respondida", data: { id: s.id, decision } });
  await audit(ctx, "responder_solicitud_ingreso", "SolicitudIngreso", s.id, { estado: s.estado }, { estado: decision });
  return { id: s.id, estado: decision };
}

/**
 * Portería: registra el ingreso de una solicitud autorizada, o la decisión telefónica cuando el residente no respondió.
 * - AUTORIZADA por el residente → ingreso con medio LLAMADA_RESIDENTE.
 * - `telefonica` → estado DECISION_TELEFONICA (con ingreso si autorizó por teléfono).
 */
export async function resolverSolicitudPorteria(
  ctx: Ctx,
  input: { id: string; telefonica?: DecisionResidente | null; parqueaderoId?: string | null; clienteId?: string | null; observaciones?: string | null },
) {
  const s = await ctx.db.solicitudIngreso.findFirst({ where: { id: input.id } });
  if (!s) notFound("La solicitud");
  if (s.registroAccesoId) throw new AppError("El ingreso de esta solicitud ya fue registrado.");
  let autoriza: boolean;
  if (input.telefonica) {
    if (s.estado === "AUTORIZADA" || s.estado === "RECHAZADA") throw new AppError("El residente ya respondió desde la aplicación.");
    autoriza = input.telefonica === "AUTORIZADA";
  } else {
    if (s.estado !== "AUTORIZADA" && s.estado !== "DECISION_TELEFONICA") throw new AppError(s.estado === "RECHAZADA" ? "El residente rechazó el ingreso." : "El residente aún no autoriza el ingreso.");
    autoriza = true;
  }
  let registroId: string | null = null;
  if (autoriza) {
    const reg = await registrarIngreso(ctx, {
      clienteId: input.clienteId,
      sujeto: sujetoDeTipo(s.tipo),
      tipoVisitante: s.tipo,
      nombre: s.visitanteNombre,
      documento: s.visitanteDocumento,
      unidadId: s.unidadId,
      medio: "LLAMADA_RESIDENTE",
      placa: s.placa,
      parqueaderoId: input.parqueaderoId,
      fotoUrl: s.fotoUrl,
      observaciones: [input.telefonica ? "Autorizado por teléfono" : "Autorizado por el residente en la aplicación", input.observaciones].filter(Boolean).join(" · "),
      silencioso: false,
    });
    registroId = reg.id;
  }
  const upd = await ctx.db.solicitudIngreso.update({
    where: { id: s.id },
    data: {
      ...(input.telefonica ? { estado: "DECISION_TELEFONICA" as const, respondidaEn: new Date() } : {}),
      registroAccesoId: registroId,
    },
  });
  await emit({ tipo: "porteria.solicitud_resuelta", conjuntoId: ctx.conjuntoId, data: { id: s.id, autoriza }, actorId: ctx.userId });
  await publishRealtime({ conjuntoId: ctx.conjuntoId, canal: `unidad:${s.unidadId}`, tipo: "solicitud.respondida", data: { id: s.id } });
  if (input.telefonica) await audit(ctx, "decision_telefonica", "SolicitudIngreso", s.id, { estado: s.estado }, { estado: upd.estado, autoriza });
  return { solicitud: upd, registroId, autoriza };
}

/** Descarta (cierra) una solicitud rechazada o expirada de la pantalla de portería. */
export async function descartarSolicitud(ctx: Ctx, id: string) {
  const s = await ctx.db.solicitudIngreso.findFirst({ where: { id } });
  if (!s) notFound("La solicitud");
  if (s.estado === "PENDIENTE") await ctx.db.solicitudIngreso.update({ where: { id }, data: { estado: "EXPIRADA" } });
  // Se marca como atendida en la pantalla dejando un registroAccesoId vacío: usamos deletedAt para ocultarla del panel.
  await ctx.db.solicitudIngreso.update({ where: { id }, data: { deletedAt: new Date() } });
  await emit({ tipo: "porteria.solicitud_resuelta", conjuntoId: ctx.conjuntoId, data: { id }, actorId: ctx.userId });
  return true;
}

export type SolicitudPanel = {
  id: string;
  unidadId: string;
  unidad: string;
  visitanteNombre: string;
  tipo: TipoVisitante;
  placa: string | null;
  fotoUrl: string | null;
  estado: string;
  creada: Date;
  expiraEn: Date;
  vencida: boolean;
  respondidaEn: Date | null;
};

/** Panel de portería: solicitudes pendientes y respondidas aún sin registrar (últimas 3 horas). */
export async function solicitudesPanel(ctx: Ctx, ahora = new Date()): Promise<SolicitudPanel[]> {
  const rows = await ctx.db.solicitudIngreso.findMany({
    where: { createdAt: { gte: new Date(ahora.getTime() - 3 * 3_600_000) }, registroAccesoId: null, estado: { in: ["PENDIENTE", "AUTORIZADA", "RECHAZADA", "EXPIRADA", "DECISION_TELEFONICA"] } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const unidades = await ctx.db.unidad.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.unidadId))] } }, select: { id: true, codigo: true } });
  const uMap = new Map(unidades.map((u) => [u.id, u.codigo]));
  return rows
    .filter((r) => r.estado !== "DECISION_TELEFONICA")
    .map((r) => ({
      id: r.id,
      unidadId: r.unidadId,
      unidad: uMap.get(r.unidadId) ?? "—",
      visitanteNombre: r.visitanteNombre,
      tipo: r.tipo,
      placa: r.placa,
      fotoUrl: r.fotoUrl,
      estado: r.estado,
      creada: r.createdAt,
      expiraEn: r.expiraEn,
      vencida: r.estado === "EXPIRADA" || (r.estado === "PENDIENTE" && r.expiraEn < ahora),
      respondidaEn: r.respondidaEn,
    }));
}

/** Solicitudes pendientes para el residente (sus unidades). */
export async function solicitudesResidente(ctx: Ctx) {
  if (!ctx.unidadIds.length) return [];
  const rows = await ctx.db.solicitudIngreso.findMany({
    where: { unidadId: { in: ctx.unidadIds }, estado: "PENDIENTE", createdAt: { gte: new Date(Date.now() - 3 * 3_600_000) } },
    orderBy: { createdAt: "desc" },
  });
  const unidades = await ctx.db.unidad.findMany({ where: { id: { in: ctx.unidadIds } }, select: { id: true, codigo: true } });
  const uMap = new Map(unidades.map((u) => [u.id, u.codigo]));
  return rows.map((r) => ({ id: r.id, unidad: uMap.get(r.unidadId) ?? "", visitanteNombre: r.visitanteNombre, tipo: r.tipo, placa: r.placa, fotoUrl: r.fotoUrl, creada: r.createdAt, expiraEn: r.expiraEn }));
}

/** Job: expira solicitudes sin respuesta pasados 60 minutos (el portero ya pudo decidir por teléfono). */
export async function expirarSolicitudes(conjuntoId: string, ahora = new Date()) {
  const r = await prisma.solicitudIngreso.updateMany({
    where: { conjuntoId, estado: "PENDIENTE", expiraEn: { lt: new Date(ahora.getTime() - 60 * 60_000) }, deletedAt: null },
    data: { estado: "EXPIRADA" },
  });
  return r.count;
}

export function puedeResponder(ctx: Ctx, unidadId: string) {
  return ctx.unidadIds.includes(unidadId) && can(ctx, "visitantes.autorizar");
}
