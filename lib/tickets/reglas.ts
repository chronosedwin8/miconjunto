/**
 * Reglas puras de la mesa de ayuda: tipos, SLA y máquina de estados de los tickets.
 * Sin BD: se prueban en tests/unit/tickets.test.ts.
 */
import type { EstadoTicket, PrioridadTicket, TipoTicket } from "@prisma/client";
import { sumarDiasHabiles } from "./dias-habiles";

export const TIPOS_TICKET = [
  "PETICION",
  "QUEJA",
  "RECLAMO",
  "SUGERENCIA",
  "FELICITACION",
  "DANO_ZONA_COMUN",
  "DANO_UNIDAD",
  "SEGURIDAD",
  "RUIDO",
  "MASCOTAS",
  "OTRO",
] as const satisfies readonly TipoTicket[];

export const PRIORIDADES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const satisfies readonly PrioridadTicket[];

export const ESTADOS_TICKET = [
  "ABIERTO",
  "EN_REVISION",
  "ASIGNADO",
  "EN_PROCESO",
  "EN_ESPERA_RESIDENTE",
  "RESUELTO",
  "CERRADO",
  "REABIERTO",
] as const satisfies readonly EstadoTicket[];

/** Tipos PQRS (término legal de 15 días hábiles). */
export const TIPOS_PQRS: readonly TipoTicket[] = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA", "FELICITACION"];
/** Tipos cuyo SLA depende de la prioridad (daños y seguridad). */
export const TIPOS_POR_PRIORIDAD: readonly TipoTicket[] = ["DANO_ZONA_COMUN", "DANO_UNIDAD", "SEGURIDAD"];
/** Tipos que permiten el formulario público para no residentes. */
export const TIPOS_PUBLICOS = ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA", "FELICITACION"] as const;

export const DIAS_PQRS = 15;
export const DIAS_POR_PRIORIDAD: Record<PrioridadTicket, number> = { URGENTE: 1, ALTA: 3, MEDIA: 7, BAJA: 15 };

export const TIPO_INFO: Record<TipoTicket, { titulo: string; descripcion: string; grupo: "daño" | "pqrs" | "convivencia" }> = {
  DANO_ZONA_COMUN: { titulo: "Daño en zona común", descripcion: "Ascensor, luces, piscina, puertas…", grupo: "daño" },
  DANO_UNIDAD: { titulo: "Daño en mi unidad", descripcion: "Filtración, humedad, tubería común…", grupo: "daño" },
  SEGURIDAD: { titulo: "Seguridad", descripcion: "Accesos, cámaras, situaciones de riesgo", grupo: "daño" },
  PETICION: { titulo: "Petición", descripcion: "Solicitar información o un trámite", grupo: "pqrs" },
  QUEJA: { titulo: "Queja", descripcion: "Inconformidad con un servicio o persona", grupo: "pqrs" },
  RECLAMO: { titulo: "Reclamo", descripcion: "Cobro, decisión o servicio incorrecto", grupo: "pqrs" },
  SUGERENCIA: { titulo: "Sugerencia", descripcion: "Una idea para mejorar el conjunto", grupo: "pqrs" },
  FELICITACION: { titulo: "Felicitación", descripcion: "Reconocer un buen servicio", grupo: "pqrs" },
  RUIDO: { titulo: "Ruido", descripcion: "Ruido excesivo o en horas de descanso", grupo: "convivencia" },
  MASCOTAS: { titulo: "Mascotas", descripcion: "Excrementos, traílla, ruido de mascotas", grupo: "convivencia" },
  OTRO: { titulo: "Otro", descripcion: "Algo distinto a lo anterior", grupo: "convivencia" },
};

export function esDano(tipo: TipoTicket) {
  return tipo === "DANO_ZONA_COMUN" || tipo === "DANO_UNIDAD";
}

/** Prioridad inicial sugerida según el tipo. */
export function prioridadSugerida(tipo: TipoTicket): PrioridadTicket {
  if (tipo === "SEGURIDAD") return "ALTA";
  if (TIPOS_PQRS.includes(tipo)) return "MEDIA";
  return "MEDIA";
}

/**
 * Días hábiles de SLA. PQRS (petición, queja, reclamo, sugerencia, felicitación): 15 días hábiles.
 * Daños y seguridad: según prioridad (urgente 1, alta 3, media 7, baja 15). Ruido, mascotas y otros
 * se tratan como quejas de convivencia (15 días hábiles).
 */
export function diasSla(tipo: TipoTicket, prioridad: PrioridadTicket): number {
  if (TIPOS_POR_PRIORIDAD.includes(tipo)) return DIAS_POR_PRIORIDAD[prioridad];
  return DIAS_PQRS;
}

