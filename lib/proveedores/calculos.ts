import { addDias, diasHasta } from "@/lib/mantenimiento/calculos";

export type EstadoContratoCalc = "VIGENTE" | "POR_VENCER" | "VENCIDO" | "TERMINADO";

/**
 * Estado de un contrato por fechas. `TERMINADO` es manual (terminación anticipada) y se respeta.
 * VENCIDO: la fecha fin ya pasó. POR_VENCER: faltan `diasAlerta` días o menos. Si aún no inicia, VIGENTE.
 */
export function estadoContrato(c: { fin: Date; diasAlerta: number; estado?: string | null }, hoy: Date): EstadoContratoCalc {
  if (c.estado === "TERMINADO") return "TERMINADO";
  const d = diasHasta(c.fin, hoy);
  if (d < 0) return "VENCIDO";
  if (d <= c.diasAlerta) return "POR_VENCER";
  return "VIGENTE";
}

/**
 * Renovación automática: el contrato vencido con renovación automática se prorroga por un periodo
 * igual al original, empezando el día siguiente al fin. Se repite hasta cubrir `hoy`.
 */
export function renovarContrato(c: { inicio: Date; fin: Date }, hoy: Date) {
  const duracion = Math.max(1, Math.round((c.fin.getTime() - c.inicio.getTime()) / 86_400_000));
  let inicio = c.inicio;
  let fin = c.fin;
  let veces = 0;
  while (diasHasta(fin, hoy) < 0 && veces < 50) {
    inicio = addDias(fin, 1);
    fin = addDias(inicio, duracion);
    veces++;
  }
  return { inicio, fin, veces };
}

/** Promedio de calificaciones (1 a 5) con dos decimales. */
export function promedioCalificacion(puntajes: number[]) {
  const v = puntajes.filter((p) => p >= 1 && p <= 5);
  if (!v.length) return 0;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

/** Validación ligera de NIT colombiano con dígito de verificación (DIAN, módulo 11). */
export function digitoVerificacionNit(nit: string) {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const digits = nit.replace(/\D/g, "").split("").reverse();
  let suma = 0;
  digits.forEach((d, i) => (suma += Number(d) * (pesos[i] ?? 0)));
  const r = suma % 11;
  return r > 1 ? 11 - r : r;
}

/** Normaliza "900.123.456-7" → { nit: "900123456", dv: "7" }. */
export function partirNit(valor: string) {
  const limpio = valor.replace(/[^\d-]/g, "");
  const [n, dv] = limpio.split("-");
  return { nit: n ?? "", dv: dv ?? String(digitoVerificacionNit(n ?? "")) };
}
