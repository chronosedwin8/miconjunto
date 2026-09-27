import type { EstadoActivo, PrioridadTicket, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { nextConsecutivo } from "@/lib/consecutivo";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { insensitive } from "@/lib/pagination";
import { nowBogota, toNumber } from "@/lib/format";
import { addDias } from "@/lib/mantenimiento/calculos";
import { DIAS_SLA_PRIORIDAD } from "./constants";

export type FiltrosActivos = { q?: string; categoria?: string; estado?: string; zonaId?: string };

export function whereActivos(f: FiltrosActivos): Prisma.ActivoWhereInput {
  return {
    ...(f.q ? { OR: [{ nombre: insensitive(f.q) }, { serie: insensitive(f.q) }, { marca: insensitive(f.q) }, { ubicacion: insensitive(f.q) }] } : {}),
    ...(f.categoria ? { categoria: f.categoria } : {}),
    ...(f.estado ? { estado: f.estado as EstadoActivo } : {}),
    ...(f.zonaId ? { zonaId: f.zonaId } : {}),
  };
}

export async function listarActivos(ctx: Ctx, f: FiltrosActivos, page?: { skip: number; take: number }) {
  const where = whereActivos(f);
  const [items, total] = await Promise.all([
    ctx.db.activo.findMany({
      where,
      include: { zona: { select: { nombre: true } }, proveedor: { select: { razonSocial: true } }, planes: { where: { deletedAt: null, activoPlan: true }, select: { proximaFecha: true, tipo: true } } },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
      ...(page ?? {}),
    }),
    ctx.db.activo.count({ where }),
  ]);
  return { items, total };
}

export async function resumenActivos(ctx: Ctx) {
  const [porEstado, valor] = await Promise.all([ctx.db.activo.groupBy({ by: ["estado"], _count: true }), ctx.db.activo.aggregate({ _sum: { valor: true } })]);
  const c = (e: string) => porEstado.find((x) => x.estado === e)?._count ?? 0;
  return {
    total: porEstado.reduce((a, x) => a + x._count, 0),
    operativos: c("OPERATIVO"),
    enMantenimiento: c("EN_MANTENIMIENTO"),
    fueraServicio: c("FUERA_SERVICIO"),
    valorTotal: toNumber(valor._sum.valor),
  };
}

/** Ficha del activo con historial de órdenes, tickets y costos. */
export async function fichaActivo(ctx: Ctx, id: string) {
  const a = await ctx.db.activo.findUnique({
    where: { id },
    include: {
      zona: { select: { id: true, nombre: true } },
      proveedor: { select: { id: true, razonSocial: true, telefono: true } },
      planes: { where: { deletedAt: null }, orderBy: { proximaFecha: "asc" }, include: { proveedor: { select: { razonSocial: true } } } },
    },
  });
  if (!a) notFound("El activo");
  const [ordenes, tickets] = await Promise.all([
    ctx.db.ordenTrabajo.findMany({ where: { activoId: id }, orderBy: { fechaProgramada: "desc" }, take: 60, include: { proveedor: { select: { razonSocial: true } } } }),
    ctx.db.ticket.findMany({ where: { activoId: id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, radicado: true, titulo: true, estado: true, prioridad: true, createdAt: true, origen: true } }),
  ]);
  const anio = nowBogota().year;
  const inicioAnio = new Date(Date.UTC(anio, 0, 1, 5));
  const completadas = ordenes.filter((o) => o.estado === "COMPLETADA");
  const costoTotal = completadas.reduce((s, o) => s + toNumber(o.costo), 0);
  const costoAnio = completadas.filter((o) => o.fechaCierre && o.fechaCierre >= inicioAnio).reduce((s, o) => s + toNumber(o.costo), 0);
  return { ...a, ordenes, tickets, costos: { total: costoTotal, anio: costoAnio, correctivas: ordenes.filter((o) => o.origen !== "PLAN").length } };
}

export type ActivoInput = {
  id?: string | null;
  nombre: string;
  categoria: string;
  ubicacion?: string | null;
  zonaId?: string | null;
  marca?: string | null;
  modelo?: string | null;
  serie?: string | null;
  fechaCompra?: Date | null;
  valor?: number | null;
  vidaUtilAnios?: number | null;
  proveedorId?: string | null;
  garantiaVence?: Date | null;
  fotos?: string[];
  manuales?: string[];
  estado: EstadoActivo;
  notas?: string | null;
};

export async function guardarActivo(ctx: Ctx, input: ActivoInput) {
  const { id, ...data } = input;
  if (data.zonaId && !(await ctx.db.zonaComun.findUnique({ where: { id: data.zonaId } }))) throw new AppError("La zona no existe.");
  if (data.proveedorId && !(await ctx.db.proveedor.findUnique({ where: { id: data.proveedorId } }))) throw new AppError("El proveedor no existe.");
  if (id) {
    const antes = await ctx.db.activo.findUnique({ where: { id } });
    if (!antes) notFound("El activo");
    const a = await ctx.db.activo.update({ where: { id }, data: { ...data, fotos: data.fotos ?? antes.fotos, manuales: data.manuales ?? antes.manuales } });
    await audit(ctx, "editar", "Activo", id, antes, a);
    return a;
  }
  const a = await ctx.db.activo.create({ data: { ...data, fotos: data.fotos ?? [], manuales: data.manuales ?? [], conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Activo", a.id, undefined, a);
  return a;
}

export async function cambiarEstadoActivo(ctx: Ctx, id: string, estado: EstadoActivo) {
  const antes = await ctx.db.activo.findUnique({ where: { id } });
  if (!antes) notFound("El activo");
  const a = await ctx.db.activo.update({ where: { id }, data: { estado } });
  await audit(ctx, "cambiar_estado", "Activo", id, { estado: antes.estado }, { estado });
  return a;
}

export async function eliminarActivo(ctx: Ctx, id: string) {
  const abiertas = await ctx.db.ordenTrabajo.count({ where: { activoId: id, estado: { in: ["PENDIENTE", "PROGRAMADA", "EN_PROCESO"] } } });
  if (abiertas) throw new AppError(`El activo tiene ${abiertas} órdenes abiertas. Ciérralas o cancélalas primero.`);
  await ctx.db.activo.update({ where: { id }, data: { deletedAt: new Date() } });
  await ctx.db.planMantenimiento.updateMany({ where: { activoId: id }, data: { activoPlan: false } });
  await audit(ctx, "eliminar", "Activo", id);
  return true;
}

// ── QR público ──

/** Ficha mínima pública del activo (al escanear el QR): sin datos sensibles. */
export async function activoPublico(codigoQr: string) {
  const a = await prisma.activo.findFirst({
    where: { codigoQr, deletedAt: null },
    select: {
      id: true,
      nombre: true,
      categoria: true,
      ubicacion: true,
      estado: true,
      conjuntoId: true,
      zona: { select: { nombre: true } },
      conjunto: { select: { nombre: true, colorPrimario: true, logoUrl: true } },
    },
  });
  return a;
}

export type ReporteFallaInput = { codigoQr: string; descripcion: string; prioridad: PrioridadTicket; fotos: string[] };

/**
 * Reporte de falla desde el QR: crea un Ticket tipo DANO_ZONA_COMUN con el activo, origen ACTIVO_QR,
 * radicado AAAA-0001 y fecha límite según prioridad. El módulo de tickets lo gestiona desde ahí.
 */
export async function reportarFallaActivo(ctx: Ctx, input: ReporteFallaInput) {
  const activo = await ctx.db.activo.findFirst({ where: { codigoQr: input.codigoQr }, include: { zona: { select: { nombre: true } } } });
  if (!activo) throw new AppError("Este código QR no corresponde a un activo de tu conjunto.", 404);
  const ahora = new Date();
  const anio = nowBogota(ahora).year;
  const n = await nextConsecutivo(ctx.conjuntoId, "RADICADO", anio);
  const radicado = `${anio}-${String(n).padStart(4, "0")}`;
  const ticket = await ctx.db.ticket.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      radicado,
      tipo: "DANO_ZONA_COMUN",
      solicitanteId: ctx.userId,
      solicitanteNombre: ctx.nombre,
      solicitanteEmail: ctx.email,
      zonaId: activo.zonaId,
      activoId: activo.id,
      unidadId: ctx.unidadIds[0] ?? null,
      titulo: `Falla en ${activo.nombre}`.slice(0, 150),
      descripcion: input.descripcion,
      adjuntos: input.fotos,
      ubicacion: activo.ubicacion ?? activo.zona?.nombre ?? null,
      prioridad: input.prioridad,
      estado: "ABIERTO",
      origen: "ACTIVO_QR",
      fechaLimite: addDias(ahora, DIAS_SLA_PRIORIDAD[input.prioridad]),
    },
  });
  await audit(ctx, "reportar_falla_qr", "Ticket", ticket.id, undefined, { radicado, activoId: activo.id, prioridad: input.prioridad });
  await emit({ tipo: "ticket.creado", conjuntoId: ctx.conjuntoId, actorId: ctx.userId, data: { id: ticket.id, radicado, tipo: ticket.tipo, activoId: activo.id, origen: "ACTIVO_QR", prioridad: input.prioridad } });
  const destinatarios = (await usuariosConPermiso(ctx.conjuntoId, ["mantenimiento.gestionar"])).filter((u) => u !== ctx.userId);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: destinatarios,
    titulo: `Falla reportada: ${activo.nombre}`,
    cuerpo: `${ctx.nombre} reportó por QR (radicado ${radicado}, prioridad ${input.prioridad.toLowerCase()}): ${input.descripcion.slice(0, 140)}`,
    enlace: `/tickets/${ticket.id}`,
    tipo: "MANTENIMIENTO",
    canales: input.prioridad === "URGENTE" || input.prioridad === "ALTA" ? ["push", "email"] : ["push"],
  });
  return { id: ticket.id, radicado };
}
