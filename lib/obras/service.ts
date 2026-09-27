import type { EstadoSolicitud, Prisma, TipoMudanza } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { can, seesAll } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso, usuariosDeUnidad } from "@/lib/notificaciones";
import { unidadAlDia } from "@/lib/cartera/core";
import { cop, fecha, isoDate, startOfDayBogota } from "@/lib/format";
import { franjasSeCruzan, problemasContratistas, validarFranjaMudanza, type Contratista } from "./reglas";

/**
 * Obras y remodelaciones en unidades, y mudanzas (ingreso/salida). Portería consulta las autorizadas
 * del día con `autorizadasDelDia` (solo lectura).
 */

const usuarioReal = (ctx: Pick<Ctx, "userId">) => (ctx.userId === "sistema" || ctx.userId.startsWith("api:") ? null : ctx.userId);

export function esGestorObras(ctx: Ctx) {
  return seesAll(ctx, "obras");
}

function assertPuedeSolicitar(ctx: Ctx, unidadId: string) {
  if (can(ctx, "obras.aprobar")) return;
  if (!can(ctx, "obras.solicitar")) throw new AppError("No tienes permiso para hacer solicitudes.", 403);
  if (!ctx.unidadIds.includes(unidadId)) throw new AppError("Solo puedes hacer solicitudes para tus unidades.", 403);
}

async function avisarGestion(ctx: Ctx, titulo: string, cuerpo: string, enlace: string) {
  const ids = (await usuariosConPermiso(ctx.conjuntoId, ["obras.aprobar"])).filter((x) => x !== ctx.userId);
  if (ids.length) await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: ids, titulo, cuerpo, enlace, tipo: "OBRAS" });
}

async function avisarUnidad(ctx: Ctx, unidadId: string, solicitanteId: string | null, titulo: string, cuerpo: string, enlace: string) {
  const ids = new Set(await usuariosDeUnidad(ctx.conjuntoId, unidadId));
  if (solicitanteId) ids.add(solicitanteId);
  ids.delete(ctx.userId);
  if (ids.size) await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: [...ids], titulo, cuerpo, enlace, tipo: "OBRAS", canales: ["push", "email"] });
}

// ─────────────────────────────── Obras ───────────────────────────────

export function whereObras(ctx: Ctx): Prisma.SolicitudObraWhereInput {
  return esGestorObras(ctx) ? {} : { OR: [{ unidadId: { in: ctx.unidadIds } }, { solicitanteId: ctx.userId }] };
}

export function contratistasDe(json: unknown): Contratista[] {
  return (Array.isArray(json) ? json : []) as Contratista[];
}

export async function obtenerObra(ctx: Ctx, id: string) {
  const o = await ctx.db.solicitudObra.findFirst({ where: { AND: [{ id }, whereObras(ctx)] }, include: { unidad: { select: { id: true, codigo: true } } } });
  if (!o) notFound("La solicitud de obra");
  return { ...o, contratistasLista: contratistasDe(o.contratistas) };
}

export type ObraInput = {
  unidadId: string;
  descripcion: string;
  tipo?: string | null;
  fechaInicio: Date;
  fechaFin: Date;
  horario?: string | null;
  contratistas?: Contratista[];
  deposito?: number | null;
};

export async function solicitarObra(ctx: Ctx, input: ObraInput) {
  assertPuedeSolicitar(ctx, input.unidadId);
  if (input.fechaFin < input.fechaInicio) throw new AppError("La fecha de fin debe ser posterior a la de inicio.", 400, { fechaFin: "Revisa la fecha" });
  if (!(await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } }))) notFound("La unidad");
  const o = await ctx.db.solicitudObra.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      solicitanteId: usuarioReal(ctx),
      descripcion: input.descripcion,
      tipo: input.tipo || "REMODELACION",
      fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin,
      ...(input.horario ? { horario: input.horario } : {}),
      contratistas: (input.contratistas ?? []) as unknown as Prisma.InputJsonValue,
      deposito: can(ctx, "obras.aprobar") ? (input.deposito ?? 0) : 0,
    },
  });
  await audit(ctx, "solicitar", "SolicitudObra", o.id, undefined, { unidadId: o.unidadId, fechaInicio: o.fechaInicio, fechaFin: o.fechaFin });
  await emit({ tipo: "obra.solicitada", conjuntoId: ctx.conjuntoId, data: { id: o.id, unidadId: o.unidadId }, actorId: usuarioReal(ctx) });
  await avisarGestion(ctx, "Nueva solicitud de obra", `${input.descripcion.slice(0, 120)} (${fecha(input.fechaInicio)} a ${fecha(input.fechaFin)})`, `/obras/${o.id}`);
  return o;
}

