import { addDays, parseLocal, startOfDayBogota } from "@/lib/format";

/** Convierte la opción "cuándo" del formulario del residente en fechaInicio / fechaFin (hora de Bogotá). */
export function vigenciaDesdeFormulario(
  input: { cuando: "HOY" | "MANANA" | "RANGO" | "RECURRENTE"; fechaInicio?: string | null; fechaFin?: string | null; hasta?: string | null },
  ahora = new Date(),
): { fechaInicio: Date; fechaFin: Date } | { error: string; campo: string } {
  const hoy = startOfDayBogota(ahora);
  const finDia = (d: Date) => new Date(addDays(d, 1).getTime() - 60_000);
  switch (input.cuando) {
    case "HOY":
      return { fechaInicio: new Date(ahora.getTime() - 5 * 60_000), fechaFin: finDia(hoy) };
    case "MANANA": {
      const m = addDays(hoy, 1);
      return { fechaInicio: m, fechaFin: finDia(m) };
    }
    case "RANGO": {
      if (!input.fechaInicio) return { error: "Indica desde cuándo", campo: "fechaInicio" };
      if (!input.fechaFin) return { error: "Indica hasta cuándo", campo: "fechaFin" };
      const i = parseLocal(input.fechaInicio);
      const fRaw = parseLocal(input.fechaFin);
      const f = input.fechaFin.length === 10 ? finDia(fRaw) : fRaw;
      if (Number.isNaN(i.getTime()) || Number.isNaN(f.getTime())) return { error: "Fecha no válida", campo: "fechaInicio" };
      if (f <= i) return { error: "Debe ser posterior al inicio", campo: "fechaFin" };
      return { fechaInicio: i, fechaFin: f };
    }
    case "RECURRENTE": {
      if (!input.hasta) return { error: "Indica hasta qué fecha aplica", campo: "hasta" };
      const h = parseLocal(input.hasta);
      if (Number.isNaN(h.getTime()) || h < hoy) return { error: "La fecha final ya pasó", campo: "hasta" };
      return { fechaInicio: hoy, fechaFin: finDia(h) };
    }
  }
}
