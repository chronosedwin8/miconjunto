import { describe, expect, it } from "vitest";
import { fechasPeriodo, planAcuerdo, sumarMeses, periodoValido, valorEnLetras, fraccionar, descuentoProntoPago } from "@/lib/cartera/calculos";
import { valorCuotaUnidad, debeGenerarHoy } from "@/lib/cartera/generacion";
import { parseConfig } from "@/lib/conjunto/config";
import { normalizarExtracto, parseFechaExtracto, referenciasEnTexto } from "@/lib/cartera/conciliacion";
import { asientosCsv, totalesAsientos, type Asiento } from "@/lib/cartera/contable";

describe("generación mensual — fechas y valores", () => {
  it("fechas del periodo en hora de Bogotá", () => {
    const f = fechasPeriodo("2026-10", { diaGeneracion: 1, diaVencimiento: 10, diaProntoPago: 5 });
    expect(f.emision.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(f.vencimiento.toISOString()).toBe("2026-10-10T05:00:00.000Z");
    expect(f.prontoPago!.toISOString()).toBe("2026-10-06T04:59:59.000Z"); // 5 oct 23:59:59 Bogotá
    // El pronto pago aplica todo el día límite
    expect(descuentoProntoPago({ valorBase: 400_000, porcentajeProntoPago: 5, fechaProntoPago: f.prontoPago }, new Date("2026-10-05T22:00:00-05:00"))).toBe(20_000);
    expect(descuentoProntoPago({ valorBase: 400_000, porcentajeProntoPago: 5, fechaProntoPago: f.prontoPago }, new Date("2026-10-06T00:01:00-05:00"))).toBe(0);
  });

  it("valor de la cuota por coeficiente o valor fijo según la configuración", () => {
    const coef = parseConfig({ cartera: { calculoCuota: "COEFICIENTE", presupuestoMensual: 48_000_000 } });
    expect(valorCuotaUnidad(coef, { coeficiente: 0.812345, cuotaAdministracion: 1 })).toBe(389_900);
    const fijo = parseConfig({ cartera: { calculoCuota: "VALOR_FIJO" } });
    expect(valorCuotaUnidad(fijo, { coeficiente: 0.8, cuotaAdministracion: "350000" })).toBe(350_000);
  });

  it("periodos", () => {
    expect(sumarMeses("2026-11", 3)).toBe("2027-02");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(periodoValido("2026-13")).toBe(false);
    expect(periodoValido("2026-09")).toBe(true);
    expect(debeGenerarHoy(parseConfig({ cartera: { diaGeneracion: 3 } }), 2)).toBe(false);
    expect(debeGenerarHoy(parseConfig({ cartera: { diaGeneracion: 3 } }), 3)).toBe(true);
  });

  it("plan de acuerdo: cuotas que cuadran con el saldo", () => {
    const plan = planAcuerdo(1_000_001, 3, "2026-11", 15);
    expect(plan.map((p) => p.valor)).toEqual(fraccionar(1_000_001, 3));
    expect(plan.reduce((a, p) => a + p.valor, 0)).toBe(1_000_001);
    expect(plan[2].periodo).toBe("2027-01");
    expect(plan[0].vencimiento.toISOString()).toBe("2026-11-15T05:00:00.000Z");
  });

  it("valor en letras para recibos", () => {
    expect(valorEnLetras(1_234_567)).toBe("un millón doscientos treinta y cuatro mil quinientos sesenta y siete pesos m/cte.");
    expect(valorEnLetras(21_000)).toBe("veintiún mil pesos m/cte.");
    expect(valorEnLetras(100)).toBe("cien pesos m/cte.");
    expect(valorEnLetras(2_000_000)).toBe("dos millones de pesos m/cte.");
    expect(valorEnLetras(385_900)).toBe("trescientos ochenta y cinco mil novecientos pesos m/cte.");
  });
});

describe("conciliación bancaria — lectura del extracto", () => {
  it("normaliza columnas y toma solo abonos", () => {
    const { lineas, ignoradas } = normalizarExtracto([
      { fecha: "05/09/2026", descripcion: "CONSIG REF 12345600000017", referencia: "", valor: "389.900" },
      { fecha: "2026-09-06", detalle: "PAGO PSE", referencia: "PX1", credito: "$ 400.000", debito: "" },
      { fecha: "07/09/2026", descripcion: "COMISION", valor: "-8.500" },
      { fecha: "", descripcion: "sin fecha", valor: "1000" },
    ]);
    expect(lineas).toHaveLength(2);
    expect(ignoradas).toBe(2);
    expect(lineas[0].valor).toBe(389_900);
    expect(lineas[1].valor).toBe(400_000);
    expect(referenciasEnTexto(lineas[0].referencia, lineas[0].descripcion)).toEqual(["12345600000017"]);
  });
  it("fechas en varios formatos", () => {
    expect(parseFechaExtracto("5/9/26")?.toISOString()).toBe("2026-09-05T17:00:00.000Z");
    expect(parseFechaExtracto("20260905")?.toISOString()).toBe("2026-09-05T17:00:00.000Z");
    expect(parseFechaExtracto("xx")).toBeNull();
  });
});

describe("exportación contable", () => {
  it("CSV con separador punto y coma y totales cuadrados", () => {
    const base = { comprobante: "CC", numero: "1", fecha: new Date("2026-09-01T05:00:00Z"), tercero: "123", terceroNombre: "Ana; Pérez", unidad: "T1-101", descripcion: "Cuota" };
    const a: Asiento[] = [
      { ...base, cuenta: "13050501", debito: 100, credito: 0 },
      { ...base, cuenta: "417005", debito: 0, credito: 100 },
    ];
    expect(totalesAsientos(a)).toEqual({ debito: 100, credito: 100, cuadra: true, lineas: 2 });
    const csv = asientosCsv(a, "ALEGRA");
    expect(csv.split("\r\n")[0]).toContain("Cuenta contable;Identificación del tercero");
    expect(csv).toContain('"Ana; Pérez"');
    expect(csv.split("\r\n")[1].startsWith("2026-09-01;CC-1")).toBe(true);
  });
});
