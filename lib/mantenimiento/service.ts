import type { EstadoOrden, OrigenOrden, Prisma, TipoMantenimiento } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { can } from "@/lib/permisos";
import { nextConsecutivo } from "@/lib/consecutivo";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { insensitive } from "@/lib/pagination";
import { fecha as fmtFecha, startOfDayBogota, toNumber } from "@/lib/format";
import { gastoDesdeOrden } from "@/lib/presupuesto/service";
import {
  ESTADOS_ORDEN_ABIERTA,
  checklistDesdePlan,
  conMomento,
  debeGenerarOrden,
  parseChecklist,
  proximaFechaPlan,
  type ChecklistItem,
  type MomentoEvidencia,
} from "./calculos";

// ───────────────────────────── Alcance ─────────────────────────────

/** Proveedores vinculados al usuario (rol PROVEEDOR). */
export async function proveedoresDelUsuario(ctx: Ctx) {
  const rows = await ctx.db.proveedor.findMany({ where: { usuarioId: ctx.userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Qué órdenes ve el usuario: con `mantenimiento.ver_todos` todas; si no, solo las asignadas a él
 * o a un proveedor vinculado a su usuario (roles MANTENIMIENTO y PROVEEDOR).
 */
export async function ordenScope(ctx: Ctx): Promise<Prisma.OrdenTrabajoWhereInput> {
  if (can(ctx, "mantenimiento.ver_todos")) return {};
  const provs = await proveedoresDelUsuario(ctx);
  return { OR: [{ asignadoAId: ctx.userId }, ...(provs.length ? [{ proveedorId: { in: provs } }] : [])] };
}

/** ¿Puede ver planes, calendario e indicadores? (no aplica al proveedor externo) */
export function vePlanes(ctx: Ctx) {
  return can(ctx, ["mantenimiento.ver_todos", "mantenimiento.gestionar", "mantenimiento.crear"]);
}

async function ordenVisible(ctx: Ctx, id: string) {
  const scope = await ordenScope(ctx);
  const o = await ctx.db.ordenTrabajo.findFirst({ where: { AND: [{ id }, scope] } });
  if (!o) notFound("La orden de trabajo");
  return o;
}

// ───────────────────────────── Órdenes ─────────────────────────────

export type FiltrosOrdenes = { q?: string; estado?: string; origen?: string; activoId?: string; proveedorId?: string; vista?: string };

export async function listarOrdenes(ctx: Ctx, f: FiltrosOrdenes, page?: { skip: number; take: number }) {
  const scope = await ordenScope(ctx);
  const hoy = startOfDayBogota();
  const vista: Prisma.OrdenTrabajoWhereInput =
    f.vista === "abiertas"
      ? { estado: { in: [...ESTADOS_ORDEN_ABIERTA] } }
      : f.vista === "atrasadas"
        ? { estado: { in: [...ESTADOS_ORDEN_ABIERTA] }, fechaProgramada: { lt: hoy } }
        : f.vista === "cerradas"
          ? { estado: { in: ["COMPLETADA", "CANCELADA"] } }
          : {};
  const where: Prisma.OrdenTrabajoWhereInput = {
    AND: [
      scope,
      vista,
      f.q ? { OR: [{ titulo: insensitive(f.q) }, ...(Number(f.q) ? [{ numero: Number(f.q) }] : []), { activo: { nombre: insensitive(f.q) } }] } : {},
      f.estado ? { estado: f.estado as EstadoOrden } : {},
      f.origen ? { origen: f.origen as OrigenOrden } : {},
      f.activoId ? { activoId: f.activoId } : {},
      f.proveedorId ? { proveedorId: f.proveedorId } : {},
    ],
  };
  const [items, total] = await Promise.all([
    ctx.db.ordenTrabajo.findMany({
      where,
      include: { activo: { select: { nombre: true, ubicacion: true } }, proveedor: { select: { razonSocial: true } }, plan: { select: { tipo: true } } },
      orderBy: f.vista === "cerradas" ? [{ fechaCierre: "desc" }] : [{ fechaProgramada: "asc" }, { numero: "asc" }],
      ...(page ?? {}),
    }),
    ctx.db.ordenTrabajo.count({ where }),
  ]);
  const userIds = [...new Set(items.map((i) => i.asignadoAId).filter(Boolean) as string[])];
  const users = userIds.length ? await prisma.usuario.findMany({ where: { id: { in: userIds } }, select: { id: true, nombre: true } }) : [];
  const nombre = new Map(users.map((u) => [u.id, u.nombre]));
  return { items: items.map((o) => ({ ...o, asignadoNombre: o.asignadoAId ? (nombre.get(o.asignadoAId) ?? null) : null })), total };
}

/** Conteos para las pestañas del técnico/administrador. */
export async function conteoOrdenes(ctx: Ctx) {
  const scope = await ordenScope(ctx);
  const hoy = startOfDayBogota();
  const manana = new Date(hoy.getTime() + 86_400_000);
  const abiertas = { estado: { in: [...ESTADOS_ORDEN_ABIERTA] } } satisfies Prisma.OrdenTrabajoWhereInput;
  const [totalAbiertas, atrasadas, hoyN] = await Promise.all([
    ctx.db.ordenTrabajo.count({ where: { AND: [scope, abiertas] } }),
    ctx.db.ordenTrabajo.count({ where: { AND: [scope, abiertas, { fechaProgramada: { lt: hoy } }] } }),
    ctx.db.ordenTrabajo.count({ where: { AND: [scope, abiertas, { fechaProgramada: { gte: hoy, lt: manana } }] } }),
  ]);
  return { abiertas: totalAbiertas, atrasadas, hoy: hoyN };
}

export async function fichaOrden(ctx: Ctx, id: string) {
  const base = await ordenVisible(ctx, id);
  const o = await ctx.db.ordenTrabajo.findUniqueOrThrow({
    where: { id: base.id },
    include: {
      activo: { select: { id: true, nombre: true, ubicacion: true, categoria: true, estado: true, codigoQr: true } },
      proveedor: { select: { id: true, razonSocial: true, telefono: true, contactoNombre: true } },
      plan: { select: { id: true, nombre: true, tipo: true, frecuenciaDias: true, proximaFecha: true } },
    },
  });
  const [asignado, ticket, zona, gasto] = await Promise.all([
    o.asignadoAId ? prisma.usuario.findUnique({ where: { id: o.asignadoAId }, select: { id: true, nombre: true, telefono: true } }) : null,
    o.ticketId ? ctx.db.ticket.findUnique({ where: { id: o.ticketId }, select: { id: true, radicado: true, titulo: true, estado: true, descripcion: true, adjuntos: true } }) : null,
    o.zonaId ? ctx.db.zonaComun.findUnique({ where: { id: o.zonaId }, select: { id: true, nombre: true } }) : null,
    ctx.db.gasto.findFirst({ where: { ordenTrabajoId: o.id }, select: { id: true, estado: true, valor: true } }),
  ]);
  return { ...o, checklistItems: parseChecklist(o.checklist), asignado, ticket, zona, gasto };
}

export type OrdenInput = {
  id?: string | null;
  titulo: string;
  descripcion?: string | null;
  activoId?: string | null;
  zonaId?: string | null;
  proveedorId?: string | null;
  asignadoAId?: string | null;
  fechaProgramada: Date;
  checklist?: string[];
  costo?: number | null;
};

async function validarAsignacion(ctx: Ctx, input: { activoId?: string | null; zonaId?: string | null; proveedorId?: string | null; asignadoAId?: string | null }) {
  if (input.activoId && !(await ctx.db.activo.findUnique({ where: { id: input.activoId } }))) throw new AppError("El activo no existe.");
  if (input.zonaId && !(await ctx.db.zonaComun.findUnique({ where: { id: input.zonaId } }))) throw new AppError("La zona no existe.");
  if (input.proveedorId && !(await ctx.db.proveedor.findUnique({ where: { id: input.proveedorId } }))) throw new AppError("El proveedor no existe.");
  if (input.asignadoAId) {
    const m = await prisma.membresiaConjunto.findFirst({ where: { usuarioId: input.asignadoAId, conjuntoId: ctx.conjuntoId, estado: "ACTIVA", deletedAt: null } });
    if (!m) throw new AppError("El responsable no pertenece al conjunto.");
  }
}

async function avisarAsignacion(ctx: Ctx, orden: { id: string; numero: number; titulo: string; fechaProgramada: Date; asignadoAId: string | null; proveedorId: string | null }) {
  const ids: string[] = [];
  if (orden.asignadoAId) ids.push(orden.asignadoAId);
  if (orden.proveedorId) {
    const p = await prisma.proveedor.findUnique({ where: { id: orden.proveedorId }, select: { usuarioId: true } });
    if (p?.usuarioId) ids.push(p.usuarioId);
  }
  const dest = ids.filter((u) => u !== ctx.userId);
  if (!dest.length) return;
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: dest,
    titulo: `Orden de trabajo #${orden.numero} asignada`,
    cuerpo: `${orden.titulo} · programada para el ${fmtFecha(orden.fechaProgramada)}.`,
    enlace: `/mantenimiento/ordenes/${orden.id}`,
    tipo: "MANTENIMIENTO",
    canales: ["push", "email"],
  });
}

/** Crea (manual) o edita una orden. Crear/reasignar exige `mantenimiento.crear` o `mantenimiento.gestionar`. */
export async function guardarOrden(ctx: Ctx, input: OrdenInput) {
  await validarAsignacion(ctx, input);
  if (input.id) {
    const antes = await ordenVisible(ctx, input.id);
    if (antes.estado === "COMPLETADA" || antes.estado === "CANCELADA") throw new AppError("La orden ya está cerrada.");
    const checklist = input.checklist
      ? (() => {
          const prev = parseChecklist(antes.checklist);
          return input.checklist.map((item) => ({ item, ok: prev.find((p) => p.item === item)?.ok ?? false }));
        })()
      : undefined;
    const o = await ctx.db.ordenTrabajo.update({
      where: { id: input.id },
      data: {
        titulo: input.titulo,
        descripcion: input.descripcion ?? null,
        activoId: input.activoId ?? null,
        zonaId: input.zonaId ?? null,
        proveedorId: input.proveedorId ?? null,
        asignadoAId: input.asignadoAId ?? null,
        fechaProgramada: input.fechaProgramada,
        ...(checklist ? { checklist } : {}),
        ...(input.costo !== undefined ? { costo: input.costo } : {}),
        estado: antes.estado === "PENDIENTE" && (input.asignadoAId || input.proveedorId) ? "PROGRAMADA" : antes.estado,
      },
    });
    await audit(ctx, "editar", "OrdenTrabajo", o.id, antes, o);
    if (o.asignadoAId !== antes.asignadoAId || o.proveedorId !== antes.proveedorId) await avisarAsignacion(ctx, o);
    return o;
  }
  const numero = await nextConsecutivo(ctx.conjuntoId, "ORDEN", 0);
  const o = await ctx.db.ordenTrabajo.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      numero,
      origen: "MANUAL",
      titulo: input.titulo,
      descripcion: input.descripcion ?? null,
      activoId: input.activoId ?? null,
      zonaId: input.zonaId ?? null,
      proveedorId: input.proveedorId ?? null,
      asignadoAId: input.asignadoAId ?? null,
      fechaProgramada: input.fechaProgramada,
      checklist: checklistDesdePlan(input.checklist ?? []),
      costo: input.costo ?? null,
      estado: input.asignadoAId || input.proveedorId ? "PROGRAMADA" : "PENDIENTE",
    },
  });
  await audit(ctx, "crear", "OrdenTrabajo", o.id, undefined, o);
  await emit({ tipo: "mantenimiento.orden_creada", conjuntoId: ctx.conjuntoId, actorId: ctx.userId, data: { id: o.id, numero, origen: "MANUAL" } });
  await avisarAsignacion(ctx, o);
  return o;
}

