import { describe, expect, it } from "vitest";
import { capitalParaMora, excesoTasaMora, interesMora, interesPorTramos, tasaEADesdeMensual, tasaMaximaMora, tasaMensualDesdeEA } from "@/lib/cartera/calculos";
import { ibcDeFuente } from "@/lib/cartera/mora";

const d = (s: string) => new Date(`${s}T00:00:00-05:00`);
const DIA = 86_400_000;

describe("intereses de mora diarios", () => {
  it("coincide con el interés simple cuando la tasa no cambia", () => {
    expect(interesPorTramos(300_000, d("2026-01-10"), d("2026-02-09"), [{ desde: d("2025-12-01"), tasaMensual: 2 }])).toBe(interesMora(300_000, 2, 30));
    expect(interesPorTramos(300_000, d("2026-01-10"), d("2026-01-11"), [{ desde: d("2025-12-01"), tasaMensual: 1.8 }])).toBe(180);
  });

  it("aplica la tasa vigente de cada tramo cuando cambia en el mes", () => {
    const tasas = [
      { desde: d("2026-01-01"), tasaMensual: 1.5 },
      { desde: d("2026-02-01"), tasaMensual: 3 },
    ];
    // 10 días de enero al 1,5 % y 5 días de febrero al 3 %: 300.000 × (0,015×10 + 0,03×5) / 30
    expect(interesPorTramos(300_000, d("2026-01-22"), d("2026-02-06"), tasas)).toBe(3000);
    // En cualquier orden
    expect(interesPorTramos(300_000, d("2026-01-22"), d("2026-02-06"), [...tasas].reverse())).toBe(3000);
  });

  it("usa la tasa por defecto si no hay historial y no causa nada con capital o días en cero", () => {
    expect(interesPorTramos(100_000, d("2026-03-01"), d("2026-03-31"), [], 2)).toBe(2000);
    expect(interesPorTramos(0, d("2026-03-01"), d("2026-03-31"), [], 2)).toBe(0);
    expect(interesPorTramos(100_000, d("2026-03-31"), d("2026-03-01"), [], 2)).toBe(0);
  });

  it("liquidar día a día equivale (± redondeo) a liquidar el periodo completo", () => {
    const tasas = [{ desde: d("2026-01-01"), tasaMensual: 1.9 }];
    const inicio = d("2026-04-01");
    let diario = 0;
    for (let i = 0; i < 30; i++) diario += interesPorTramos(450_000, new Date(inicio.getTime() + i * DIA), new Date(inicio.getTime() + (i + 1) * DIA), tasas);
    const total = interesPorTramos(450_000, inicio, new Date(inicio.getTime() + 30 * DIA), tasas);
    expect(total).toBe(8550);
    expect(Math.abs(diario - total)).toBeLessThanOrEqual(15);
  });

  it("sin anatocismo: el capital excluye las cuotas de interés", () => {
    expect(
      capitalParaMora([
        { saldo: 300_000, tipoConcepto: "ADMINISTRACION" },
        { saldo: 12_000, tipoConcepto: "INTERES_MORA" },
        { saldo: 50_000, tipoConcepto: "EXTRAORDINARIA" },
      ]),
    ).toBe(350_000);
  });
});

describe("tasa de mora y límite legal", () => {
  it("1,5 × IBC y conversión E.A. ↔ mensual", () => {
    expect(tasaMaximaMora(16.52)).toBeCloseTo(24.78, 2);
    const m = tasaMensualDesdeEA(24.78);
    expect(m).toBeCloseTo(1.8615, 3);
    expect(tasaEADesdeMensual(m)).toBeCloseTo(24.78, 6);
  });
  it("detecta tasas por encima del máximo", () => {
    expect(excesoTasaMora(24.78, 16.52)).toBe(0);
    expect(excesoTasaMora(26, 16.52)).toBeCloseTo(1.22, 2);
  });
  it("lee el IBC guardado en la fuente", () => {
    expect(ibcDeFuente("Superintendencia Financiera · IBC 16,52 % E.A.")).toBe(16.52);
    expect(ibcDeFuente("Valor por defecto")).toBeNull();
  });
});
