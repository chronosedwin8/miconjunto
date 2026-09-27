import { descuentoProntoPago, round } from "@/lib/cartera/calculos";

/**
 * Cálculos puros del módulo de pagos (probados en tests/unit/pagos.test.ts).
 */

/** Monto mínimo de un pago en línea (las pasarelas colombianas rechazan montos muy bajos). */
export const PAGO_MINIMO = 1500;

export type CuotaPagable = {
  id: string;
  descripcion: string;
  tipo: string;
  saldo: number;
  valorBase: number;
  valorTotal: number;
  fechaVencimiento: Date;
  fechaProntoPago: Date | null;
  porcentajeProntoPago: number;
};

/**
 * Descuento de pronto pago que obtendría una cuota si se paga completa hoy. Replica la regla de
 * `aplicarPago`: solo administración, sin descuento previo (saldo = valor total) y hasta la fecha límite.
 */
export function descuentoVigente(c: CuotaPagable, hoy = new Date()) {
  if (c.tipo !== "ADMINISTRACION" || round(c.saldo) !== round(c.valorTotal)) return 0;
  return descuentoProntoPago({ valorBase: c.valorBase, porcentajeProntoPago: c.porcentajeProntoPago, fechaProntoPago: c.fechaProntoPago }, hoy);
}

/** Valor a pagar hoy por una cuota (saldo menos el descuento de pronto pago vigente). */
export function valorHoy(c: CuotaPagable, hoy = new Date()) {
  return round(c.saldo - descuentoVigente(c, hoy));
}

export type ModoPago = "CUOTAS" | "TOTAL" | "ABONO";

export type CalculoPago = {
  modo: ModoPago;
  valor: number;
  descuento: number;
  cuotaIds: string[];
  totalSinDescuento: number;
};

export class ErrorCalculoPago extends Error {}

/**
 * Valor a pagar según la elección del residente:
 * - `cuotaIds`: las cuotas elegidas (con su descuento de pronto pago).
 * - `valor` (abono): un valor libre menor o igual al saldo, si el conjunto permite abonos.
 * - nada: el saldo total.
 */
export function calcularValorPago(
  cuotas: CuotaPagable[],
  opts: { cuotaIds?: string[] | null; valor?: number | null; permitirAbonos: boolean; hoy?: Date },
): CalculoPago {
  const hoy = opts.hoy ?? new Date();
  const pendientes = cuotas.filter((c) => c.saldo > 0);
  const totalHoy = round(pendientes.reduce((a, c) => a + valorHoy(c, hoy), 0));
  const totalSaldo = round(pendientes.reduce((a, c) => a + c.saldo, 0));
  if (totalSaldo <= 0) throw new ErrorCalculoPago("No tienes saldo pendiente por pagar.");

  if (opts.valor !== undefined && opts.valor !== null && opts.valor > 0) {
    const v = round(opts.valor);
    if (v >= totalHoy) {
      return { modo: "TOTAL", valor: totalHoy, descuento: round(totalSaldo - totalHoy), cuotaIds: pendientes.map((c) => c.id), totalSinDescuento: totalSaldo };
    }
    if (!opts.permitirAbonos) throw new ErrorCalculoPago("Este conjunto no permite abonos parciales: elige cuotas completas.");
    if (v < PAGO_MINIMO) throw new ErrorCalculoPago(`El valor mínimo de un pago en línea es $ ${PAGO_MINIMO.toLocaleString("es-CO")}.`);
    return { modo: "ABONO", valor: v, descuento: 0, cuotaIds: [], totalSinDescuento: v };
  }

  const ids = [...new Set((opts.cuotaIds ?? []).filter(Boolean))];
  if (ids.length) {
    const elegidas = ids.map((id) => pendientes.find((c) => c.id === id));
    if (elegidas.some((c) => !c)) throw new ErrorCalculoPago("Alguna de las cuotas elegidas ya fue pagada o no pertenece a esta unidad.");
    const sel = elegidas as CuotaPagable[];
    const valor = round(sel.reduce((a, c) => a + valorHoy(c, hoy), 0));
    const sinDesc = round(sel.reduce((a, c) => a + c.saldo, 0));
    const todas = sel.length === pendientes.length;
    if (valor < PAGO_MINIMO && !todas)
      throw new ErrorCalculoPago(`El valor mínimo de un pago en línea es $ ${PAGO_MINIMO.toLocaleString("es-CO")}. Agrega otra cuota.`);
    return { modo: todas ? "TOTAL" : "CUOTAS", valor, descuento: round(sinDesc - valor), cuotaIds: sel.map((c) => c.id), totalSinDescuento: sinDesc };
  }

  return { modo: "TOTAL", valor: totalHoy, descuento: round(totalSaldo - totalHoy), cuotaIds: pendientes.map((c) => c.id), totalSinDescuento: totalSaldo };
}

/** Pesos → centavos (Wompi trabaja en centavos). */
export const aCentavos = (pesos: number) => Math.round(pesos) * 100;
export const deCentavos = (centavos: number) => Math.round(centavos / 100);
