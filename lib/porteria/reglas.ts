import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/format";
import { diaSemanaBogota, enFranja, textoDias } from "./codigos";

/** Reglas puras de portería: horarios de frecuentes, tarifas de parqueadero, permanencia e inmutabilidad. */

export type HorarioPermitido = { dias?: number[]; desde?: string; hasta?: string } | null | undefined;

export function parseHorario(raw: unknown): HorarioPermitido {
  if (!raw || typeof raw !== "object") return null;
  const h = raw as Record<string, unknown>;
  return {
    dias: Array.isArray(h.dias) ? h.dias.map(Number).filter((n) => n >= 0 && n <= 6) : undefined,
    desde: typeof h.desde === "string" ? h.desde : undefined,
    hasta: typeof h.hasta === "string" ? h.hasta : undefined,
  };
}

export function textoHorario(h: HorarioPermitido) {
  if (!h) return "Sin restricción de horario";
  const dias = h.dias?.length ? textoDias(h.dias) : "Todos los días";
  return h.desde && h.hasta ? `${dias} · ${h.desde}–${h.hasta}` : dias;
}

/** Valida el horario permitido de un frecuente (empleado, cuidador…) y el estado del vínculo. */
export function evaluarFrecuente(
  v: { estado: string; horarioPermitido: unknown; fechaFin?: Date | null },
  ahora = new Date(),
): { permitido: boolean; alertas: string[] } {
  const alertas: string[] = [];
  if (v.estado !== "ACTIVO") alertas.push("El vínculo con la unidad no está activo.");
  if (v.fechaFin && v.fechaFin < ahora) alertas.push("La autorización del vínculo ya terminó.");
  const h = parseHorario(v.horarioPermitido);
  if (h) {
    if (h.dias?.length && !h.dias.includes(diaSemanaBogota(ahora))) alertas.push(`Hoy no es un día permitido (${textoHorario(h)}).`);
    else if (h.desde && h.hasta && !enFranja(ahora, h.desde, h.hasta)) alertas.push(`Fuera del horario permitido (${h.desde}–${h.hasta}).`);
  }
  return { permitido: alertas.length === 0, alertas };
}

/** Minutos de gracia en parqueadero de visitantes antes de cobrar. */
export const MINUTOS_GRACIA_PARQUEADERO = 15;

/**
 * Tarifa de parqueadero de visitantes: horas completas (fracción = hora) a `tarifaHora`, topado por día a `tarifaDia`.
 * Sin tarifas → 0. Dentro de los minutos de gracia → 0.
 */
export function calcularTarifaParqueadero(
  tarifas: { tarifaHora?: number | null; tarifaDia?: number | null },
  entrada: Date,
  salida: Date,
  minutosGracia = MINUTOS_GRACIA_PARQUEADERO,
) {
  const minutos = Math.max(0, Math.ceil((salida.getTime() - entrada.getTime()) / 60000));
  const horas = Math.max(1, Math.ceil(minutos / 60));
  const th = Number(tarifas.tarifaHora ?? 0) || 0;
  const td = Number(tarifas.tarifaDia ?? 0) || 0;
  if (minutos <= minutosGracia || (th <= 0 && td <= 0)) return { minutos, horas: minutos <= minutosGracia ? 0 : horas, valor: 0 };
  let valor: number;
  if (th > 0 && td > 0) {
    const dias = Math.floor(horas / 24);
    const resto = horas % 24;
    valor = dias * td + Math.min(resto * th, td);
  } else if (th > 0) valor = horas * th;
  else valor = Math.ceil(horas / 24) * td;
  return { minutos, horas, valor: Math.round(valor) };
}

export function permanenciaMinutos(ingreso: Date, hasta = new Date()) {
  return Math.max(0, Math.round((hasta.getTime() - ingreso.getTime()) / 60000));
}

export function textoPermanencia(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

/**
 * Inmutabilidad de la bitácora: solo se anula con un registro ANULACION que referencia al original.
 * No se puede anular una anulación ni anular dos veces.
 */
export function validarAnulacion(original: { tipo: string } | null, yaAnulado: boolean): { ok: true } | { ok: false; motivo: string } {
  if (!original) return { ok: false, motivo: "El registro no existe." };
  if (original.tipo === "ANULACION") return { ok: false, motivo: "Una anulación no se puede anular." };
  if (yaAnulado) return { ok: false, motivo: "Este registro ya fue anulado." };
  return { ok: true };
}

/** Campos que jamás se modifican en RegistroAcceso (se usa en pruebas y como documentación). */
export const REGISTRO_INMUTABLE = true as const;

/** Suma días hábiles (lunes a viernes, sin festivos) — fecha límite aproximada de tickets. */
export function sumarDiasHabiles(desde: Date, dias: number) {
  const d = new Date(desde);
  let n = 0;
  while (n < dias) {
    d.setDate(d.getDate() + 1);
    const w = toZonedTime(d, TZ).getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return d;
}

/** Días completos transcurridos desde la llegada de un paquete. */
export function diasEnPorteria(llegada: Date, ahora = new Date()) {
  return Math.floor((ahora.getTime() - llegada.getTime()) / 86_400_000);
}

/** Tipos de vínculo que aparecen en la lista de frecuentes de una unidad. */
export const TIPOS_FRECUENTES = ["EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE", "FAMILIAR", "AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"] as const;

/** Tipos de vínculo que pueden recoger paquetes de la unidad. */
export const TIPOS_RECOGEN_PAQUETES = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "AUTORIZADO_RECOGER_PAQUETES"] as const;

/** Edad mínima para recibir un paquete a nombre de la unidad. */
export const EDAD_MINIMA_RECOGER = 14;