/** El residente puede actualizar contratistas mientras la obra no haya terminado. */
export async function actualizarContratistas(ctx: Ctx, id: string, contratistas: Contratista[]) {
  const o = await obtenerObra(ctx, id);
  if (!can(ctx, "obras.aprobar") && !ctx.unidadIds.includes(o.unidadId)) throw new AppError("No puedes editar esta solicitud.", 403);
  if (!["SOLICITADA", "APROBADA", "EN_CURSO"].includes(o.estado)) throw new AppError("La obra ya terminó; no se pueden cambiar contratistas.");
  const u = await ctx.db.solicitudObra.update({ where: { id }, data: { contratistas: contratistas as unknown as Prisma.InputJsonValue } });
  await audit(ctx, "contratistas", "SolicitudObra", id, o.contratistasLista, contratistas);
  return u;
}

export async function decidirObra(ctx: Ctx, id: string, input: { aprobar: boolean; observaciones?: string | null; deposito?: number | null; horario?: string | null }) {
  if (!can(ctx, "obras.aprobar")) throw new AppError("No tienes permiso para aprobar obras.", 403);
  const o = await obtenerObra(ctx, id);
  if (o.estado !== "SOLICITADA") throw new AppError("Esta solicitud ya fue decidida.");
  if (input.aprobar && conjuntoConfig(ctx).porteria.exigirSeguridadSocialContratistas) {
    const problemas = problemasContratistas(o.contratistasLista, o.fechaFin);
    if (problemas.length) throw new AppError(`No se puede aprobar: ${problemas.join(" ")}`);
  }
  if (!input.aprobar && !input.observaciones) throw new AppError("Indica el motivo del rechazo para el residente.", 400, { observaciones: "Indica el motivo" });
  const estado: EstadoSolicitud = input.aprobar ? "APROBADA" : "RECHAZADA";
  const u = await ctx.db.solicitudObra.update({
    where: { id },
    data: {
      estado,
      aprobadaPorId: usuarioReal(ctx),
      observaciones: input.observaciones ?? null,
      ...(input.deposito !== undefined && input.deposito !== null ? { deposito: input.deposito } : {}),
      ...(input.horario ? { horario: input.horario } : {}),
    },
  });
  await audit(ctx, input.aprobar ? "aprobar" : "rechazar", "SolicitudObra", id, { estado: o.estado }, { estado, observaciones: input.observaciones, deposito: input.deposito });
  await emit({ tipo: input.aprobar ? "obra.aprobada" : "obra.rechazada", conjuntoId: ctx.conjuntoId, data: { id, unidadId: o.unidadId }, actorId: usuarioReal(ctx) });
  await avisarUnidad(
    ctx,
    o.unidadId,
    o.solicitanteId,
    input.aprobar ? "Tu obra fue aprobada" : "Tu solicitud de obra no fue aprobada",
    input.aprobar
      ? `Puedes trabajar del ${fecha(o.fechaInicio)} al ${fecha(o.fechaFin)} en el horario ${u.horario ?? ""}.${Number(u.deposito) > 0 ? ` Depósito: ${cop(u.deposito)}.` : ""}`
      : (input.observaciones ?? ""),
    `/obras/${id}`,
  );
  return u;
}

