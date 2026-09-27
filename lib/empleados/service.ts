import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { insensitive } from "@/lib/pagination";
import { startOfDayBogota } from "@/lib/format";
import { semaforoVencimiento, type Semaforo } from "@/lib/mantenimiento/calculos";

export const CARGOS_EMPLEADO = ["Portero", "Supervisor de seguridad", "Aseo", "Jardinería", "Mantenimiento", "Salvavidas", "Mensajería", "Auxiliar administrativo", "Otro"] as const;
export const TURNOS_EMPLEADO = ["Diurno 6:00–14:00", "Tarde 14:00–22:00", "Nocturno 22:00–6:00", "Día 7:00–16:00", "12 horas día", "12 horas noche", "Fines de semana"] as const;

export type FiltrosEmpleados = { q?: string; cargo?: string; estado?: string; alerta?: string };

export function whereEmpleados(f: FiltrosEmpleados): Prisma.EmpleadoWhereInput {
  const hoy = startOfDayBogota();
  const en30 = new Date(hoy.getTime() + 30 * 86_400_000);
  return {
    AND: [
      f.q ? { OR: [{ nombre: insensitive(f.q) }, { documento: insensitive(f.q) }, { cargo: insensitive(f.q) }] } : {},
      f.cargo ? { cargo: f.cargo } : {},
      f.estado === "inactivos" ? { activo: false } : f.estado === "todos" ? {} : { activo: true },
      f.alerta === "si" ? { OR: [{ epsVence: { lte: en30 } }, { arlVence: { lte: en30 } }] } : {},
    ],
  };
}

/** Peor semáforo entre EPS y ARL (para el listado y la portería). */
export function semaforoEmpleado(e: { epsVence: Date | null; arlVence: Date | null }, hoy = startOfDayBogota()): Semaforo | null {
  const s = [semaforoVencimiento(e.epsVence, hoy), semaforoVencimiento(e.arlVence, hoy)];
  if (s.includes("VENCIDO")) return "VENCIDO";
  if (s.includes("POR_VENCER")) return "POR_VENCER";
  if (s.includes("VIGENTE")) return "VIGENTE";
  return null;
}

export async function listarEmpleados(ctx: Ctx, f: FiltrosEmpleados, page?: { skip: number; take: number }) {
  const where = whereEmpleados(f);
  const [items, total] = await Promise.all([
    ctx.db.empleado.findMany({ where, orderBy: [{ activo: "desc" }, { cargo: "asc" }, { nombre: "asc" }], ...(page ?? {}) }),
    ctx.db.empleado.count({ where }),
  ]);
  const hoy = startOfDayBogota();
  return { items: items.map((e) => ({ ...e, semaforo: semaforoEmpleado(e, hoy) })), total };
}

export async function resumenEmpleados(ctx: Ctx) {
  const rows = await ctx.db.empleado.findMany({ where: { activo: true }, select: { epsVence: true, arlVence: true, cargo: true } });
  const hoy = startOfDayBogota();
  const s = rows.map((r) => semaforoEmpleado(r, hoy));
  return { activos: rows.length, vencidos: s.filter((x) => x === "VENCIDO").length, porVencer: s.filter((x) => x === "POR_VENCER").length };
}

export type EmpleadoInput = {
  id?: string | null;
  nombre: string;
  documento?: string | null;
  cargo: string;
  turno?: string | null;
  telefono?: string | null;
  fotoUrl?: string | null;
  epsVence?: Date | null;
  arlVence?: Date | null;
  fechaIngreso?: Date | null;
  documentos?: string[];
  activo: boolean;
};

export async function guardarEmpleado(ctx: Ctx, input: EmpleadoInput) {
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.empleado.findUnique({ where: { id } });
    if (!antes) notFound("El empleado");
    const e = await ctx.db.empleado.update({ where: { id }, data: { ...data, documentos: data.documentos ?? antes.documentos } });
    await audit(ctx, "editar", "Empleado", id, antes, e);
    return e;
  }
  const e = await ctx.db.empleado.create({ data: { ...data, documentos: data.documentos ?? [], conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Empleado", e.id, undefined, e);
  return e;
}

export async function retirarEmpleado(ctx: Ctx, id: string) {
  const antes = await ctx.db.empleado.findUnique({ where: { id } });
  if (!antes) notFound("El empleado");
  await ctx.db.empleado.update({ where: { id }, data: { activo: false } });
  await audit(ctx, "retirar", "Empleado", id, { activo: true }, { activo: false });
  return true;
}

/** Empleados activos con foto, para identificar al personal en portería. */
export async function empleadosParaPorteria(ctx: Ctx) {
  return ctx.db.empleado.findMany({ where: { activo: true }, select: { id: true, nombre: true, cargo: true, turno: true, fotoUrl: true }, orderBy: { nombre: "asc" } });
}
