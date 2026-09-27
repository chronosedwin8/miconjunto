/**
 * Debido proceso de las multas (Ley 675 de 2001, art. 59): propuesta → notificación con plazo de
 * descargos → descargos del residente → decisión del consejo (ratifica o revoca con resolución).
 * La multa solo se carga a cartera cuando queda RATIFICADA. Funciones puras (tests/unit/convivencia.test.ts).
 */
import type { EstadoLlamado, EstadoMulta } from "@prisma/client";
import { sumarDiasHabiles } from "@/lib/tickets/dias-habiles";

export const ESTADOS_MULTA = ["PROPUESTA", "NOTIFICADA", "EN_DESCARGOS", "RATIFICADA", "REVOCADA", "PAGADA"] as const satisfies readonly EstadoMulta[];

/** Días hábiles por defecto para presentar descargos. */
export const DIAS_DESCARGOS = 5;

export const TRANSICIONES_MULTA: Record<EstadoMulta, readonly EstadoMulta[]> = {
  PROPUESTA: ["NOTIFICADA", "REVOCADA"],
  NOTIFICADA: ["EN_DESCARGOS", "RATIFICADA", "REVOCADA"],
  EN_DESCARGOS: ["RATIFICADA", "REVOCADA"],
  RATIFICADA: ["PAGADA"],
  REVOCADA: [],
  PAGADA: [],
};

export function puedeTransicionarMulta(de: EstadoMulta, a: EstadoMulta) {
  return TRANSICIONES_MULTA[de].includes(a);
}

type MultaPlazo = { estado: EstadoMulta; plazoDescargos: Date | null };

export function plazoDescargos(notificadaEn: Date, dias = DIAS_DESCARGOS) {
  return sumarDiasHabiles(notificadaEn, dias);
}

export function plazoVencido(m: MultaPlazo, ahora: Date = new Date()) {
  return !!m.plazoDescargos && ahora.getTime() > m.plazoDescargos.getTime();
}

/** El residente puede presentar descargos mientras la multa esté notificada y el plazo no haya vencido. */
export function puedePresentarDescargos(m: MultaPlazo, ahora: Date = new Date()): { ok: boolean; motivo?: string } {
  if (m.estado === "EN_DESCARGOS") return { ok: false, motivo: "Ya presentaste tus descargos; el consejo los está revisando." };
  if (m.estado !== "NOTIFICADA") return { ok: false, motivo: "Esta multa no está en etapa de descargos." };
  if (plazoVencido(m, ahora)) return { ok: false, motivo: "El plazo para presentar descargos ya venció." };
  return { ok: true };
}

/**
 * El consejo decide cuando hay descargos, o cuando el plazo venció sin ellos (el residente tuvo la
 * oportunidad de defenderse). Nunca antes de notificar ni durante el plazo sin descargos.
 */
export function puedeDecidir(m: MultaPlazo, ahora: Date = new Date()): { ok: boolean; motivo?: string } {
  if (m.estado === "EN_DESCARGOS") return { ok: true };
  if (m.estado === "PROPUESTA") return { ok: false, motivo: "Primero notifica la multa al residente para que pueda presentar descargos." };
  if (m.estado === "NOTIFICADA") {
    return plazoVencido(m, ahora) ? { ok: true } : { ok: false, motivo: "El residente aún está dentro del plazo para presentar descargos." };
  }
  return { ok: false, motivo: "La multa ya fue decidida." };
}

/** Solo una multa ratificada genera cargo en cartera. */
export function generaCargo(estado: EstadoMulta) {
  return estado === "RATIFICADA";
}

/** Pasos del debido proceso para la línea de tiempo. */
export function pasosDebidoProceso(m: { estado: EstadoMulta; createdAt: Date; notificadaEn: Date | null; plazoDescargos: Date | null; descargosEn: Date | null; resolucionEn: Date | null }) {
  const decidida = m.estado === "RATIFICADA" || m.estado === "REVOCADA" || m.estado === "PAGADA";
  return [
    { id: "PROPUESTA", titulo: "Propuesta", fecha: m.createdAt, hecho: true },
    { id: "NOTIFICADA", titulo: "Notificada al residente", fecha: m.notificadaEn, hecho: !!m.notificadaEn },
    { id: "DESCARGOS", titulo: m.descargosEn ? "Descargos presentados" : "Plazo de descargos", fecha: m.descargosEn ?? m.plazoDescargos, hecho: !!m.descargosEn || (decidida && !!m.notificadaEn) },
    { id: "DECISION", titulo: m.estado === "REVOCADA" ? "Revocada por el consejo" : "Decisión del consejo", fecha: m.resolucionEn, hecho: decidida },
    ...(m.estado === "REVOCADA" ? [] : [{ id: "PAGO", titulo: "Pagada", fecha: null, hecho: m.estado === "PAGADA" }]),
  ];
}

/** Estados de llamado de atención visibles como "pendientes" para el residente. */
export const LLAMADO_PENDIENTE: readonly EstadoLlamado[] = ["ENVIADO"];