export async function cambiarEstadoObra(ctx: Ctx, id: string, input: { estado: "EN_CURSO" | "FINALIZADA" | "CANCELADA"; notas?: string | null }) {
  const o = await obtenerObra(ctx, id);
  const gestor = can(ctx, "obras.aprobar");
  const propio = ctx.unidadIds.includes(o.unidadId) || o.solicitanteId === ctx.userId;
  const validas: Record<string, EstadoSolicitud[]> = { EN_CURSO: ["APROBADA"], FINALIZADA: ["EN_CURSO", "APROBADA"], CANCELADA: ["SOLICITADA", "APROBADA"] };
  if (!validas[input.estado].includes(o.estado)) throw new AppError("La solicitud no está en un estado que permita ese cambio.");
  if (input.estado === "CANCELADA" ? !(gestor || propio) : !gestor) throw new AppError("No tienes permiso para este cambio.", 403);
  const u = await ctx.db.solicitudObra.update({
    where: { id },
    data: { estado: input.estado, ...(input.estado === "FINALIZADA" ? { cierreNotas: input.notas ?? null } : input.notas ? { observaciones: input.notas } : {}) },
  });
  await audit(ctx, "estado", "SolicitudObra", id, { estado: o.estado }, { estado: input.estado, notas: input.notas });
  if (!propio || gestor) await avisarUnidad(ctx, o.unidadId, o.solicitanteId, `Obra: ${input.estado === "EN_CURSO" ? "en curso" : input.estado === "FINALIZADA" ? "finalizada" : "cancelada"}`, input.notas ?? o.descripcion.slice(0, 120), `/obras/${id}`);
  return u;
}

// ─────────────────────────────── Mudanzas ───────────────────────────────

export function whereMudanzas(ctx: Ctx): Prisma.MudanzaWhereInput {
  return esGestorObras(ctx) ? {} : { OR: [{ unidadId: { in: ctx.unidadIds } }, { solicitanteId: ctx.userId }] };
}

export type Enser = { descripcion: string; cantidad: number };

export async function obtenerMudanza(ctx: Ctx, id: string) {
  const m = await ctx.db.mudanza.findFirst({ where: { AND: [{ id }, whereMudanzas(ctx)] }, include: { unidad: { select: { id: true, codigo: true } } } });
  if (!m) notFound("La mudanza");
  return { ...m, enseresLista: (Array.isArray(m.enseres) ? m.enseres : []) as unknown as Enser[] };
}

/** Rango [inicio, fin) del día en Bogotá de una fecha. */
function rangoDia(d: Date) {
  const inicio = startOfDayBogota(d);
  return { gte: inicio, lt: new Date(inicio.getTime() + 86_400_000) };
}

/** Mudanzas que ocupan el mismo recurso en una franja que se cruza (excluye `excluirId`). */
export async function crucesMudanza(ctx: Ctx, input: { fecha: Date; horaInicio: string; horaFin: string; recurso?: string | null; excluirId?: string }) {
  const mismas = await ctx.db.mudanza.findMany({
    where: {
      fecha: rangoDia(input.fecha),
      estado: { in: ["SOLICITADA", "APROBADA", "EN_CURSO"] },
      ...(input.recurso ? { recurso: input.recurso } : {}),
      ...(input.excluirId ? { id: { not: input.excluirId } } : {}),
    },
    include: { unidad: { select: { codigo: true } } },
  });
  return mismas.filter((m) => franjasSeCruzan(m, input));
}

export type MudanzaInput = {
  unidadId: string;
  tipo: TipoMudanza;
  fecha: Date;
  horaInicio: string;
  horaFin: string;
  recurso?: string | null;
  empresa?: string | null;
  placaVehiculo?: string | null;
  enseres?: Enser[];
  observaciones?: string | null;
};

