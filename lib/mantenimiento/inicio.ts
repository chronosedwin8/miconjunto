/**
 * Datos para los widgets del Inicio (§9 de la guía). El coordinador los compone en /inicio.
 *   - resumenMantenimientoAdmin(ctx): administración (mantenimientos vencidos, órdenes, vencimientos).
 *   - resumenMantenimientoTecnico(ctx): rol mantenimiento o proveedor (sus órdenes de hoy).
 */
import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { startOfDayBogota } from "@/lib/format";
import { ESTADOS_ORDEN_ABIERTA } from "./calculos";
import { ordenScope } from "./service";
import { vencimientos, type Vencimiento } from "./vencimientos";

export type OrdenWidget = { id: string; numero: number; titulo: string; fechaProgramada: Date; estado: string; activo: string | null; ubicacion: string | null; atrasada: boolean };

export type ResumenMantenimientoAdmin = {
  planesVencidos: number;
  ordenesAbiertas: number;
  ordenesAtrasadas: number;
  gastosPendientes: number;
  /** Vencimientos (contratos, pólizas, documentos, garantías, EPS/ARL, legales) vencidos o próximos (30 días). */
  vencimientos: Pick<Vencimiento, "tipo" | "titulo" | "detalle" | "fecha" | "dias" | "semaforo" | "enlace">[];
  enlace: string;
};

export async function resumenMantenimientoAdmin(ctx: Ctx): Promise<ResumenMantenimientoAdmin | null> {
  if (!can(ctx, ["mantenimiento.ver_todos", "proveedores.ver"])) return null;
  const hoy = startOfDayBogota();
  const abiertas = { estado: { in: [...ESTADOS_ORDEN_ABIERTA] } };
  const [planesVencidos, ordenesAbiertas, ordenesAtrasadas, gastosPendientes, venc] = await Promise.all([
    ctx.db.planMantenimiento.count({ where: { activoPlan: true, proximaFecha: { lt: hoy } } }),
    ctx.db.ordenTrabajo.count({ where: abiertas }),
    ctx.db.ordenTrabajo.count({ where: { ...abiertas, fechaProgramada: { lt: hoy } } }),
    can(ctx, "presupuesto.ver") ? ctx.db.gasto.count({ where: { estado: "PENDIENTE_APROBACION" } }) : Promise.resolve(0),
    vencimientos(ctx, { ventanaDias: 30, vencidosDesdeDias: 90 }),
  ]);
  return {
    planesVencidos,
    ordenesAbiertas,
    ordenesAtrasadas,
    gastosPendientes,
    vencimientos: venc.slice(0, 10).map(({ tipo, titulo, detalle, fecha, dias, semaforo, enlace }) => ({ tipo, titulo, detalle, fecha, dias, semaforo, enlace })),
    enlace: "/mantenimiento",
  };
}

export type ResumenMantenimientoTecnico = { hoy: OrdenWidget[]; atrasadas: number; abiertas: number; enlace: string };

/** Órdenes asignadas al usuario (técnico o proveedor) para hoy y atrasadas. */
export async function resumenMantenimientoTecnico(ctx: Ctx): Promise<ResumenMantenimientoTecnico | null> {
  if (!can(ctx, ["mantenimiento.ejecutar", "mantenimiento.gestionar"])) return null;
  const scope = await ordenScope(ctx);
  const hoy = startOfDayBogota();
  const manana = new Date(hoy.getTime() + 86_400_000);
  const abiertas = { estado: { in: [...ESTADOS_ORDEN_ABIERTA] } };
  const [rows, atrasadas, total] = await Promise.all([
    ctx.db.ordenTrabajo.findMany({
      where: { AND: [scope, abiertas, { fechaProgramada: { lt: manana } }] },
      include: { activo: { select: { nombre: true, ubicacion: true } } },
      orderBy: { fechaProgramada: "asc" },
      take: 10,
    }),
    ctx.db.ordenTrabajo.count({ where: { AND: [scope, abiertas, { fechaProgramada: { lt: hoy } }] } }),
    ctx.db.ordenTrabajo.count({ where: { AND: [scope, abiertas] } }),
  ]);
  return {
    hoy: rows.map((o) => ({ id: o.id, numero: o.numero, titulo: o.titulo, fechaProgramada: o.fechaProgramada, estado: o.estado, activo: o.activo?.nombre ?? null, ubicacion: o.activo?.ubicacion ?? null, atrasada: o.fechaProgramada < hoy })),
    atrasadas,
    abiertas: total,
    enlace: "/mantenimiento",
  };
}
