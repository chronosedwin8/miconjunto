/**
 * Cálculos financieros puros (sin BD) — probados en tests/unit/cartera.test.ts.
 * Valores en pesos (COP); se redondea al peso.
 */

export const round = (n: number) => Math.round(n);

/** Cuota de administración de una unidad: por coeficiente (presupuesto × coef %) o valor fijo. */
export function cuotaAdministracion(opts: { modo: "COEFICIENTE" | "VALOR_FIJO"; presupuestoMensual: number; coeficiente: number; valorFijo: number }) {
  if (opts.modo === "COEFICIENTE" && opts.presupuestoMensual > 0) return Math.round((opts.presupuestoMensual * opts.coeficiente) / 100 / 100) * 100;
  return round(opts.valorFijo);
}

/** Distribuye un valor total por coeficiente (cuotas extraordinarias) cuadrando el redondeo en la última unidad. */
export function distribuirPorCoeficiente(total: number, unidades: { id: string; coeficiente: number }[]) {
  const sumaCoef = unidades.reduce((a, u) => a + u.coeficiente, 0) || 1;
  const out = unidades.map((u) => ({ id: u.id, valor: round((total * u.coeficiente) / sumaCoef) }));
  const diff = round(total - out.reduce((a, o) => a + o.valor, 0));
  if (out.length) out[out.length - 1].valor += diff;
  return out;
}

export function distribuirIgual(total: number, ids: string[]) {
  const base = Math.floor(total / ids.length);
  const out = ids.map((id) => ({ id, valor: base }));
  if (out.length) out[out.length - 1].valor += round(total - base * ids.length);
  return out;
}

/** Divide un valor en N cuotas iguales (la última absorbe el redondeo). */
export function fraccionar(total: number, n: number) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? round(total - base * (n - 1)) : base));
}

/**
 * Descuento por pronto pago: aplica si el pago cubre la cuota y ocurre hasta la fecha límite.
 * Solo sobre el valor base (no sobre intereses ni otros conceptos).
 */
export function descuentoProntoPago(c: { valorBase: number; porcentajeProntoPago: number; fechaProntoPago: Date | null; yaTieneDescuento?: boolean }, fechaPago: Date) {
  if (!c.fechaProntoPago || c.porcentajeProntoPago <= 0 || c.yaTieneDescuento) return 0;
  if (fechaPago.getTime() > c.fechaProntoPago.getTime()) return 0;
  return round((c.valorBase * c.porcentajeProntoPago) / 100);
}

/**
 * Interés de mora simple sobre el capital vencido (sin capitalizar intereses — prohibido el anatocismo).
 * tasaMensualPct: tasa mensual en % (p. ej. 1.833). Base de 30 días por mes.
 */
export function interesMora(capital: number, tasaMensualPct: number, dias: number) {
  if (capital <= 0 || dias <= 0 || tasaMensualPct <= 0) return 0;
  return round((capital * (tasaMensualPct / 100) * dias) / 30);
}

/** Tasa mensual equivalente a una efectiva anual. */
export function tasaMensualDesdeEA(eaPct: number) {
  return (Math.pow(1 + eaPct / 100, 1 / 12) - 1) * 100;
}

/** Tasa de usura / máxima de mora: 1,5 × interés bancario corriente (E.A.). */
export function tasaMaximaMora(ibcEA: number) {
  return ibcEA * 1.5;
}

export type CuotaAplicable = {
  id: string;
  saldo: number;
  tipoConcepto: string;
  fechaVencimiento: Date;
  periodo: string;
};

export type OrdenAplicacion = "INTERES_MORA" | "MULTA" | "ANTIGUAS" | "ACTUALES";

/**
 * Orden de aplicación de pagos (Ley 675 art. 30 y práctica contable): por defecto intereses → cuotas
 * más antiguas (vencidas) → actuales. Configurable por conjunto.
 */
export function ordenarParaAplicacion<T extends CuotaAplicable>(cuotas: T[], orden: OrdenAplicacion[], hoy = new Date()): T[] {
  const rank = (c: T) => {
    const vencida = c.fechaVencimiento.getTime() < hoy.getTime();
    const grupos: Record<OrdenAplicacion, boolean> = {
      INTERES_MORA: c.tipoConcepto === "INTERES_MORA",
      MULTA: c.tipoConcepto === "MULTA",
      ANTIGUAS: vencida,
      ACTUALES: !vencida,
    };
    const idx = orden.findIndex((o) => grupos[o]);
    return idx === -1 ? orden.length : idx;
  };
  return [...cuotas].sort((a, b) => rank(a) - rank(b) || a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime() || a.periodo.localeCompare(b.periodo));
}

/** Reparte un valor entre cuotas ya ordenadas. Devuelve aplicaciones y el excedente (saldo a favor). */
export function distribuirPago(valor: number, cuotasOrdenadas: { id: string; saldo: number }[]) {
  let restante = round(valor);
  const aplicaciones: { cuotaId: string; valor: number }[] = [];
  for (const c of cuotasOrdenadas) {
    if (restante <= 0) break;
    const aplicar = Math.min(restante, round(c.saldo));
    if (aplicar > 0) {
      aplicaciones.push({ cuotaId: c.id, valor: aplicar });
      restante -= aplicar;
    }
  }
  return { aplicaciones, excedente: restante };
}

/** Edad de la mora en días → rango (30/60/90/+120). */
export function rangoMora(diasVencida: number): "AL_DIA" | "1_30" | "31_60" | "61_90" | "91_120" | "MAS_120" {
  if (diasVencida <= 0) return "AL_DIA";
  if (diasVencida <= 30) return "1_30";
  if (diasVencida <= 60) return "31_60";
  if (diasVencida <= 90) return "61_90";
  if (diasVencida <= 120) return "91_120";
  return "MAS_120";
}

export const RANGOS_MORA = ["AL_DIA", "1_30", "31_60", "61_90", "91_120", "MAS_120"] as const;
export const RANGO_LABEL: Record<(typeof RANGOS_MORA)[number], string> = {
  AL_DIA: "Por vencer",
  "1_30": "1–30 días",
  "31_60": "31–60 días",
  "61_90": "61–90 días",
  "91_120": "91–120 días",
  MAS_120: "Más de 120 días",
};

/** IVA sobre una base (tarifa en %). */
export function calcularIva(base: number, tarifaPct: number) {
  return round((base * tarifaPct) / 100);
}

/** Separa un valor con IVA incluido en base + IVA. */
export function desglosarIva(totalConIva: number, tarifaPct: number) {
  const base = round(totalConIva / (1 + tarifaPct / 100));
  return { base, iva: round(totalConIva - base) };
}
