import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { es } from "date-fns/locale";

export const TZ = "America/Bogota";

type Num = number | string | { toString(): string } | null | undefined;

export function toNumber(v: Num): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** $ 1.234.567 */
export function cop(v: Num) {
  return copFmt.format(Math.round(toNumber(v))).replace(/ /g, " ");
}

export function num(v: Num, decimals = 2) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: decimals }).format(toNumber(v));
}

export function pct(v: Num, decimals = 1) {
  return `${numFmt.format(Number(toNumber(v).toFixed(decimals)))} %`;
}

/** DD/MM/YYYY en hora de Bogotá */
export function fecha(d: Date | string | null | undefined) {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), TZ, "dd/MM/yyyy");
}

export function fechaHora(d: Date | string | null | undefined) {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), TZ, "dd/MM/yyyy HH:mm");
}

export function hora(d: Date | string | null | undefined) {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), TZ, "HH:mm");
}

export function fechaLarga(d: Date | string | null | undefined) {
  if (!d) return "—";
  return formatInTimeZone(new Date(d), TZ, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
}

export function mesNombre(periodo: string) {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 15));
  return formatInTimeZone(d, TZ, "MMMM yyyy", { locale: es });
}

/** yyyy-MM-dd de una fecha en Bogotá (para inputs date). */
export function isoDate(d: Date | string | null | undefined) {
  if (!d) return "";
  return formatInTimeZone(new Date(d), TZ, "yyyy-MM-dd");
}

/** yyyy-MM-ddTHH:mm en Bogotá (para inputs datetime-local). */
export function isoDateTimeLocal(d: Date | string | null | undefined) {
  if (!d) return "";
  return formatInTimeZone(new Date(d), TZ, "yyyy-MM-dd'T'HH:mm");
}

/** Convierte "yyyy-MM-dd" o "yyyy-MM-ddTHH:mm" interpretado en Bogotá a Date UTC. */
export function parseLocal(value: string): Date {
  const v = value.length === 10 ? `${value}T00:00` : value;
  return fromZonedTime(v, TZ);
}

/** Fecha/hora "ahora" en Bogotá como objeto con componentes. */
export function nowBogota(base = new Date()) {
  const z = toZonedTime(base, TZ);
  return { year: z.getFullYear(), month: z.getMonth() + 1, day: z.getDate(), hour: z.getHours(), minute: z.getMinutes(), weekday: z.getDay(), date: z };
}

export function periodoActual(base = new Date()) {
  const n = nowBogota(base);
  return `${n.year}-${String(n.month).padStart(2, "0")}`;
}

/** Inicio del día en Bogotá como Date UTC. */
export function startOfDayBogota(base = new Date()) {
  return parseLocal(formatInTimeZone(base, TZ, "yyyy-MM-dd"));
}

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

export function diffDays(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export function edad(fechaNacimiento: Date | null | undefined, ref = new Date()) {
  if (!fechaNacimiento) return null;
  const f = new Date(fechaNacimiento);
  let e = ref.getFullYear() - f.getFullYear();
  const m = ref.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < f.getDate())) e--;
  return e;
}

export function tiempoRelativo(d: Date | string) {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.round(h / 24);
  if (dd < 30) return `hace ${dd} d`;
  return fecha(d);
}

export function nombreCompleto(p: { nombres?: string | null; apellidos?: string | null } | null | undefined) {
  if (!p) return "";
  return `${p.nombres ?? ""} ${p.apellidos ?? ""}`.trim();
}

export function labelEnum(v: string | null | undefined) {
  if (!v) return "—";
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