function assertAbierta(o: { estado: EstadoOrden }) {
  if (o.estado === "COMPLETADA" || o.estado === "CANCELADA") throw new AppError("La orden ya está cerrada.");
}

/** El técnico o proveedor inicia el trabajo. */
export async function iniciarOrden(ctx: Ctx, id: string) {
  const o = await ordenVisible(ctx, id);
  assertAbierta(o);
  const r = await ctx.db.ordenTrabajo.update({ where: { id }, data: { estado: "EN_PROCESO", fechaInicio: o.fechaInicio ?? new Date() } });
  if (o.activoId) {
    await ctx.db.activo.updateMany({ where: { id: o.activoId, estado: "OPERATIVO" }, data: { estado: "EN_MANTENIMIENTO" } });
  }
  await audit(ctx, "iniciar", "OrdenTrabajo", id, { estado: o.estado }, { estado: "EN_PROCESO" });
  return r;
}

export async function marcarItemChecklist(ctx: Ctx, id: string, index: number, ok: boolean) {
  const o = await ordenVisible(ctx, id);
  assertAbierta(o);
  const items = parseChecklist(o.checklist);
  if (!items[index]) throw new AppError("El ítem no existe.");
  items[index] = { ...items[index], ok };
  await ctx.db.ordenTrabajo.update({
    where: { id },
    data: { checklist: items, ...(o.estado !== "EN_PROCESO" ? { estado: "EN_PROCESO", fechaInicio: o.fechaInicio ?? new Date() } : {}) },
  });
  return items;
}

