/** Datos del módulo de reservas para los widgets de /inicio (los compone el coordinador). */
import type { Ctx } from "@/lib/auth/context";
import { reporteIngresosAlquiler } from "@/lib/facturacion/service";
import { fechaHoraBogota, fechaLocal, sumarDias } from "./reglas";
import { cuotasDeReserva, enlacePago } from "./service";

export type ReservaWidget = {
  id: string;
  zona: string;
  unidad: string;
  inicio: Date;
  fin: Date;
  estado: string;
  pagada: boolean;
  /** Enlace para pagar si hay cobro pendiente. */
  enlacePago: string | null;
  enlace: string;
};

export type ResumenReservasResidente = { proximas: ReservaWidget[]; pendientesPago: number; enlace: string };

/** Residente: próximas reservas de sus unidades (máx. 3) y cuántas esperan pago. */
export async function resumenResidente(ctx: Ctx): Promise<ResumenReservasResidente> {
  const rs = await ctx.db.reserva.findMany({
    where: { OR: [{ unidadId: { in: ctx.unidadIds } }, { usuarioId: ctx.userId }], estado: { in: ["SOLICITADA", "APROBADA"] }, fin: { gt: new Date() } },
    include: { zona: { select: { nombre: true } }, unidad: { select: { codigo: true } } },
    orderBy: { inicio: "asc" },
    take: 3,
  });
  const proximas: ReservaWidget[] = [];
  let pendientesPago = 0;
  for (const r of rs) {
    let pago: string | null = null;
    if (!r.pagada && r.cuotaId) {
      const cuotas = (await cuotasDeReserva(ctx.db, r)).filter((c) => c.estado === "PENDIENTE" || c.estado === "PARCIAL");
      if (cuotas.length) {
        pendientesPago++;
        pago = enlacePago(cuotas.map((c) => c.id), r.unidadId, r.id);
      }
    }
    proximas.push({ id: r.id, zona: r.zona.nombre, unidad: r.unidad.codigo, inicio: r.inicio, fin: r.fin, estado: r.estado, pagada: r.pagada, enlacePago: pago, enlace: `/reservas/detalle/${r.id}` });
  }
  return { proximas, pendientesPago, enlace: "/reservas" };
}

export type ResumenReservasAdmin = {
  hoy: ReservaWidget[];
  pendientesAprobacion: number;
  ingresosMes: { base: number; iva: number; total: number; reservas: number };
  enlace: string;
};

/** Administración: reservas del día, pendientes de aprobación e ingresos por alquiler del mes. */
export async function resumenAdmin(ctx: Ctx): Promise<ResumenReservasAdmin> {
  const hoyStr = fechaLocal(new Date());
  const [hoy, pendientesAprobacion, reporte] = await Promise.all([
    ctx.db.reserva.findMany({
      where: { estado: { in: ["APROBADA", "SOLICITADA", "CUMPLIDA"] }, inicio: { lt: fechaHoraBogota(sumarDias(hoyStr, 1)) }, fin: { gt: fechaHoraBogota(hoyStr) } },
      include: { zona: { select: { nombre: true } }, unidad: { select: { codigo: true } } },
      orderBy: { inicio: "asc" },
      take: 10,
    }),
    ctx.db.reserva.count({ where: { estado: "SOLICITADA", aprobadaPorId: null, zona: { requiereAprobacion: true }, inicio: { gt: new Date() } } }),
    reporteIngresosAlquiler(ctx, hoyStr.slice(0, 7)),
  ]);
  const { base, iva } = reporte.totales;
  const pagadas = reporte.filas.filter((f) => f.tipo === "ALQUILER");
  return {
    hoy: hoy.map((r) => ({ id: r.id, zona: r.zona.nombre, unidad: r.unidad.codigo, inicio: r.inicio, fin: r.fin, estado: r.estado, pagada: r.pagada, enlacePago: null, enlace: `/reservas/detalle/${r.id}` })),
    pendientesAprobacion,
    ingresosMes: { base, iva, total: base + iva, reservas: pagadas.length },
    enlace: "/reservas/admin",
  };
}
