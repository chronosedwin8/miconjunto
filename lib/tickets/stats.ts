import type { EstadoTicket, Prisma, TipoTicket } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { estadoSla } from "./reglas";
import { whereVisibles } from "./service";

/** Estadísticas de la mesa de ayuda: por tipo y estado, tiempos de resolución, SLA y satisfacción. */
export type TicketStatRow = {
  tipo: TipoTicket;
  estado: EstadoTicket;
  createdAt: Date;
  fechaLimite: Date;
  primeraRespuestaEn: Date | null;
  resueltoEn: Date | null;
  calificacion: number | null;
  reabiertoVeces: number;
};

export type EstadisticasTickets = {
  total: number;
  abiertos: number;
  vencidos: number;
  porTipo: { tipo: TipoTicket; total: number }[];
  porEstado: { estado: EstadoTicket; total: number }[];
  /** Horas promedio desde la radicación hasta la resolución (solo resueltos/cerrados). */
  horasResolucionPromedio: number | null;
  /** Horas promedio hasta la primera respuesta de la administración. */
  horasPrimeraRespuesta: number | null;
  /** % de tickets resueltos dentro de la fecha límite. */
  cumplimientoSla: number | null;
  satisfaccionPromedio: number | null;
  calificaciones: { estrellas: number; total: number }[];
  reabiertos: number;
};

const HORA = 3_600_000;
const redondear = (n: number) => Math.round(n * 10) / 10;

/** Cálculo puro (probado en tests/unit/tickets.test.ts). */
export function calcularEstadisticas(rows: TicketStatRow[], ahora: Date = new Date()): EstadisticasTickets {
  const porTipo = new Map<TipoTicket, number>();
  const porEstado = new Map<EstadoTicket, number>();
  let abiertos = 0;
  let vencidos = 0;
  let sumRes = 0;
  let nRes = 0;
  let sumPR = 0;
  let nPR = 0;
  let cumplidos = 0;
  let sumCal = 0;
  let nCal = 0;
  let reabiertos = 0;
  const cal = [0, 0, 0, 0, 0];
  for (const r of rows) {
    porTipo.set(r.tipo, (porTipo.get(r.tipo) ?? 0) + 1);
    porEstado.set(r.estado, (porEstado.get(r.estado) ?? 0) + 1);
    const sla = estadoSla(r, ahora);
    if (sla === "VENCIDO") vencidos++;
    if (sla === "VENCIDO" || sla === "POR_VENCER" || sla === "A_TIEMPO") abiertos++;
    if (r.resueltoEn && (r.estado === "RESUELTO" || r.estado === "CERRADO")) {
      sumRes += (r.resueltoEn.getTime() - r.createdAt.getTime()) / HORA;
      nRes++;
      if (sla === "CUMPLIDO") cumplidos++;
    }
    if (r.primeraRespuestaEn) {
      sumPR += (r.primeraRespuestaEn.getTime() - r.createdAt.getTime()) / HORA;
      nPR++;
    }
    if (r.calificacion && r.calificacion >= 1 && r.calificacion <= 5) {
      sumCal += r.calificacion;
      nCal++;
      cal[r.calificacion - 1]++;
    }
    if (r.reabiertoVeces > 0) reabiertos++;
  }
  return {
    total: rows.length,
    abiertos,
    vencidos,
    porTipo: [...porTipo.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
    porEstado: [...porEstado.entries()].map(([estado, total]) => ({ estado, total })),
    horasResolucionPromedio: nRes ? redondear(sumRes / nRes) : null,
    horasPrimeraRespuesta: nPR ? redondear(sumPR / nPR) : null,
    cumplimientoSla: nRes ? redondear((cumplidos / nRes) * 100) : null,
    satisfaccionPromedio: nCal ? Math.round((sumCal / nCal) * 100) / 100 : null,
    calificaciones: cal.map((total, i) => ({ estrellas: i + 1, total })),
    reabiertos,
  };
}

export async function estadisticasTickets(ctx: Ctx, opts: { desde?: Date; hasta?: Date } = {}) {
  const where: Prisma.TicketWhereInput = {
    AND: [whereVisibles(ctx), opts.desde || opts.hasta ? { createdAt: { ...(opts.desde ? { gte: opts.desde } : {}), ...(opts.hasta ? { lt: opts.hasta } : {}) } } : {}],
  };
  const rows = await ctx.db.ticket.findMany({
    where,
    select: { tipo: true, estado: true, createdAt: true, fechaLimite: true, primeraRespuestaEn: true, resueltoEn: true, calificacion: true, reabiertoVeces: true },
  });
  return calcularEstadisticas(rows);
}

/** Tickets radicados por mes (últimos N meses) para gráficos. */
export async function ticketsPorMes(ctx: Ctx, meses = 6, ahora = new Date()) {
  const desde = new Date(ahora.getFullYear(), ahora.getMonth() - (meses - 1), 1);
  const rows = await ctx.db.ticket.findMany({ where: { AND: [whereVisibles(ctx), { createdAt: { gte: desde } }] }, select: { createdAt: true, estado: true } });
  const out: { mes: string; radicados: number; resueltos: number }[] = [];
  for (let i = 0; i < meses; i++) {
    const d = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const del = rows.filter((r) => r.createdAt.getFullYear() === d.getFullYear() && r.createdAt.getMonth() === d.getMonth());
    out.push({ mes: k, radicados: del.length, resueltos: del.filter((r) => r.estado === "RESUELTO" || r.estado === "CERRADO").length });
  }
  return out;
}