export async function agregarEvidencias(ctx: Ctx, id: string, urls: string[], momento: MomentoEvidencia) {
  const o = await ordenVisible(ctx, id);
  const limpias = urls.filter((u) => u.startsWith(`/api/files/${ctx.conjuntoId}/`)).map((u) => conMomento(u, momento));
  if (!limpias.length) throw new AppError("No se recibió ninguna foto válida.");
  const evidencias = [...new Set([...o.evidencias, ...limpias])].slice(0, 40);
  await ctx.db.ordenTrabajo.update({ where: { id }, data: { evidencias } });
  await audit(ctx, "agregar_evidencia", "OrdenTrabajo", id, undefined, { urls: limpias });
  return evidencias;
}

export async function quitarEvidencia(ctx: Ctx, id: string, url: string) {
  const o = await ordenVisible(ctx, id);
  assertAbierta(o);
  await ctx.db.ordenTrabajo.update({ where: { id }, data: { evidencias: o.evidencias.filter((e) => e !== url) } });
  return true;
}

export type CierreInput = { id: string; notasCierre?: string | null; costo?: number | null; evidencias?: string[]; checklistCompleto?: boolean; fechaCierre?: Date | null };

/**
 * Cierra la orden (COMPLETADA). Efectos:
 * - plan: ultimaEjecucion = cierre y proximaFecha = cierre + frecuencia;
 * - ticket de origen: comentario de sistema y estado RESUELTO;
 * - activo: vuelve a OPERATIVO si estaba en mantenimiento;
 * - costo > 0: gasto PENDIENTE_APROBACION enlazado a la orden (presupuesto).
 */
