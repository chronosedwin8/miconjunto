/**
 * Planes comerciales de MiConjunto (pago anual, en pesos colombianos).
 *
 * - Conjunto único: un conjunto residencial, todo incluido, $5.000.000 al año.
 * - Multiconjunto: $4.000.000 al año por cada conjunto registrado (desde 2 conjuntos).
 *   Con más de 3 conjuntos se aplica un 10 % de descuento sobre el total facturado.
 *
 * Es un módulo puro (sin BD) que usan la página de precios, el cotizador, el PDF y las pruebas.
 */
export const PRECIO_UNICO = 5_000_000;
export const PRECIO_MULTI_POR_CONJUNTO = 4_000_000;
/** El descuento aplica cuando la cantidad de conjuntos es MAYOR a este umbral. */
export const UMBRAL_DESCUENTO = 3;
export const DESCUENTO_MULTI = 0.1;
export const MAX_CONJUNTOS_COTIZADOR = 200;

export type PlanComercial = "UNICO" | "MULTI";

export type Cotizacion = {
  plan: PlanComercial;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  descuentoPct: number;
  descuento: number;
  total: number;
  /** Cuánto se ahorra frente a contratar cada conjunto con el plan único. */
  ahorroVsUnico: number;
  /** Conjuntos que faltan para obtener el descuento (0 si ya aplica). */
  faltanParaDescuento: number;
};

export function cotizar(cantidad: number): Cotizacion {
  const n = Math.max(1, Math.min(MAX_CONJUNTOS_COTIZADOR, Math.floor(Number.isFinite(cantidad) ? cantidad : 1)));
  const plan: PlanComercial = n === 1 ? "UNICO" : "MULTI";
  const precioUnitario = plan === "UNICO" ? PRECIO_UNICO : PRECIO_MULTI_POR_CONJUNTO;
  const subtotal = precioUnitario * n;
  const descuentoPct = plan === "MULTI" && n > UMBRAL_DESCUENTO ? DESCUENTO_MULTI : 0;
  const descuento = Math.round(subtotal * descuentoPct);
  const total = subtotal - descuento;
  return {
    plan,
    cantidad: n,
    precioUnitario,
    subtotal,
    descuentoPct,
    descuento,
    total,
    ahorroVsUnico: PRECIO_UNICO * n - total,
    faltanParaDescuento: n > UMBRAL_DESCUENTO ? 0 : UMBRAL_DESCUENTO + 1 - n,
  };
}

export const PLAN_LABEL: Record<PlanComercial, string> = { UNICO: "Conjunto único", MULTI: "Multiconjunto" };

/** Formato de pesos sin decimales: $ 5.000.000 */
export function cop(v: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
}