export async function solicitarMudanza(ctx: Ctx, input: MudanzaInput) {
  assertPuedeSolicitar(ctx, input.unidadId);
  if (!(await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } }))) notFound("La unidad");
  const motivo = validarFranjaMudanza(input.fecha, input);
  if (motivo) throw new AppError(motivo, 400, { horaInicio: motivo });
  if (input.fecha < startOfDayBogota()) throw new AppError("La fecha de la mudanza ya pasó.", 400, { fecha: "Elige una fecha futura" });
  const cruces = await crucesMudanza(ctx, input);
  if (cruces.length) {
    const c = cruces[0];
    throw new AppError(`${input.recurso ?? "El recurso"} ya está reservado de ${c.horaInicio} a ${c.horaFin} para otra mudanza ese día. Elige otra franja.`, 409, { horaInicio: "Horario ocupado" });
  }
  if (input.tipo === "SALIDA" && !input.enseres?.length) throw new AppError("Para una salida, relaciona los enseres que se autorizan a salir.", 400, { enseres: "Agrega los enseres" });
  const pys = input.tipo === "SALIDA" ? await unidadAlDia(ctx, input.unidadId) : null;
  const m = await ctx.db.mudanza.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      solicitanteId: usuarioReal(ctx),
      tipo: input.tipo,
      fecha: input.fecha,
      horaInicio: input.horaInicio,
      horaFin: input.horaFin,
      recurso: input.recurso ?? null,
      empresa: input.empresa ?? null,
      placaVehiculo: input.placaVehiculo?.toUpperCase().replace(/\s/g, "") ?? null,
      enseres: (input.enseres ?? []) as unknown as Prisma.InputJsonValue,
      pazYSalvoVerificado: pys?.alDia ?? false,
      observaciones: input.observaciones ?? null,
    },
  });
  await audit(ctx, "solicitar", "Mudanza", m.id, undefined, { tipo: m.tipo, fecha: isoDate(m.fecha), franja: `${m.horaInicio}-${m.horaFin}` });
  await emit({ tipo: "mudanza.solicitada", conjuntoId: ctx.conjuntoId, data: { id: m.id, unidadId: m.unidadId }, actorId: usuarioReal(ctx) });
  await avisarGestion(ctx, `Nueva mudanza (${m.tipo === "SALIDA" ? "salida" : "ingreso"})`, `${fecha(m.fecha)} de ${m.horaInicio} a ${m.horaFin}${pys && !pys.alDia ? " · la unidad NO está a paz y salvo" : ""}`, `/obras/mudanzas/${m.id}`);
  return m;
}

/** Verifica el paz y salvo de la unidad con cartera y guarda el resultado. */
export async function verificarPazYSalvo(ctx: Ctx, id: string) {
  const m = await obtenerMudanza(ctx, id);
  const r = await unidadAlDia(ctx, m.unidadId);
  await ctx.db.mudanza.update({ where: { id }, data: { pazYSalvoVerificado: r.alDia } });
  return { alDia: r.alDia, vencido: r.saldo.vencido, saldoAFavor: r.saldo.saldoAFavor };
}

/** Aprueba o rechaza. Una SALIDA solo se aprueba si la unidad está al día (paz y salvo). */
export async function decidirMudanza(ctx: Ctx, id: string, input: { aprobar: boolean; observaciones?: string | null }) {
  if (!can(ctx, "obras.aprobar")) throw new AppError("No tienes permiso para aprobar mudanzas.", 403);
  const m = await obtenerMudanza(ctx, id);
  if (m.estado !== "SOLICITADA") throw new AppError("Esta mudanza ya fue decidida.");
  let alDia = m.pazYSalvoVerificado;
  if (input.aprobar) {
    if (m.tipo === "SALIDA") {
      const r = await unidadAlDia(ctx, m.unidadId);
      alDia = r.alDia;
      if (!r.alDia) {
        await ctx.db.mudanza.update({ where: { id }, data: { pazYSalvoVerificado: false } });
        throw new AppError(`La unidad tiene un saldo vencido de ${cop(r.saldo.vencido - r.saldo.saldoAFavor)}. La salida se aprueba cuando esté a paz y salvo.`);
      }
    }
    const cruces = await crucesMudanza(ctx, { ...m, excluirId: id });
    const aprobadas = cruces.filter((c) => c.estado !== "SOLICITADA");
    if (aprobadas.length) throw new AppError(`Se cruza con la mudanza aprobada de ${aprobadas[0].unidad.codigo} (${aprobadas[0].horaInicio}–${aprobadas[0].horaFin}).`);
  } else if (!input.observaciones) {
    throw new AppError("Indica el motivo del rechazo para el residente.", 400, { observaciones: "Indica el motivo" });
  }
  const estado: EstadoSolicitud = input.aprobar ? "APROBADA" : "RECHAZADA";
  const u = await ctx.db.mudanza.update({ where: { id }, data: { estado, aprobadaPorId: usuarioReal(ctx), observaciones: input.observaciones ?? m.observaciones, pazYSalvoVerificado: alDia } });
  await audit(ctx, input.aprobar ? "aprobar" : "rechazar", "Mudanza", id, { estado: m.estado }, { estado, pazYSalvo: alDia, observaciones: input.observaciones });
  await emit({ tipo: input.aprobar ? "mudanza.aprobada" : "mudanza.rechazada", conjuntoId: ctx.conjuntoId, data: { id, unidadId: m.unidadId, fecha: isoDate(m.fecha) }, actorId: usuarioReal(ctx) });
  await avisarUnidad(
    ctx,
    m.unidadId,
    m.solicitanteId,
    input.aprobar ? "Tu mudanza fue aprobada" : "Tu mudanza no fue aprobada",
    input.aprobar ? `${fecha(m.fecha)} de ${m.horaInicio} a ${m.horaFin}${m.recurso ? ` · ${m.recurso}` : ""}. Portería tendrá la autorización.` : (input.observaciones ?? ""),
    `/obras/mudanzas/${id}`,
  );
  return u;
}

