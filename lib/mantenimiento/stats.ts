/**
 * Indicadores de mantenimiento para el módulo de estadísticas (§5.15) y la pestaña Indicadores.
 * Todas reciben `ctx` (cliente aislado por conjunto) y un rango [desde, hasta).
 */
import type { Ctx } from "@/lib/auth/context";
import { toNumber } from "@/lib/format";
import { desempenoProveedores } from "@/lib/proveedores/service";
import { cumplimiento, mtbfDias } from "./calculos";

export type Rango = { desde: Date; hasta: Date };

export type CumplimientoPlan = ReturnType<typeof cumplimiento> & {
  porTipo: { tipo: string; total: number; completadas: number; pctCumplimiento: number }[];
  porMes: { mes: string; programadas: number; completadas: number; aTiempo: number }[];
};

/** Cumplimiento del plan: órdenes de origen PLAN programadas en el rango. */
export async function cumplimientoPlan(ctx: Ctx, r: Rango): Promise<CumplimientoPlan> {
  const ordenes = await ctx.db.ordenTrabajo.findMany({
    where: { origen: "PLAN", fechaProgramada: { gte: r.desde, lt: r.hasta } },
    select: { estado: true, fechaProgramada: true, fechaCierre: true, plan: { select: { tipo: true } } },
  });
  const total = cumplimiento(ordenes);
  const tipos = ["PREVENTIVO", "CORRECTIVO", "LEGAL"];
  const porTipo = tipos.map((t) => {
    const c = cumplimiento(ordenes.filter((o) => o.plan?.tipo === t));
    return { tipo: t, total: c.total, completadas: c.completadas, pctCumplimiento: c.pctCumplimiento };
  });
  const meses = new Map<string, typeof ordenes>();
  for (const o of ordenes) {
    const d = new Date(o.fechaProgramada.getTime() - 5 * 3_600_000);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    meses.set(k, [...(meses.get(k) ?? []), o]);
  }
  const porMes = [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, os]) => {
      const c = cumplimiento(os);
      return { mes, programadas: c.total, completadas: c.completadas, aTiempo: c.aTiempo };
    });
  return { ...total, porTipo, porMes };
}

export type CostoActivo = { activoId: string; nombre: string; categoria: string; ordenes: number; preventivo: number; correctivo: number; total: number };

/** Costos de órdenes completadas por activo (preventivo = origen PLAN; correctivo = ticket o manual). */
export async function costosPorActivo(ctx: Ctx, r: Rango): Promise<CostoActivo[]> {
  const ordenes = await ctx.db.ordenTrabajo.findMany({
    where: { estado: "COMPLETADA", activoId: { not: null }, fechaCierre: { gte: r.desde, lt: r.hasta } },
    select: { activoId: true, origen: true, costo: true, activo: { select: { nombre: true, categoria: true } } },
  });
  const m = new Map<string, CostoActivo>();
  for (const o of ordenes) {
    const k = o.activoId!;
    const c = m.get(k) ?? { activoId: k, nombre: o.activo?.nombre ?? "—", categoria: o.activo?.categoria ?? "", ordenes: 0, preventivo: 0, correctivo: 0, total: 0 };
    const v = toNumber(o.costo);
    c.ordenes++;
    if (o.origen === "PLAN") c.preventivo += v;
    else c.correctivo += v;
    c.total += v;
    m.set(k, c);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export type MtbfActivo = { activoId: string; nombre: string; categoria: string; fallas: number; mtbfDias: number | null };

/**
 * MTBF aproximado por activo: fallas = tickets de daño con el activo + órdenes correctivas (no PLAN)
 * que no provienen de un ticket ya contado. Solo activos con al menos una falla en el rango.
 */
export async function mtbfPorActivo(ctx: Ctx, r: Rango): Promise<MtbfActivo[]> {
  const [tickets, ordenes, activos] = await Promise.all([
    ctx.db.ticket.findMany({ where: { activoId: { not: null }, createdAt: { gte: r.desde, lt: r.hasta } }, select: { id: true, activoId: true, createdAt: true } }),
    ctx.db.ordenTrabajo.findMany({ where: { activoId: { not: null }, origen: { not: "PLAN" }, fechaProgramada: { gte: r.desde, lt: r.hasta }, estado: { not: "CANCELADA" } }, select: { activoId: true, ticketId: true, fechaProgramada: true } }),
    ctx.db.activo.findMany({ select: { id: true, nombre: true, categoria: true } }),
  ]);
  const fallas = new Map<string, Date[]>();
  const add = (id: string, d: Date) => fallas.set(id, [...(fallas.get(id) ?? []), d]);
  const ticketIds = new Set(tickets.map((t) => t.id));
  for (const t of tickets) add(t.activoId!, t.createdAt);
  for (const o of ordenes) if (!o.ticketId || !ticketIds.has(o.ticketId)) add(o.activoId!, o.fechaProgramada);
  const nombre = new Map(activos.map((a) => [a.id, a]));
  return [...fallas.entries()]
    .map(([id, fs]) => ({ activoId: id, nombre: nombre.get(id)?.nombre ?? "—", categoria: nombre.get(id)?.categoria ?? "", fallas: fs.length, mtbfDias: mtbfDias(fs, r) }))
    .sort((a, b) => b.fallas - a.fallas);
}

/** Proveedores por desempeño (órdenes, % a tiempo, costo, calificación). */
export async function proveedoresPorDesempeno(ctx: Ctx, r: Rango) {
  return desempenoProveedores(ctx, r.desde, r.hasta);
}

/** Resumen para tarjetas: órdenes, costo total y promedio de días de cierre. */
export async function resumenMantenimiento(ctx: Ctx, r: Rango) {
  const ordenes = await ctx.db.ordenTrabajo.findMany({
    where: { fechaProgramada: { gte: r.desde, lt: r.hasta } },
    select: { estado: true, origen: true, costo: true, createdAt: true, fechaCierre: true },
  });
  const cerradas = ordenes.filter((o) => o.estado === "COMPLETADA" && o.fechaCierre);
  const dias = cerradas.map((o) => (o.fechaCierre!.getTime() - o.createdAt.getTime()) / 86_400_000).filter((d) => d >= 0);
  return {
    ordenes: ordenes.length,
    completadas: cerradas.length,
    abiertas: ordenes.filter((o) => ["PENDIENTE", "PROGRAMADA", "EN_PROCESO"].includes(o.estado)).length,
    correctivas: ordenes.filter((o) => o.origen !== "PLAN").length,
    costo: cerradas.reduce((a, o) => a + toNumber(o.costo), 0),
    diasPromedioCierre: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null,
  };
}
