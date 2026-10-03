import { describe, expect, it } from "vitest";
import { cotizar } from "@/lib/comercial/precios";

describe("cotizar", () => {
  it("un conjunto usa el plan único de $5.000.000 sin descuento", () => {
    expect(cotizar(1)).toMatchObject({ plan: "UNICO", precioUnitario: 5_000_000, total: 5_000_000, descuento: 0, ahorroVsUnico: 0 });
  });
  it("de 2 a 3 conjuntos: $4.000.000 por conjunto, sin descuento", () => {
    expect(cotizar(2)).toMatchObject({ plan: "MULTI", subtotal: 8_000_000, descuento: 0, total: 8_000_000, faltanParaDescuento: 2 });
    expect(cotizar(3)).toMatchObject({ subtotal: 12_000_000, descuento: 0, total: 12_000_000, faltanParaDescuento: 1 });
  });
  it("más de 3 conjuntos: 10 % de descuento sobre el total", () => {
    expect(cotizar(4)).toMatchObject({ subtotal: 16_000_000, descuentoPct: 0.1, descuento: 1_600_000, total: 14_400_000, faltanParaDescuento: 0 });
    expect(cotizar(10)).toMatchObject({ subtotal: 40_000_000, descuento: 4_000_000, total: 36_000_000, ahorroVsUnico: 14_000_000 });
  });
  it("normaliza entradas inválidas", () => {
    expect(cotizar(0).cantidad).toBe(1);
    expect(cotizar(2.7).cantidad).toBe(2);
    expect(cotizar(Number.NaN).cantidad).toBe(1);
    expect(cotizar(10_000).cantidad).toBe(200);
  });
});
