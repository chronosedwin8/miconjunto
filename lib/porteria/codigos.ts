import { toZonedTime } from "date-fns-tz";
import { TZ } from "@/lib/format";

/**
 * Códigos de autorización de ingreso (6 dígitos) y tokens QR. Funciones puras (sin BD):
 * se usan en el servidor, en el escáner de portería y en las pruebas.
 */

/** Código corto de 6 dígitos (no empieza por 0 para que no se pierda al dictarlo). */
export function generarCodigo(random: () => number = Math.random): string {
  return String(100000 + Math.floor(random() * 900000));
}

export function esCodigoValido(v: string | null | undefined): boolean {
  return !!v && /^\d{6}$/.test(v.trim());
}

/** Token aleatorio para el QR (URL-safe, 32 caracteres). */
export function generarQrToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Texto que codifica el QR: la URL pública con el pase (el visitante no instala nada). */
export function urlAccesoVisitante(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/$/, "")}/acceso-visitante/${token}`;
}

/** Interpreta lo que leyó el escáner o lo que escribió el portero: token del QR o código de 6 dígitos. */
export function interpretarLectura(texto: string): { token?: string; codigo?: string } | null {
  const t = texto.trim();
  if (!t) return null;
  if (esCodigoValido(t)) return { codigo: t };
  const m = t.match(/acceso-visitante\/([A-Za-z0-9_-]{16,64})/);
  if (m) return { token: m[1] };
  if (/^[A-Za-z0-9_-]{24,64}$/.test(t)) return { token: t };
  const cod = t.match(/(?:^|\D)(\d{6})(?:\D|$)/);
  if (cod) return { codigo: cod[1] };
  return null;
}

export type AutorizacionEvaluable = {
  estado: "ACTIVA" | "USADA" | "VENCIDA" | "REVOCADA";
  fechaInicio: Date;
  fechaFin: Date;
  recurrente: boolean;
  diasSemana: number[];
  horaInicio: string | null;
  horaFin: string | null;
  usosPermitidos: number;
  usos: number;
};

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function minutosDelDia(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** ¿La hora (en Bogotá) está dentro de la franja desde–hasta? Admite franjas nocturnas (22:00–06:00). */
export function enFranja(fecha: Date, desde: string | null | undefined, hasta: string | null | undefined) {
  if (!desde || !hasta) return true;
  const z = toZonedTime(fecha, TZ);
  const m = z.getHours() * 60 + z.getMinutes();
  const a = minutosDelDia(desde);
  const b = minutosDelDia(hasta);
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}

export function diaSemanaBogota(fecha: Date) {
  return toZonedTime(fecha, TZ).getDay();
}

/**
 * Valida si una autorización permite el ingreso ahora: estado, vigencia, días/horas (recurrentes) y usos.
 * `usosPermitidos = 0` significa ilimitado (autorizaciones recurrentes).
 */
export function evaluarAutorizacion(a: AutorizacionEvaluable, ahora = new Date()): { ok: true } | { ok: false; motivo: string } {
  if (a.estado === "REVOCADA") return { ok: false, motivo: "El residente revocó esta autorización." };
  if (a.estado === "USADA") return { ok: false, motivo: "La autorización ya se usó todas las veces permitidas." };
  if (a.estado === "VENCIDA") return { ok: false, motivo: "La autorización está vencida." };
  if (ahora < a.fechaInicio) return { ok: false, motivo: "La autorización todavía no está vigente." };
  if (ahora > a.fechaFin) return { ok: false, motivo: "La autorización está vencida." };
  if (a.usosPermitidos > 0 && a.usos >= a.usosPermitidos) return { ok: false, motivo: "La autorización ya se usó todas las veces permitidas." };
  if (a.recurrente && a.diasSemana.length && !a.diasSemana.includes(diaSemanaBogota(ahora))) {
    return { ok: false, motivo: `Hoy (${DIAS[diaSemanaBogota(ahora)]}) no es un día autorizado.` };
  }
  if ((a.horaInicio || a.horaFin) && !enFranja(ahora, a.horaInicio ?? "00:00", a.horaFin ?? "23:59")) {
    return { ok: false, motivo: `Fuera del horario autorizado (${a.horaInicio ?? "00:00"}–${a.horaFin ?? "23:59"}).` };
  }
  return { ok: true };
}

/** Después de un ingreso: ¿la autorización queda agotada? */
export function agotadaTrasUso(a: Pick<AutorizacionEvaluable, "usosPermitidos" | "usos">) {
  return a.usosPermitidos > 0 && a.usos + 1 >= a.usosPermitidos;
}

export function textoDias(dias: number[]) {
  if (!dias.length || dias.length === 7) return "Todos los días";
  const d = [...dias].sort();
  if (d.join() === "1,2,3,4,5") return "Lunes a viernes";
  if (d.join() === "1,2,3,4,5,6") return "Lunes a sábado";
  return d.map((x) => DIAS[x].slice(0, 3)).join(", ");
}