/** Fecha límite de respuesta (fin del último día hábil, hora de Bogotá). */
export function fechaLimiteSla(tipo: TipoTicket, prioridad: PrioridadTicket, desde: Date = new Date()): Date {
  return sumarDiasHabiles(desde, diasSla(tipo, prioridad));
}

export type EstadoSla = "CUMPLIDO" | "INCUMPLIDO" | "VENCIDO" | "POR_VENCER" | "A_TIEMPO";

/** Estado del SLA: vencido si sigue abierto después de la fecha límite; por vencer si faltan < 24 h. */
export function estadoSla(t: { fechaLimite: Date; estado: EstadoTicket; resueltoEn?: Date | null }, ahora: Date = new Date()): EstadoSla {
  if (t.estado === "RESUELTO" || t.estado === "CERRADO") {
    const fin = t.resueltoEn ?? ahora;
    return fin.getTime() <= t.fechaLimite.getTime() ? "CUMPLIDO" : "INCUMPLIDO";
  }
  const restante = t.fechaLimite.getTime() - ahora.getTime();
  if (restante < 0) return "VENCIDO";
  if (restante < 24 * 3_600_000) return "POR_VENCER";
  return "A_TIEMPO";
}

/** Estados en los que el ticket sigue "abierto" (cuenta para SLA y tableros). */
export const ESTADOS_ABIERTOS: readonly EstadoTicket[] = ["ABIERTO", "EN_REVISION", "ASIGNADO", "EN_PROCESO", "EN_ESPERA_RESIDENTE", "REABIERTO"];

/** Transiciones válidas de la mesa de ayuda. */
export const TRANSICIONES: Record<EstadoTicket, readonly EstadoTicket[]> = {
  ABIERTO: ["EN_REVISION", "ASIGNADO", "EN_PROCESO", "EN_ESPERA_RESIDENTE", "RESUELTO", "CERRADO"],
  EN_REVISION: ["ASIGNADO", "EN_PROCESO", "EN_ESPERA_RESIDENTE", "RESUELTO", "CERRADO"],
  ASIGNADO: ["EN_REVISION", "EN_PROCESO", "EN_ESPERA_RESIDENTE", "RESUELTO"],
  EN_PROCESO: ["ASIGNADO", "EN_ESPERA_RESIDENTE", "RESUELTO"],
  EN_ESPERA_RESIDENTE: ["EN_REVISION", "EN_PROCESO", "RESUELTO", "CERRADO"],
  RESUELTO: ["CERRADO", "REABIERTO"],
  CERRADO: ["REABIERTO"],
  REABIERTO: ["EN_REVISION", "ASIGNADO", "EN_PROCESO", "EN_ESPERA_RESIDENTE", "RESUELTO"],
};

export function puedeTransicionar(de: EstadoTicket, a: EstadoTicket) {
  return TRANSICIONES[de].includes(a);
}

/** Días calendario durante los cuales el residente puede reabrir un ticket cerrado. */
export const DIAS_REAPERTURA = 30;
/** Días sin respuesta del residente tras los cuales un ticket resuelto se cierra solo. */
export const DIAS_CIERRE_AUTOMATICO = 7;

export function puedeReabrir(t: { estado: EstadoTicket; cerradoEn?: Date | null }, ahora: Date = new Date()) {
  if (t.estado === "RESUELTO") return true;
  if (t.estado !== "CERRADO") return false;
  if (!t.cerradoEn) return true;
  return ahora.getTime() - t.cerradoEn.getTime() <= DIAS_REAPERTURA * 86_400_000;
}

export function puedeCalificar(t: { estado: EstadoTicket; calificacion?: number | null }) {
  return (t.estado === "RESUELTO" || t.estado === "CERRADO") && (t.calificacion === null || t.calificacion === undefined);
}

/** Columnas del tablero Kanban (los reabiertos se muestran en "Nuevos"). */
export const COLUMNAS_KANBAN: { id: EstadoTicket; titulo: string; estados: EstadoTicket[] }[] = [
  { id: "ABIERTO", titulo: "Nuevos", estados: ["ABIERTO", "REABIERTO"] },
  { id: "EN_REVISION", titulo: "En revisión", estados: ["EN_REVISION"] },
  { id: "ASIGNADO", titulo: "Asignados", estados: ["ASIGNADO"] },
  { id: "EN_PROCESO", titulo: "En proceso", estados: ["EN_PROCESO"] },
  { id: "EN_ESPERA_RESIDENTE", titulo: "Esperando al residente", estados: ["EN_ESPERA_RESIDENTE"] },
  { id: "RESUELTO", titulo: "Resueltos", estados: ["RESUELTO"] },
  { id: "CERRADO", titulo: "Cerrados", estados: ["CERRADO"] },
];

/** Radicado "2026-0001". */
export function formatoRadicado(anio: number, consecutivo: number) {
  return `${anio}-${String(consecutivo).padStart(4, "0")}`;
}
