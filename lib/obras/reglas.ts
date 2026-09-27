/**
 * Reglas puras de obras y mudanzas: franjas horarias sin cruces, horario permitido y contratistas.
 */
import { esFestivo } from "@/lib/tickets/dias-habiles";

export const ESTADOS_SOLICITUD = ["SOLICITADA", "APROBADA", "EN_CURSO", "FINALIZADA", "RECHAZADA", "CANCELADA"] as const;

export type Franja = { horaInicio: string; horaFin: string };

/** Horario permitido para mudanzas (decisión: lunes a sábado no festivos, 07:00–18:00). */
export const HORARIO_MUDANZAS = { desde: "07:00", hasta: "18:00" };

export function minutos(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm || 0);
}

export function franjaValida(f: Franja) {
  return /^\d{2}:\d{2}$/.test(f.horaInicio) && /^\d{2}:\d{2}$/.test(f.horaFin) && minutos(f.horaInicio) < minutos(f.horaFin);
}

/** ¿Se cruzan dos franjas del mismo día? (los extremos que se tocan no cruzan: 8–10 y 10–12 es válido). */
export function franjasSeCruzan(a: Franja, b: Franja) {
  return minutos(a.horaInicio) < minutos(b.horaFin) && minutos(b.horaInicio) < minutos(a.horaFin);
}

/** Valida día y franja de una mudanza. Devuelve el motivo si no es válida. */
export function validarFranjaMudanza(fecha: Date, f: Franja): string | null {
  if (!franjaValida(f)) return "La hora de inicio debe ser anterior a la hora de fin.";
  const domingo = new Date(fecha.getTime() - 5 * 3_600_000).getUTCDay() === 0;
  if (domingo || esFestivo(fecha)) return "Las mudanzas no se programan en domingos ni festivos.";
  if (minutos(f.horaInicio) < minutos(HORARIO_MUDANZAS.desde) || minutos(f.horaFin) > minutos(HORARIO_MUDANZAS.hasta)) {
    return `El horario permitido para mudanzas es de ${HORARIO_MUDANZAS.desde} a ${HORARIO_MUDANZAS.hasta}.`;
  }
  return null;
}

export type Contratista = { nombre: string; documento: string; seguridadSocialUrl?: string | null; vence?: string | null };

/** Problemas de los contratistas frente a la fecha de fin de la obra (soporte faltante o vencido). */
export function problemasContratistas(lista: Contratista[], fechaFin: Date): string[] {
  const out: string[] = [];
  for (const c of lista) {
    if (!c.seguridadSocialUrl) out.push(`${c.nombre}: falta el soporte de seguridad social.`);
    if (!c.vence) out.push(`${c.nombre}: indica la fecha de vencimiento de la seguridad social.`);
    else if (new Date(`${c.vence}T23:59:59-05:00`).getTime() < fechaFin.getTime()) out.push(`${c.nombre}: la seguridad social vence antes de terminar la obra.`);
  }
  return out;
}

/** Enseres: "2 x Nevera" o "Nevera" por línea → [{ descripcion, cantidad }]. */
export function parseEnseres(texto: string): { descripcion: string; cantidad: number }[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\d+)\s*(?:x|×|-)?\s+(.+)$/i);
      return m ? { cantidad: Number(m[1]), descripcion: m[2].trim() } : { cantidad: 1, descripcion: l };
    })
    .slice(0, 200);
}