export async function cambiarEstadoMudanza(ctx: Ctx, id: string, estado: "EN_CURSO" | "FINALIZADA" | "CANCELADA") {
  const m = await obtenerMudanza(ctx, id);
  const gestor = can(ctx, "obras.aprobar");
  const propio = ctx.unidadIds.includes(m.unidadId) || m.solicitanteId === ctx.userId;
  const validas: Record<string, EstadoSolicitud[]> = { EN_CURSO: ["APROBADA"], FINALIZADA: ["EN_CURSO", "APROBADA"], CANCELADA: ["SOLICITADA", "APROBADA"] };
  if (!validas[estado].includes(m.estado)) throw new AppError("La mudanza no está en un estado que permita ese cambio.");
  if (estado === "CANCELADA" ? !(gestor || propio) : !gestor) throw new AppError("No tienes permiso para este cambio.", 403);
  const u = await ctx.db.mudanza.update({ where: { id }, data: { estado } });
  await audit(ctx, "estado", "Mudanza", id, { estado: m.estado }, { estado });
  return u;
}

// ─────────────────────────────── Portería (solo lectura) ───────────────────────────────

export type AutorizadasDelDia = {
  obras: { id: string; unidad: string; descripcion: string; horario: string | null; contratistas: Contratista[]; estado: EstadoSolicitud }[];
  mudanzas: { id: string; unidad: string; tipo: TipoMudanza; horaInicio: string; horaFin: string; recurso: string | null; empresa: string | null; placa: string | null; enseres: Enser[]; pazYSalvo: boolean; estado: EstadoSolicitud }[];
};

/** Obras aprobadas/en curso vigentes hoy y mudanzas aprobadas del día (para portería). */
export async function autorizadasDelDia(ctx: Pick<Ctx, "db">, dia: Date = new Date()): Promise<AutorizadasDelDia> {
  const r = rangoDia(dia);
  const [obras, mudanzas] = await Promise.all([
    ctx.db.solicitudObra.findMany({
      where: { estado: { in: ["APROBADA", "EN_CURSO"] }, fechaInicio: { lt: r.lt }, fechaFin: { gte: r.gte } },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { fechaInicio: "asc" },
    }),
    ctx.db.mudanza.findMany({ where: { estado: { in: ["APROBADA", "EN_CURSO"] }, fecha: r }, include: { unidad: { select: { codigo: true } } }, orderBy: { horaInicio: "asc" } }),
  ]);
  return {
    obras: obras.map((o) => ({ id: o.id, unidad: o.unidad.codigo, descripcion: o.descripcion, horario: o.horario, contratistas: contratistasDe(o.contratistas), estado: o.estado })),
    mudanzas: mudanzas.map((m) => ({
      id: m.id,
      unidad: m.unidad.codigo,
      tipo: m.tipo,
      horaInicio: m.horaInicio,
      horaFin: m.horaFin,
      recurso: m.recurso,
      empresa: m.empresa,
      placa: m.placaVehiculo,
      enseres: (Array.isArray(m.enseres) ? m.enseres : []) as unknown as Enser[],
      pazYSalvo: m.pazYSalvoVerificado,
      estado: m.estado,
    })),
  };
}

/** Recursos para mudanzas: ascensores de torres con ascensor y zona de cargue. */
export async function recursosMudanza(ctx: Ctx) {
  const torres = await ctx.db.torre.findMany({ where: { ascensores: true }, orderBy: { nombre: "asc" }, select: { nombre: true } });
  return [...torres.map((t) => `Ascensor ${t.nombre}`), "Zona de cargue", "Escaleras (sin ascensor)"];
}