export async function cerrarOrden(ctx: Ctx, input: CierreInput) {
  const o = await ordenVisible(ctx, input.id);
  assertAbierta(o);
  const fechaCierre = input.fechaCierre ?? new Date();
  let items: ChecklistItem[] = parseChecklist(o.checklist);
  if (input.checklistCompleto) items = items.map((i) => ({ ...i, ok: true }));
  const nuevas = (input.evidencias ?? []).filter((u) => u.startsWith(`/api/files/${ctx.conjuntoId}/`)).map((u) => (/#(antes|despues)$/.test(u) ? u : conMomento(u, "despues")));
  const evidencias = [...new Set([...o.evidencias, ...nuevas])];
  const costo = input.costo ?? (o.costo !== null ? toNumber(o.costo) : null);

  const cerrada = await ctx.db.ordenTrabajo.update({
    where: { id: o.id },
    data: { estado: "COMPLETADA", fechaCierre, fechaInicio: o.fechaInicio ?? fechaCierre, notasCierre: input.notasCierre ?? o.notasCierre, costo, checklist: items, evidencias },
  });
  await audit(ctx, "cerrar", "OrdenTrabajo", o.id, { estado: o.estado, costo: o.costo }, { estado: "COMPLETADA", costo, notasCierre: cerrada.notasCierre });

  if (o.planId) {
    const plan = await ctx.db.planMantenimiento.findUnique({ where: { id: o.planId } });
    if (plan) {
      const proxima = proximaFechaPlan(fechaCierre, plan.frecuenciaDias);
      await ctx.db.planMantenimiento.update({ where: { id: plan.id }, data: { ultimaEjecucion: fechaCierre, proximaFecha: proxima } });
      await audit(ctx, "ejecutar_plan", "PlanMantenimiento", plan.id, { proximaFecha: plan.proximaFecha, ultimaEjecucion: plan.ultimaEjecucion }, { proximaFecha: proxima, ultimaEjecucion: fechaCierre });
    }
  }

  if (o.activoId) {
    const abiertas = await ctx.db.ordenTrabajo.count({ where: { activoId: o.activoId, estado: "EN_PROCESO", id: { not: o.id } } });
    if (!abiertas) await ctx.db.activo.updateMany({ where: { id: o.activoId, estado: "EN_MANTENIMIENTO" }, data: { estado: "OPERATIVO" } });
  }

  if (o.ticketId) {
    const t = await ctx.db.ticket.findUnique({ where: { id: o.ticketId } });
    if (t && !["RESUELTO", "CERRADO"].includes(t.estado)) {
      await ctx.db.comentarioTicket.create({
        data: {
          conjuntoId: ctx.conjuntoId,
          ticketId: t.id,
          autorId: ctx.userId === "sistema" ? null : ctx.userId,
          tipo: "SISTEMA",
          interno: false,
          contenido: `Orden de trabajo #${o.numero} completada por ${ctx.nombre}.${cerrada.notasCierre ? ` ${cerrada.notasCierre}` : ""}`,
          adjuntos: nuevas.map((u) => u.replace(/#(antes|despues)$/, "")),
          data: { ordenId: o.id, numero: o.numero, estadoAnterior: t.estado, estadoNuevo: "RESUELTO" },
        },
      });
      await ctx.db.ticket.update({ where: { id: t.id }, data: { estado: "RESUELTO", resueltoEn: fechaCierre, primeraRespuestaEn: t.primeraRespuestaEn ?? fechaCierre } });
      await emit({ tipo: "ticket.actualizado", conjuntoId: ctx.conjuntoId, actorId: ctx.userId, data: { id: t.id, radicado: t.radicado, estado: "RESUELTO", ordenId: o.id } });
      if (t.solicitanteId) {
        await notify({
          conjuntoId: ctx.conjuntoId,
          usuarioIds: [t.solicitanteId],
          titulo: `Tu reporte ${t.radicado} fue resuelto`,
          cuerpo: `${t.titulo}: el equipo de mantenimiento terminó el trabajo. Puedes calificar la atención.`,
          enlace: `/tickets/${t.id}`,
          tipo: "TICKET",
        });
      }
    }
  }

  if (costo && costo > 0) await gastoDesdeOrden(ctx, { ...cerrada, costo });

  await emit({ tipo: "mantenimiento.orden_cerrada", conjuntoId: ctx.conjuntoId, actorId: ctx.userId, data: { id: o.id, numero: o.numero, planId: o.planId, ticketId: o.ticketId, costo } });
  if (ctx.userId !== "sistema") {
    const admins = (await usuariosConPermiso(ctx.conjuntoId, ["mantenimiento.ver_todos"])).filter((u) => u !== ctx.userId);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo: `Orden #${o.numero} completada`,
      cuerpo: `${o.titulo} · cerrada por ${ctx.nombre}${costo ? ` · costo ${Math.round(costo).toLocaleString("es-CO")}` : ""}.`,
      enlace: `/mantenimiento/ordenes/${o.id}`,
      tipo: "MANTENIMIENTO",
      canales: ["push"],
    });
  }
  return cerrada;
}

export async function cancelarOrden(ctx: Ctx, id: string, motivo: string) {
  const o = await ordenVisible(ctx, id);
  assertAbierta(o);
  const r = await ctx.db.ordenTrabajo.update({ where: { id }, data: { estado: "CANCELADA", fechaCierre: new Date(), notasCierre: `Cancelada: ${motivo}` } });
  await audit(ctx, "cancelar", "OrdenTrabajo", id, { estado: o.estado }, { estado: "CANCELADA", motivo });
  return r;
}

// ───────────────────────────── Planes ─────────────────────────────

export type PlanInput = {
  id?: string | null;
  nombre: string;
  activoId?: string | null;
  zonaId?: string | null;
  tipo: TipoMantenimiento;
  frecuenciaDias: number;
  proximaFecha: Date;
  responsableId?: string | null;
  proveedorId?: string | null;
  checklist: string[];
  costoEstimado?: number | null;
  diasAnticipacion: number;
  activoPlan: boolean;
};

export async function listarPlanes(ctx: Ctx, f: { q?: string; tipo?: string; activoId?: string; estado?: string }) {
  const hoy = startOfDayBogota();
  const where: Prisma.PlanMantenimientoWhereInput = {
    ...(f.q ? { OR: [{ nombre: insensitive(f.q) }, { activo: { nombre: insensitive(f.q) } }] } : {}),
    ...(f.tipo ? { tipo: f.tipo as TipoMantenimiento } : {}),
    ...(f.activoId ? { activoId: f.activoId } : {}),
    ...(f.estado === "vencidos" ? { activoPlan: true, proximaFecha: { lt: hoy } } : f.estado === "inactivos" ? { activoPlan: false } : {}),
  };
  const planes = await ctx.db.planMantenimiento.findMany({
    where,
    include: {
      activo: { select: { id: true, nombre: true, ubicacion: true } },
      proveedor: { select: { razonSocial: true } },
      ordenes: { where: { deletedAt: null, estado: { in: [...ESTADOS_ORDEN_ABIERTA] } }, select: { id: true, numero: true, estado: true } },
    },
    orderBy: [{ activoPlan: "desc" }, { proximaFecha: "asc" }],
  });
  const respIds = [...new Set(planes.map((p) => p.responsableId).filter(Boolean) as string[])];
  const users = respIds.length ? await prisma.usuario.findMany({ where: { id: { in: respIds } }, select: { id: true, nombre: true } }) : [];
  const nombre = new Map(users.map((u) => [u.id, u.nombre]));
  return planes.map((p) => ({ ...p, responsableNombre: p.responsableId ? (nombre.get(p.responsableId) ?? null) : null }));
}

export async function guardarPlan(ctx: Ctx, input: PlanInput) {
  await validarAsignacion(ctx, { activoId: input.activoId, zonaId: input.zonaId, proveedorId: input.proveedorId, asignadoAId: input.responsableId });
  if (!input.activoId && !input.zonaId) throw new AppError("Indica el activo o la zona del plan.", 400, { activoId: "Selecciona un activo o una zona" });
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.planMantenimiento.findUnique({ where: { id } });
    if (!antes) notFound("El plan");
    const p = await ctx.db.planMantenimiento.update({ where: { id }, data });
    await audit(ctx, "editar", "PlanMantenimiento", id, antes, p);
    return p;
  }
  const p = await ctx.db.planMantenimiento.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "PlanMantenimiento", p.id, undefined, p);
  return p;
}

