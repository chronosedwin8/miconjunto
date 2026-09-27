/**
 * Días hábiles en Colombia (funciones puras, sin BD).
 *
 * Día hábil = lunes a viernes que no sea festivo nacional. Los festivos siguen la Ley 51 de 1983
 * ("Ley Emiliani"): algunos se trasladan al lunes siguiente, y otros dependen de la Pascua.
 * Todas las fechas se interpretan en la zona horaria de Bogotá (UTC−5, sin horario de verano).
 */

const BOGOTA_OFFSET_MS = 5 * 3_600_000;

export type Festivo = { fecha: string; nombre: string };

/** Domingo de Pascua (algoritmo gregoriano anónimo / Meeus). Devuelve [mes 1-12, día]. */
export function domingoDePascua(anio: number): [number, number] {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return [mes, dia];
}

/** Fecha de calendario (sin hora) representada como Date a medianoche UTC. */
function cal(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(anio, mes - 1, dia));
}

function key(d: Date) {
  return d.toISOString().slice(0, 10);
}

function masDias(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Traslada al lunes siguiente si no cae en lunes (Ley Emiliani). */
function alLunes(d: Date) {
  const dow = d.getUTCDay();
  return masDias(d, (8 - dow) % 7);
}

const cache = new Map<number, Festivo[]>();

/** Festivos nacionales de Colombia para un año, ordenados por fecha (yyyy-MM-dd). */
export function festivosColombia(anio: number): Festivo[] {
  const hit = cache.get(anio);
  if (hit) return hit;
  const [pm, pd] = domingoDePascua(anio);
  const pascua = cal(anio, pm, pd);
  const lista: [Date, string][] = [
    [cal(anio, 1, 1), "Año Nuevo"],
    [alLunes(cal(anio, 1, 6)), "Día de los Reyes Magos"],
    [alLunes(cal(anio, 3, 19)), "Día de San José"],
    [masDias(pascua, -3), "Jueves Santo"],
    [masDias(pascua, -2), "Viernes Santo"],
    [cal(anio, 5, 1), "Día del Trabajo"],
    [masDias(pascua, 43), "Ascensión del Señor"],
    [masDias(pascua, 64), "Corpus Christi"],
    [masDias(pascua, 71), "Sagrado Corazón de Jesús"],
    [alLunes(cal(anio, 6, 29)), "San Pedro y San Pablo"],
    [cal(anio, 7, 20), "Día de la Independencia"],
    [cal(anio, 8, 7), "Batalla de Boyacá"],
    [alLunes(cal(anio, 8, 15)), "La Asunción de la Virgen"],
    [alLunes(cal(anio, 10, 12)), "Día de la Raza"],
    [alLunes(cal(anio, 11, 1)), "Todos los Santos"],
    [alLunes(cal(anio, 11, 11)), "Independencia de Cartagena"],
    [cal(anio, 12, 8), "Inmaculada Concepción"],
    [cal(anio, 12, 25), "Navidad"],
  ];
  const out = lista.map(([d, nombre]) => ({ fecha: key(d), nombre })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  cache.set(anio, out);
  return out;
}

/** Fecha de calendario en Bogotá (medianoche UTC del día local) de un instante. */
export function diaBogota(instante: Date) {
  const local = new Date(instante.getTime() - BOGOTA_OFFSET_MS);
  return cal(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
}

/** ¿Es festivo en Colombia el día (en Bogotá) de este instante? */
export function esFestivo(instante: Date) {
  const d = diaBogota(instante);
  const k = key(d);
  return festivosColombia(d.getUTCFullYear()).some((f) => f.fecha === k);
}

/** Lunes a viernes y no festivo (día en Bogotá). */
export function esDiaHabil(instante: Date) {
  const d = diaBogota(instante);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const k = key(d);
  return !festivosColombia(d.getUTCFullYear()).some((f) => f.fecha === k);
}

/** Último instante (23:59:59.999, hora de Bogotá) del día de calendario dado. */
function finDelDia(dia: Date) {
  return new Date(dia.getTime() + 86_400_000 - 1 + BOGOTA_OFFSET_MS);
}

/**
 * Suma `dias` días hábiles a partir del día siguiente a `desde` (el día de radicación no cuenta,
 * como en los términos legales de PQRS) y devuelve el final de ese día en Bogotá.
 * Con `dias = 0` devuelve el final del mismo día.
 */
export function sumarDiasHabiles(desde: Date, dias: number): Date {
  let d = diaBogota(desde);
  let n = 0;
  while (n < dias) {
    d = masDias(d, 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const k = key(d);
    if (festivosColombia(d.getUTCFullYear()).some((f) => f.fecha === k)) continue;
    n++;
  }
  return finDelDia(d);
}

/** Días hábiles transcurridos después de `desde` hasta `hasta` (incluido). 0 si `hasta` <= `desde`. */
export function diasHabilesEntre(desde: Date, hasta: Date): number {
  let d = diaBogota(desde);
  const fin = diaBogota(hasta);
  let n = 0;
  while (d.getTime() < fin.getTime()) {
    d = masDias(d, 1);
    if (esDiaHabil(new Date(d.getTime() + BOGOTA_OFFSET_MS + 12 * 3_600_000))) n++;
  }
  return n;
}
