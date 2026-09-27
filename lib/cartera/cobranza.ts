import type { CanalCobro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { parseConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";

/**
 * Cobranza respetuosa — Ley 2300 de 2023 ("Ley Dejen de Fregar").
 * - Contacto solo de lunes a viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00 (hora de Bogotá).
 * - Nunca domingos ni festivos.
 * - Máximo `cobranza.maxContactosSemanaCanal` contactos por semana calendario (lunes a domingo) por canal y unidad.
 * El sistema bloquea las gestiones y envíos fuera de estas reglas y registra cada gestión (GestionCobro).
 */

/** Festivos de Colombia 2025–2027 (Ley 51 de 1983 — "Ley Emiliani"), en formato YYYY-MM-DD. */
export const FESTIVOS_CO: Record<number, string[]> = {
  2025: ["2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30", "2025-07-20", "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17", "2025-12-08", "2025-12-25"],
  2026: ["2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"],
  2027: ["2027-01-01", "2027-01-11", "2027-03-22", "2027-03-25", "2027-03-26", "2027-05-01", "2027-05-10", "2027-05-31", "2027-06-07", "2027-07-05", "2027-07-20", "2027-08-07", "2027-08-16", "2027-10-18", "2027-11-01", "2027-11-15", "2027-12-08", "2027-12-25"],
};

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function domingoPascua(y: number) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

/** Calcula los festivos de cualquier año (fijos, trasladables al lunes y dependientes de la Pascua). */
export function calcularFestivos(y: number): string[] {
  const fmt = (d: Date) => ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  const lunes = (d: Date) => {
    const dow = d.getUTCDay();
    const add = dow === 1 ? 0 : (8 - dow) % 7;
    return new Date(d.getTime() + add * 86_400_000);
  };
  const f = (m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
  const pascua = domingoPascua(y);
  const p = (dias: number) => new Date(pascua.getTime() + dias * 86_400_000);
  const set = new Set<string>([
    fmt(f(1, 1)),
    fmt(lunes(f(1, 6))),
    fmt(lunes(f(3, 19))),
    fmt(p(-3)),
    fmt(p(-2)),
    fmt(f(5, 1)),
    fmt(lunes(p(39))),
    fmt(lunes(p(60))),
    fmt(lunes(p(68))),
    fmt(lunes(f(6, 29))),
    fmt(f(7, 20)),
    fmt(f(8, 7)),
    fmt(lunes(f(8, 15))),
    fmt(lunes(f(10, 12))),
    fmt(lunes(f(11, 1))),
    fmt(lunes(f(11, 11))),
    fmt(f(12, 8)),
    fmt(f(12, 25)),
  ]);
  return [...set].sort();
}

/** Componentes de la fecha/hora en Bogotá (UTC−5 fijo, Colombia no tiene horario de verano). */
export function partesBogota(fecha: Date) {
  const z = new Date(fecha.getTime() - 5 * 3_600_000);
  return { y: z.getUTCFullYear(), m: z.getUTCMonth() + 1, d: z.getUTCDate(), dow: z.getUTCDay(), minutos: z.getUTCHours() * 60 + z.getUTCMinutes(), ymd: ymd(z.getUTCFullYear(), z.getUTCMonth() + 1, z.getUTCDate()) };
}

export function esFestivo(fecha: Date) {
  const p = partesBogota(fecha);
  const lista = FESTIVOS_CO[p.y] ?? calcularFestivos(p.y);
  return lista.includes(p.ymd);
}

export type ResultadoHorario = { ok: boolean; motivo?: string };

/** Regla pura de horario de la Ley 2300: L–V 7:00–19:00, sábados 8:00–15:00, nunca domingos ni festivos. */
export function horarioCobranzaPermitido(fecha: Date): ResultadoHorario {
  const p = partesBogota(fecha);
  if (esFestivo(fecha)) return { ok: false, motivo: "Hoy es festivo: la Ley 2300 de 2023 no permite gestiones de cobranza." };
  if (p.dow === 0) return { ok: false, motivo: "Los domingos no se permiten gestiones de cobranza (Ley 2300 de 2023)." };
  if (p.dow === 6) {
    if (p.minutos < 8 * 60 || p.minutos > 15 * 60) return { ok: false, motivo: "Los sábados solo se puede contactar entre las 8:00 a. m. y las 3:00 p. m. (Ley 2300 de 2023)." };
    return { ok: true };
  }
  if (p.minutos < 7 * 60 || p.minutos > 19 * 60) return { ok: false, motivo: "De lunes a viernes solo se puede contactar entre las 7:00 a. m. y las 7:00 p. m. (Ley 2300 de 2023)." };
  return { ok: true };
}

/** ¿El día (en Bogotá) admite contactos de cobranza? (no domingo ni festivo). */
export function diaHabilCobranza(fecha: Date) {
  return partesBogota(fecha).dow !== 0 && !esFestivo(fecha);
}

/** Próximo momento permitido para contactar a partir de `fecha` (útil para mensajes al usuario). */
export function siguienteHorarioPermitido(fecha: Date): Date {
  let t = new Date(Math.ceil(fecha.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 60 * 24 * 10; i += 15) {
    if (horarioCobranzaPermitido(t).ok) return t;
    t = new Date(t.getTime() + 15 * 60_000);
  }
  return t;
}

/** Inicio (lunes 00:00 Bogotá) y fin de la semana calendario que contiene `fecha`. */
export function semanaCalendario(fecha: Date) {
  const p = partesBogota(fecha);
  const offset = (p.dow + 6) % 7; // lunes = 0
  const inicio = new Date(`${p.ymd}T00:00:00-05:00`);
  const desde = new Date(inicio.getTime() - offset * 86_400_000);
  return { desde, hasta: new Date(desde.getTime() + 7 * 86_400_000) };
}

/**
 * Días (YYYY-MM-DD, Bogotá) que "cubre" un envío automático hecho hoy: desde el día siguiente al último día hábil
 * de cobranza anterior hasta hoy. Así, si un recordatorio caía en domingo o festivo, se envía el siguiente día hábil.
 * Si hoy no es hábil, devuelve [] (no se contacta).
 */
export function diasCubiertos(hoy: Date): string[] {
  if (!diaHabilCobranza(hoy)) return [];
  const out = [partesBogota(hoy).ymd];
  let d = new Date(hoy.getTime() - 86_400_000);
  for (let i = 0; i < 10 && !diaHabilCobranza(d); i++) {
    out.unshift(partesBogota(d).ymd);
    d = new Date(d.getTime() - 86_400_000);
  }
  return out;
}

export type ResultadoContacto = { ok: boolean; motivo?: string; contactosSemana: number; maximo: number; siguiente?: Date };

/**
 * ¿Se puede contactar a la unidad por este canal en esta fecha? Aplica horario legal y frecuencia semanal por canal.
 * No crea registros: usa `registrarGestion` para dejar constancia.
 */
export async function puedeContactar(unidadId: string, canal: CanalCobro, fecha: Date = new Date()): Promise<ResultadoContacto> {
  const unidad = await prisma.unidad.findFirst({ where: { id: unidadId, deletedAt: null }, select: { conjuntoId: true, conjunto: { select: { config: true } } } });
  if (!unidad) notFound("La unidad");
  const maximo = parseConfig(unidad.conjunto.config).cobranza.maxContactosSemanaCanal;
  const semana = semanaCalendario(fecha);
  const contactosSemana = await prisma.gestionCobro.count({
    where: { conjuntoId: unidad.conjuntoId, unidadId, canal, deletedAt: null, fecha: { gte: semana.desde, lt: semana.hasta } },
  });
  const h = horarioCobranzaPermitido(fecha);
  if (!h.ok) return { ok: false, motivo: h.motivo, contactosSemana, maximo, siguiente: siguienteHorarioPermitido(fecha) };
  if (contactosSemana >= maximo) {
    return {
      ok: false,
      motivo: `Esta unidad ya fue contactada ${contactosSemana === 1 ? "una vez" : `${contactosSemana} veces`} esta semana por ${canalTexto(canal)}. La Ley 2300 permite máximo ${maximo} por semana y canal.`,
      contactosSemana,
      maximo,
      siguiente: siguienteHorarioPermitido(semana.hasta),
    };
  }
  return { ok: true, contactosSemana, maximo };
}

export function canalTexto(c: CanalCobro | string) {
  return { LLAMADA: "llamada", CORREO: "correo", VISITA: "visita", WHATSAPP: "WhatsApp", CARTA: "carta", SMS: "SMS" }[c] ?? String(c).toLowerCase();
}

export type GestionInput = { unidadId: string; canal: CanalCobro; resultado?: string | null; notas?: string | null };

/** Registra una gestión de cobro validando la Ley 2300 (bloquea si está fuera de horario o excede la frecuencia). */
export async function registrarGestion(ctx: Pick<Ctx, "db" | "conjuntoId" | "userId" | "nombre">, input: GestionInput, fecha = new Date()) {
  const u = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } });
  if (!u) notFound("La unidad");
  const r = await puedeContactar(input.unidadId, input.canal, fecha);
  if (!r.ok) throw new AppError(r.motivo ?? "No se puede contactar a la unidad en este momento.", 409);
  const g = await ctx.db.gestionCobro.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: input.unidadId,
      canal: input.canal,
      fecha,
      resultado: input.resultado ?? null,
      notas: input.notas ?? null,
      usuarioId: ctx.userId === "sistema" || ctx.userId.startsWith("api:") ? null : ctx.userId,
    },
  });
  await audit(ctx as Ctx, "gestion_cobro", "GestionCobro", g.id, undefined, g);
  return g;
}

/** Intenta registrar la gestión; si la ley no lo permite devuelve el motivo sin lanzar (para envíos automáticos). */
export async function intentarGestion(ctx: Pick<Ctx, "db" | "conjuntoId" | "userId" | "nombre">, input: GestionInput, fecha = new Date()) {
  const r = await puedeContactar(input.unidadId, input.canal, fecha);
  if (!r.ok) return { ok: false as const, motivo: r.motivo };
  const g = await registrarGestion(ctx, input, fecha);
  return { ok: true as const, gestion: g };
}
