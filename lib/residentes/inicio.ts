import type { Ctx } from "@/lib/auth/context";
import { addDays } from "@/lib/format";
import { can } from "@/lib/permisos";
import { estadoPanel } from "./panel";
import { indicadoresPoblacion } from "./service";

/** Widget del residente/propietario en /inicio: avance del panel "Mi hogar" y vencimientos de su unidad. */
export type ResumenResidente = {
  unidadId: string | null;
  porcentajePanel: number;
  pasosPendientes: number;
  politicaPendiente: boolean;
  soatPorVencer: { placa: string; vence: Date }[];
  vacunasPorVencer: { nombre: string; vence: Date }[];
  vinculosPendientes: number;
};

export async function resumenResidente(ctx: Ctx): Promise<ResumenResidente> {
  const unidadId = ctx.unidadIds[0] ?? null;
  if (!unidadId || !can(ctx, "residentes.ver")) {
    return { unidadId, porcentajePanel: 0, pasosPendientes: 0, politicaPendiente: false, soatPorVencer: [], vacunasPorVencer: [], vinculosPendientes: 0 };
  }
  const limite = addDays(new Date(), 30);
  const [panel, vehiculos, mascotas, pendientes] = await Promise.all([
    estadoPanel(ctx, unidadId),
    ctx.db.vehiculo.findMany({ where: { unidadId: { in: ctx.unidadIds }, activo: true, soatVence: { lte: limite } }, select: { placa: true, soatVence: true } }),
    ctx.db.mascota.findMany({ where: { unidadId: { in: ctx.unidadIds }, activo: true, antirrabicaVence: { lte: limite } }, select: { nombre: true, antirrabicaVence: true } }),
    ctx.db.vinculoUnidad.count({ where: { unidadId: { in: ctx.unidadIds }, estado: "PENDIENTE_APROBACION" } }),
  ]);
  return {
    unidadId,
    porcentajePanel: panel.porcentaje,
    pasosPendientes: 9 - panel.completados.length,
    politicaPendiente: !panel.politicaVigente,
    soatPorVencer: vehiculos.map((v) => ({ placa: v.placa, vence: v.soatVence! })),
    vacunasPorVencer: mascotas.map((m) => ({ nombre: m.nombre, vence: m.antirrabicaVence! })),
    vinculosPendientes: pendientes,
  };
}

/** Widget del administrador: aprobaciones pendientes, población y alertas de SOAT/vacunas. */
export type ResumenAdminResidentes = {
  pendientesAprobacion: number;
  totalPersonas: number;
  menores: number;
  adultosMayores: number;
  movilidadReducida: number;
  soatVencidosOPorVencer: number;
  vacunasVencidasOPorVencer: number;
  mascotasPeligrosasSinPoliza: number;
};

export async function resumenAdmin(ctx: Ctx): Promise<ResumenAdminResidentes> {
  const limite = addDays(new Date(), 30);
  const [ind, soat, vacunas, sinPoliza] = await Promise.all([
    indicadoresPoblacion(ctx),
    ctx.db.vehiculo.count({ where: { activo: true, soatVence: { lte: limite } } }),
    ctx.db.mascota.count({ where: { activo: true, antirrabicaVence: { lte: limite } } }),
    ctx.db.mascota.count({ where: { activo: true, potencialmentePeligrosa: true, polizaUrl: null } }),
  ]);
  return {
    pendientesAprobacion: ind.pendientesAprobacion,
    totalPersonas: ind.totalPersonas,
    menores: ind.menores,
    adultosMayores: ind.adultosMayores,
    movilidadReducida: ind.movilidadReducida,
    soatVencidosOPorVencer: soat,
    vacunasVencidasOPorVencer: vacunas,
    mascotasPeligrosasSinPoliza: sinPoliza,
  };
}