export async function eliminarPlan(ctx: Ctx, id: string) {
  await ctx.db.planMantenimiento.update({ where: { id }, data: { deletedAt: new Date(), activoPlan: false } });
  await audit(ctx, "eliminar", "PlanMantenimiento", id);
  return true;
}

type PlanParaOrden = {
  id: string;
  nombre: string;
  tipo: TipoMantenimiento;
  activoId: string | null;
  zonaId: string | null;
  proveedorId: string | null;
  responsableId: string | null;
  checklist: string[];
  costoEstimado: Prisma.Decimal | null;
  proximaFecha: Date;
  activo?: { nombre: string } | null;
};

async function crearOrdenDePlan(ctx: Ctx, plan: PlanParaOrden) {
  const numero = await nextConsecutivo(ctx.conjuntoId, "ORDEN", 0);
  const tipo = plan.tipo === "LEGAL" ? " (legal)" : "";
  const o = await ctx.db.ordenTrabajo.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      numero,
      origen: "PLAN",
      planId: plan.id,
      activoId: plan.activoId,
      zonaId: plan.zonaId,
      proveedorId: plan.proveedorId,
      asignadoAId: plan.responsableId,
      titulo: `${plan.nombre}${tipo}`.slice(0, 150),
      descripcion: plan.activo ? `Mantenimiento ${plan.tipo.toLowerCase()} programado de ${plan.activo.nombre}.` : `Mantenimiento ${plan.tipo.toLowerCase()} programado.`,
      fechaProgramada: plan.proximaFecha,
      checklist: checklistDesdePlan(plan.checklist),
      costo: plan.costoEstimado,
      estado: plan.responsableId || plan.proveedorId ? "PROGRAMADA" : "PENDIENTE",
    },
  });
  await audit(ctx, "generar_orden", "OrdenTrabajo", o.id, undefined, { planId: plan.id, numero });
  await avisarAsignacion(ctx, o);
  return o;
}

