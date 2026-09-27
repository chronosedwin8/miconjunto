import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { startOfDayBogota } from "@/lib/format";
import { adentroAhora } from "./service";
import { solicitudesPanel, solicitudesResidente } from "./solicitudes";
import { turnoAbierto } from "./turnos";

/** Widgets del Inicio (el coordinador compone /inicio con estas funciones). */

export type ResumenPorteriaResidente = {
  paquetesEnPorteria: number;
  paquetes: { id: string; tipo: string; transportadora: string | null; llegadaEn: Date; unidad: string }[];
  visitantesHoy: { id: string; nombre: string; hora: Date; unidad: string }[];
  autorizacionesActivas: number;
  solicitudesPendientes: number;
};

export async function resumenResidente(ctx: Ctx): Promise<ResumenPorteriaResidente> {
  if (!ctx.unidadIds.length) return { paquetesEnPorteria: 0, paquetes: [], visitantesHoy: [], autorizacionesActivas: 0, solicitudesPendientes: 0 };
  const hoy = startOfDayBogota();
  const [paquetes, visitas, autorizaciones, solicitudes] = await Promise.all([
    ctx.db.paquete.findMany({ where: { unidadId: { in: ctx.unidadIds }, estado: "EN_PORTERIA" }, include: { unidad: { select: { codigo: true } } }, orderBy: { llegadaEn: "desc" }, take: 10 }),
    ctx.db.registroAcceso.findMany({ where: { unidadId: { in: ctx.unidadIds }, tipo: "INGRESO", hora: { gte: hoy }, sujeto: { not: "RESIDENTE" } }, include: { unidad: { select: { codigo: true } } }, orderBy: { hora: "desc" }, take: 10 }),
    ctx.db.autorizacionIngreso.count({ where: { unidadId: { in: ctx.unidadIds }, estado: "ACTIVA", fechaFin: { gte: new Date() } } }),
    solicitudesResidente(ctx),
  ]);
  return {
    paquetesEnPorteria: paquetes.length,
    paquetes: paquetes.map((p) => ({ id: p.id, tipo: p.tipo, transportadora: p.transportadora, llegadaEn: p.llegadaEn, unidad: p.unidad.codigo })),
    visitantesHoy: visitas.map((v) => ({ id: v.id, nombre: v.nombre, hora: v.hora, unidad: v.unidad?.codigo ?? "" })),
    autorizacionesActivas: autorizaciones,
    solicitudesPendientes: solicitudes.length,
  };
}

export type ResumenPorteriaAdmin = {
  novedadesHoy: number;
  novedadesAltas: { id: string; tipo: string; severidad: string; descripcion: string; createdAt: Date }[];
  paquetesVencidos: number;
  maxDiasPaquete: number;
  ingresosHoy: number;
  adentro: number;
  alertasPermanencia: number;
};

export async function resumenAdmin(ctx: Ctx): Promise<ResumenPorteriaAdmin> {
  const cfg = conjuntoConfig(ctx);
  const hoy = startOfDayBogota();
  const [novedadesHoy, altas, vencidos, ingresosHoy, adentro] = await Promise.all([
    ctx.db.novedad.count({ where: { createdAt: { gte: hoy } } }),
    ctx.db.novedad.findMany({ where: { createdAt: { gte: hoy }, severidad: { in: ["ALTA", "CRITICA"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    ctx.db.paquete.count({ where: { estado: "EN_PORTERIA", llegadaEn: { lt: new Date(Date.now() - cfg.porteria.maxDiasPaquete * 86_400_000) } } }),
    ctx.db.registroAcceso.count({ where: { tipo: "INGRESO", hora: { gte: hoy } } }),
    adentroAhora(ctx),
  ]);
  return {
    novedadesHoy,
    novedadesAltas: altas.map((n) => ({ id: n.id, tipo: n.tipo, severidad: n.severidad, descripcion: n.descripcion, createdAt: n.createdAt })),
    paquetesVencidos: vencidos,
    maxDiasPaquete: cfg.porteria.maxDiasPaquete,
    ingresosHoy,
    adentro: adentro.length,
    alertasPermanencia: adentro.filter((a) => a.alerta).length,
  };
}

export type ResumenPortero = {
  turnoAbierto: boolean;
  adentro: number;
  alertasPermanencia: number;
  solicitudesPendientes: number;
  paquetesEnPorteria: number;
  ingresosHoy: number;
  salidasHoy: number;
  alertasActivas: number;
};

export async function resumenPortero(ctx: Ctx): Promise<ResumenPortero> {
  const hoy = startOfDayBogota();
  const [turno, adentro, solicitudes, paquetes, ingresos, salidas, alertas] = await Promise.all([
    turnoAbierto(ctx),
    adentroAhora(ctx),
    solicitudesPanel(ctx),
    ctx.db.paquete.count({ where: { estado: "EN_PORTERIA" } }),
    ctx.db.registroAcceso.count({ where: { tipo: "INGRESO", hora: { gte: hoy } } }),
    ctx.db.registroAcceso.count({ where: { tipo: "SALIDA", hora: { gte: hoy } } }),
    ctx.db.alertaEmergencia.count({ where: { estado: "ACTIVA" } }),
  ]);
  return {
    turnoAbierto: !!turno,
    adentro: adentro.length,
    alertasPermanencia: adentro.filter((a) => a.alerta).length,
    solicitudesPendientes: solicitudes.filter((s) => s.estado === "PENDIENTE").length,
    paquetesEnPorteria: paquetes,
    ingresosHoy: ingresos,
    salidasHoy: salidas,
    alertasActivas: alertas,
  };
}
