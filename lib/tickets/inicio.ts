import type { EstadoTicket, PrioridadTicket } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { ESTADOS_ABIERTOS } from "./reglas";

/** Datos de widgets de tickets para el Inicio (el coordinador compone /inicio). */

export type TicketResumenItem = {
  id: string;
  radicado: string;
  titulo: string;
  estado: EstadoTicket;
  prioridad: PrioridadTicket;
  fechaLimite: Date;
  vencido: boolean;
  href: string;
};

export type ResumenTicketsResidente = { abiertos: number; items: TicketResumenItem[]; porCalificar: number; href: string; nuevoHref: string };
export type ResumenTicketsAdmin = { porEstado: { estado: EstadoTicket; total: number }[]; abiertos: number; vencidos: number; urgentes: number; sinAsignar: number; vencidosItems: TicketResumenItem[]; href: string };
export type ResumenTicketsMantenimiento = { asignados: number; vencidos: number; items: TicketResumenItem[]; href: string };

const abiertos = { estado: { in: [...ESTADOS_ABIERTOS] } };

function item(t: { id: string; radicado: string; titulo: string; estado: EstadoTicket; prioridad: PrioridadTicket; fechaLimite: Date }, ahora: Date): TicketResumenItem {
  return { ...t, vencido: t.fechaLimite < ahora, href: `/tickets/${t.id}` };
}

const sel = { id: true, radicado: true, titulo: true, estado: true, prioridad: true, fechaLimite: true } as const;

/** Residente/propietario: sus tickets abiertos y los resueltos pendientes de calificar. */
export async function resumenTicketsResidente(ctx: Ctx): Promise<ResumenTicketsResidente> {
  const ahora = new Date();
  const mios = { OR: [{ solicitanteId: ctx.userId }, { unidadId: { in: ctx.unidadIds } }] };
  const [items, total, porCalificar] = await Promise.all([
    ctx.db.ticket.findMany({ where: { AND: [mios, abiertos] }, select: sel, orderBy: { createdAt: "desc" }, take: 5 }),
    ctx.db.ticket.count({ where: { AND: [mios, abiertos] } }),
    ctx.db.ticket.count({ where: { AND: [mios, { estado: "RESUELTO", calificacion: null }] } }),
  ]);
  return { abiertos: total, items: items.map((t) => item(t, ahora)), porCalificar, href: "/tickets", nuevoHref: "/tickets/nuevo" };
}

/** Administración: tickets por estado, vencidos de SLA, urgentes y sin asignar. */
export async function resumenTicketsAdmin(ctx: Ctx): Promise<ResumenTicketsAdmin> {
  const ahora = new Date();
  const [grupos, vencidosItems, vencidos, urgentes, sinAsignar] = await Promise.all([
    ctx.db.ticket.groupBy({ by: ["estado"], where: { conjuntoId: ctx.conjuntoId }, _count: { _all: true } }),
    ctx.db.ticket.findMany({ where: { ...abiertos, fechaLimite: { lt: ahora } }, select: sel, orderBy: { fechaLimite: "asc" }, take: 5 }),
    ctx.db.ticket.count({ where: { ...abiertos, fechaLimite: { lt: ahora } } }),
    ctx.db.ticket.count({ where: { ...abiertos, prioridad: "URGENTE" } }),
    ctx.db.ticket.count({ where: { ...abiertos, asignadoAId: null, proveedorId: null } }),
  ]);
  const porEstado = grupos.map((g) => ({ estado: g.estado, total: g._count._all }));
  return {
    porEstado,
    abiertos: porEstado.filter((p) => ESTADOS_ABIERTOS.includes(p.estado)).reduce((a, p) => a + p.total, 0),
    vencidos,
    urgentes,
    sinAsignar,
    vencidosItems: vencidosItems.map((t) => item(t, ahora)),
    href: "/tickets",
  };
}

/** Mantenimiento: tickets asignados abiertos. */
export async function resumenTicketsMantenimiento(ctx: Ctx): Promise<ResumenTicketsMantenimiento> {
  const ahora = new Date();
  const where = { ...abiertos, asignadoAId: ctx.userId };
  const [items, asignados, vencidos] = await Promise.all([
    ctx.db.ticket.findMany({ where, select: sel, orderBy: { fechaLimite: "asc" }, take: 5 }),
    ctx.db.ticket.count({ where }),
    ctx.db.ticket.count({ where: { ...where, fechaLimite: { lt: ahora } } }),
  ]);
  return { asignados, vencidos, items: items.map((t) => item(t, ahora)), href: "/tickets" };
}
