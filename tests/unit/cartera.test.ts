import { describe, expect, it } from "vitest";
import {
  cuotaAdministracion,
  descuentoProntoPago,
  distribuirPago,
  distribuirPorCoeficiente,
  fraccionar,
  interesMora,
  ordenarParaAplicacion,
  rangoMora,
  tasaMensualDesdeEA,
  calcularIva,
  desglosarIva,
} from "@/lib/cartera/calculos";
import { validarCoeficientes } from "@/lib/conjunto/service";

const d = (s: string) => new Date(`${s}T12:00:00-05:00`);

describe("cuotas por coeficiente", () => {
  it("calcula presupuesto × coeficiente redondeado a la centena", () => {
    expect(cuotaAdministracion({ modo: "COEFICIENTE", presupuestoMensual: 48_000_000, coeficiente: 0.812345, valorFijo: 0 })).toBe(389900);
    expect(cuotaAdministracion({ modo: "VALOR_FIJO", presupuestoMensual: 48_000_000, coeficiente: 1, valorFijo: 350000 })).toBe(350000);
  });

  it("la distribución por coeficiente cuadra exactamente con el total", () => {
    const us = [
      { id: "a", coeficiente: 33.333333 },
      { id: "b", coeficiente: 33.333333 },
      { id: "c", coeficiente: 33.333334 },
    ];
    const r = distribuirPorCoeficiente(10_000_001, us);
    expect(r.reduce((a, x) => a + x.valor, 0)).toBe(10_000_001);
  });

  it("fracciona una extraordinaria en cuotas que suman el total", () => {
    const f = fraccionar(1_000_000, 3);
    expect(f).toEqual([333333, 333333, 333334]);
  });

  it("valida que los coeficientes sumen 100 %", () => {
    expect(validarCoeficientes([50, 25.5, 24.5]).ok).toBe(true);
    const r = validarCoeficientes([50, 25, 24]);
    expect(r.ok).toBe(false);
    expect(r.diferencia).toBe(1);
  });
});

describe("intereses de mora", () => {
  it("interés simple sobre capital (sin anatocismo), base 30 días", () => {
    expect(interesMora(1_000_000, 2, 30)).toBe(20000);
    expect(interesMora(1_000_000, 2, 15)).toBe(10000);
    expect(interesMora(0, 2, 30)).toBe(0);
    expect(interesMora(1_000_000, 2, 0)).toBe(0);
  });
  it("convierte E.A. a mensual", () => {
    expect(tasaMensualDesdeEA(24.36)).toBeCloseTo(1.833, 2);
  });
  it("clasifica la edad de la mora", () => {
    expect(rangoMora(0)).toBe("AL_DIA");
    expect(rangoMora(12)).toBe("1_30");
    expect(rangoMora(45)).toBe("31_60");
    expect(rangoMora(75)).toBe("61_90");
    expect(rangoMora(100)).toBe("91_120");
    expect(rangoMora(200)).toBe("MAS_120");
  });
});

describe("descuento por pronto pago", () => {
  const cuota = { valorBase: 400000, porcentajeProntoPago: 5, fechaProntoPago: d("2026-09-05") };
  it("aplica hasta la fecha límite", () => {
    expect(descuentoProntoPago(cuota, d("2026-09-05"))).toBe(20000);
    expect(descuentoProntoPago(cuota, d("2026-09-01"))).toBe(20000);
  });
  it("no aplica después de la fecha límite ni dos veces", () => {
    expect(descuentoProntoPago(cuota, d("2026-09-06"))).toBe(0);
    expect(descuentoProntoPago({ ...cuota, yaTieneDescuento: true }, d("2026-09-01"))).toBe(0);
  });
});

describe("aplicación de pagos", () => {
  const hoy = d("2026-09-20");
  const cuotas = [
    { id: "actual", saldo: 400000, tipoConcepto: "ADMINISTRACION", fechaVencimiento: d("2026-09-30"), periodo: "2026-09" },
    { id: "julio", saldo: 400000, tipoConcepto: "ADMINISTRACION", fechaVencimiento: d("2026-07-10"), periodo: "2026-07" },
    { id: "interes", saldo: 15000, tipoConcepto: "INTERES_MORA", fechaVencimiento: d("2026-09-01"), periodo: "2026-08" },
    { id: "agosto", saldo: 400000, tipoConcepto: "ADMINISTRACION", fechaVencimiento: d("2026-08-10"), periodo: "2026-08" },
  ];
  it("orden por defecto: intereses → más antiguas → actuales", () => {
    const o = ordenarParaAplicacion(cuotas, ["INTERES_MORA", "ANTIGUAS", "ACTUALES"], hoy).map((c) => c.id);
    expect(o).toEqual(["interes", "julio", "agosto", "actual"]);
  });
  it("reparte el pago y deja el excedente como saldo a favor", () => {
    const o = ordenarParaAplicacion(cuotas, ["INTERES_MORA", "ANTIGUAS", "ACTUALES"], hoy);
    const r = distribuirPago(500000, o);
    expect(r.aplicaciones).toEqual([
      { cuotaId: "interes", valor: 15000 },
      { cuotaId: "julio", valor: 400000 },
      { cuotaId: "agosto", valor: 85000 },
    ]);
    expect(r.excedente).toBe(0);
    const r2 = distribuirPago(1_300_000, o);
    expect(r2.excedente).toBe(1_300_000 - 1_215_000);
  });
});

describe("IVA", () => {
  it("calcula y desglosa IVA del 19 %", () => {
    expect(calcularIva(250000, 19)).toBe(47500);
    expect(desglosarIva(297500, 19)).toEqual({ base: 250000, iva: 47500 });
  });
});