/** Crea ya la orden de un plan (botón "Generar orden ahora"), si no tiene una abierta. */
export async function generarOrdenAhora(ctx: Ctx, planId: string) {
  const plan = await ctx.db.planMantenimiento.findUnique({ where: { id: planId }, include: { activo: { select: { nombre: true } } } });
  if (!plan) notFound("El plan");
  const abierta = await ctx.db.ordenTrabajo.findFirst({ where: { planId, estado: { in: [...ESTADOS_ORDEN_ABIERTA] } } });
  if (abierta) throw new AppError(`El plan ya tiene la orden #${abierta.numero} abierta.`);
  return crearOrdenDePlan(ctx, plan);
}

/**
 * Job diario (06:00): genera órdenes para los planes activos cuya próxima fecha menos los días de
 * anticipación ya llegó y que no tienen una orden abierta. Idempotente: nunca duplica.
 */
export async function generarOrdenesProgramadas(ctx: Ctx, hoy = new Date()) {
  const planes = await ctx.db.planMantenimiento.findMany({ where: { activoPlan: true }, include: { activo: { select: { nombre: true, deletedAt: true } } } });
  const abiertas = await ctx.db.ordenTrabajo.findMany({ where: { planId: { in: planes.map((p) => p.id) }, estado: { in: [...ESTADOS_ORDEN_ABIERTA] } }, select: { planId: true } });
  const conAbierta = new Set(abiertas.map((a) => a.planId));
  const creadas: { id: string; numero: number; titulo: string }[] = [];
  for (const p of planes) {
    if (p.activo?.deletedAt) continue;
    if (!debeGenerarOrden(p, hoy, conAbierta.has(p.id))) continue;
    // Doble verificación dentro del ciclo (otro proceso pudo crearla).
    const ya = await ctx.db.ordenTrabajo.count({ where: { planId: p.id, estado: { in: [...ESTADOS_ORDEN_ABIERTA] } } });
    if (ya) continue;
    const o = await crearOrdenDePlan(ctx, p);
    conAbierta.add(p.id);
    creadas.push({ id: o.id, numero: o.numero, titulo: o.titulo });
  }
  if (creadas.length) {
    const admins = await usuariosConPermiso(ctx.conjuntoId, ["mantenimiento.crear"]);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo: `${creadas.length} órdenes de mantenimiento generadas`,
      cuerpo: creadas
        .slice(0, 5)
        .map((c) => `#${c.numero} ${c.titulo}`)
        .join(" · "),
      enlace: "/mantenimiento?vista=abiertas",
      tipo: "MANTENIMIENTO",
    });
  }
  return creadas;
}

