/**
 * Reglas puras del plan de mantenimiento (sin BD): próxima fecha, generación de órdenes,
 * vencimientos, cumplimiento y MTBF. Se prueban en tests/unit/mantenimiento.test.ts.
 */

const DIA = 86_400_000;

export const ESTADOS_ORDEN_ABIERTA = ["PENDIENTE", "PROGRAMADA", "EN_PROCESO"] as const;

export function addDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * DIA);
}

/** Colombia no tiene horario de verano: America/Bogota = UTC−5 fijo. */
const OFFSET_BOGOTA = 5 * 3_600_000;
/** Número de día calendario en Bogotá. */
export function diaBogota(d: Date) {
  return Math.floor((d.getTime() - OFFSET_BOGOTA) / DIA);
}

/** Días calendario (Bogotá) entre `hoy` y `fecha` (negativo si ya pasó). Se compara por día, no por hora. */
export function diasHasta(fecha: Date, hoy: Date) {
  return diaBogota(fecha) - diaBogota(hoy);
}

/** Próxima fecha de un plan después de ejecutarlo: fecha de ejecución real + frecuencia (mínimo 1 día). */
export function proximaFechaPlan(ejecucion: Date, frecuenciaDias: number) {
  const f = Math.max(1, Math.round(frecuenciaDias));
  return addDias(ejecucion, f);
}

/** Fecha a partir de la cual el job crea la orden: próxima fecha − días de anticipación. */
export function fechaGeneracion(plan: { proximaFecha: Date; diasAnticipacion: number }) {
  return addDias(plan.proximaFecha, -Math.max(0, plan.diasAnticipacion));
}

/** ¿El job debe generar una orden para este plan hoy? */
export function debeGenerarOrden(
  plan: { proximaFecha: Date; diasAnticipacion: number; activoPlan: boolean },
  hoy: Date,
  tieneOrdenAbierta: boolean,
) {
  if (!plan.activoPlan || tieneOrdenAbierta) return false;
  return diasHasta(fechaGeneracion(plan), hoy) <= 0;
}

export type Semaforo = "VENCIDO" | "POR_VENCER" | "VIGENTE";

/** Semáforo de un vencimiento: vencido (ya pasó), por vencer (dentro de la ventana de alerta) o vigente. */
export function semaforoVencimiento(fecha: Date | null | undefined, hoy: Date, diasAlerta = 30): Semaforo | null {
  if (!fecha) return null;
  const d = diasHasta(fecha, hoy);
  if (d < 0) return "VENCIDO";
  if (d <= diasAlerta) return "POR_VENCER";
  return "VIGENTE";
}

/**
 * Umbrales en los que se notifica un vencimiento (para no enviar el mismo aviso todos los días):
 * el primer día de la ventana de alerta, 15, 7, 3, 1 y 0 días antes, y el día siguiente al vencimiento.
 */
export function tocaAvisar(fecha: Date, hoy: Date, diasAlerta = 30) {
  const d = diasHasta(fecha, hoy);
  const umbrales = new Set([diasAlerta, 15, 7, 3, 1, 0, -1]);
  return umbrales.has(d) && d <= diasAlerta;
}

/** Orden atrasada: sigue abierta y su fecha programada ya pasó. */
export function ordenAtrasada(o: { estado: string; fechaProgramada: Date }, hoy: Date) {
  return (ESTADOS_ORDEN_ABIERTA as readonly string[]).includes(o.estado) && diasHasta(o.fechaProgramada, hoy) < 0;
}

/**
 * Cumplimiento del plan: de las órdenes programadas en el periodo (origen PLAN, sin canceladas),
 * cuántas se completaron y cuántas a tiempo (cierre ≤ fecha programada + tolerancia).
 */
export function cumplimiento(
  ordenes: { estado: string; fechaProgramada: Date; fechaCierre: Date | null }[],
  toleranciaDias = 3,
) {
  const validas = ordenes.filter((o) => o.estado !== "CANCELADA");
  const completadas = validas.filter((o) => o.estado === "COMPLETADA");
  const aTiempo = completadas.filter((o) => o.fechaCierre && diasHasta(o.fechaCierre, o.fechaProgramada) <= toleranciaDias);
  const total = validas.length;
  return {
    total,
    completadas: completadas.length,
    aTiempo: aTiempo.length,
    pctCumplimiento: total ? Math.round((completadas.length / total) * 1000) / 10 : 0,
    pctATiempo: total ? Math.round((aTiempo.length / total) * 1000) / 10 : 0,
  };
}

/**
 * MTBF aproximado (tiempo medio entre fallas, en días): promedio de los intervalos entre fallas
 * consecutivas (órdenes correctivas o tickets de daño). Con una sola falla se usa el periodo observado.
 */
export function mtbfDias(fallas: Date[], periodo?: { desde: Date; hasta: Date }) {
  const f = [...fallas].sort((a, b) => a.getTime() - b.getTime());
  if (f.length === 0) return null;
  if (f.length === 1) {
    if (!periodo) return null;
    return Math.round(((periodo.hasta.getTime() - periodo.desde.getTime()) / DIA) * 10) / 10;
  }
  let suma = 0;
  for (let i = 1; i < f.length; i++) suma += f[i].getTime() - f[i - 1].getTime();
  return Math.round((suma / (f.length - 1) / DIA) * 10) / 10;
}

export type ChecklistItem = { item: string; ok: boolean };

/** Normaliza el JSON de checklist de una orden. */
export function parseChecklist(v: unknown): ChecklistItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? { item: x, ok: false } : x && typeof x === "object" ? { item: String((x as ChecklistItem).item ?? ""), ok: !!(x as ChecklistItem).ok } : null))
    .filter((x): x is ChecklistItem => !!x && !!x.item);
}

/** Checklist inicial de una orden a partir de las líneas del plan. */
export function checklistDesdePlan(items: string[]): ChecklistItem[] {
  return items.map((i) => i.trim()).filter(Boolean).map((item) => ({ item, ok: false }));
}

/** Líneas de texto (una por renglón) a lista limpia. */
export function lineas(texto: string | null | undefined) {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

/** Evidencias: la URL guarda el momento como fragmento (#antes / #despues). */
export type MomentoEvidencia = "antes" | "despues" | "otra";
export function momentoEvidencia(url: string): MomentoEvidencia {
  if (url.endsWith("#antes")) return "antes";
  if (url.endsWith("#despues")) return "despues";
  return "otra";
}
export function conMomento(url: string, momento: MomentoEvidencia) {
  const base = url.replace(/#(antes|despues)$/, "");
  return momento === "otra" ? base : `${base}#${momento}`;
}