// ───────────────────────────── Calendario ─────────────────────────────

export type EventoCalendario = { fecha: Date; titulo: string; tipo: "ORDEN" | "PLAN"; estado: string; href: string; mantenimiento?: string };

/**
 * Eventos del mes: órdenes visibles con fecha programada en el mes + proyección de los planes
 * (próxima fecha y repeticiones por frecuencia) que aún no tienen orden.
 */
export async function calendarioMes(ctx: Ctx, anio: number, mes: number) {
  const desde = new Date(Date.UTC(anio, mes - 1, 1, 5));
  const hasta = new Date(Date.UTC(anio, mes, 1, 5));
  const scope = await ordenScope(ctx);
  const ordenes = await ctx.db.ordenTrabajo.findMany({
    where: { AND: [scope, { fechaProgramada: { gte: desde, lt: hasta } }, { estado: { not: "CANCELADA" } }] },
    include: { plan: { select: { tipo: true } } },
    orderBy: { fechaProgramada: "asc" },
  });
  const eventos: EventoCalendario[] = ordenes.map((o) => ({
    fecha: o.fechaProgramada,
    titulo: `#${o.numero} ${o.titulo}`,
    tipo: "ORDEN",
    estado: o.estado,
    href: `/mantenimiento/ordenes/${o.id}`,
    mantenimiento: o.plan?.tipo,
  }));
  if (vePlanes(ctx)) {
    const planes = await ctx.db.planMantenimiento.findMany({ where: { activoPlan: true, proximaFecha: { lt: hasta } }, include: { activo: { select: { nombre: true } } } });
    const conOrden = new Set(ordenes.filter((o) => o.planId && o.estado !== "COMPLETADA").map((o) => o.planId));
    for (const p of planes) {
      let f = p.proximaFecha;
      let first = true;
      let guard = 0;
      while (f < hasta && guard++ < 400) {
        if (f >= desde && !(first && conOrden.has(p.id))) {
          eventos.push({ fecha: f, titulo: p.nombre, tipo: "PLAN", estado: f < startOfDayBogota() ? "VENCIDO" : "PROGRAMADO", href: `/mantenimiento/planes?plan=${p.id}`, mantenimiento: p.tipo });
        }
        first = false;
        f = proximaFechaPlan(f, p.frecuenciaDias);
      }
    }
  }
  return eventos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

// ───────────────────────────── Opciones ─────────────────────────────

/** Usuarios que pueden ejecutar órdenes (rol mantenimiento, administradores…) para asignar. */
export async function responsablesOptions(ctx: Ctx) {
  const ms = await prisma.membresiaConjunto.findMany({
    where: {
      conjuntoId: ctx.conjuntoId,
      estado: "ACTIVA",
      deletedAt: null,
      rol: { permisos: { some: { permisoClave: { in: ["mantenimiento.ejecutar", "mantenimiento.gestionar"] }, deletedAt: null } } },
      usuario: { deletedAt: null },
    },
    select: { usuario: { select: { id: true, nombre: true } }, rol: { select: { nombre: true, clave: true, basadoEnClave: true } } },
  });
  return ms
    .filter((m) => (m.rol.basadoEnClave ?? m.rol.clave) !== "PROVEEDOR")
    .map((m) => ({ value: m.usuario.id, label: m.usuario.nombre, group: m.rol.nombre }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

export async function activoOptions(ctx: Ctx) {
  const rows = await ctx.db.activo.findMany({ where: { estado: { not: "DADO_DE_BAJA" } }, select: { id: true, nombre: true, categoria: true }, orderBy: { nombre: "asc" } });
  return rows.map((a) => ({ value: a.id, label: a.nombre, group: a.categoria }));
}

export async function proveedorOptions(ctx: Ctx) {
  const rows = await ctx.db.proveedor.findMany({ where: { activo: true }, select: { id: true, razonSocial: true, categoria: true }, orderBy: { razonSocial: "asc" } });
  return rows.map((p) => ({ value: p.id, label: p.razonSocial, group: p.categoria }));
}
