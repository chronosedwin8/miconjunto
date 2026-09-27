import { describe, expect, it } from "vitest";
import {
  conMomento,
  cumplimiento,
  debeGenerarOrden,
  diasHasta,
  lineas,
  momentoEvidencia,
  mtbfDias,
  parseChecklist,
  proximaFechaPlan,
  semaforoVencimiento,
  tocaAvisar,
} from "@/lib/mantenimiento/calculos";
import { digitoVerificacionNit, estadoContrato, promedioCalificacion, renovarContrato } from "@/lib/proveedores/calculos";
import { ejecucionPresupuestal, rubroParaConcepto } from "@/lib/presupuesto/calculos";
import { asientosDeGastos, cuadra, OPCIONES_DEFECTO, PLANTILLAS, presupuestoMensualizado, SOFTWARES, tablaContable, toCsv, type GastoContable } from "@/lib/presupuesto/contable";

// Fechas a mediodía de Bogotá (17:00 UTC)
const d = (s: string) => new Date(`${s}T17:00:00Z`);

describe("plan de mantenimiento: próxima fecha y generación de órdenes", () => {
  it("la próxima fecha es la ejecución real + frecuencia", () => {
    expect(proximaFechaPlan(d("2026-09-10"), 30).toISOString()).toBe(d("2026-10-10").toISOString());
    expect(proximaFechaPlan(d("2026-01-31"), 365).toISOString()).toBe(d("2027-01-31").toISOString());
    expect(proximaFechaPlan(d("2026-09-10"), 0).toISOString()).toBe(d("2026-09-11").toISOString());
  });

  it("genera la orden cuando próxima fecha − anticipación ≤ hoy y no hay orden abierta", () => {
    const plan = { proximaFecha: d("2026-10-05"), diasAnticipacion: 7, activoPlan: true };
    expect(debeGenerarOrden(plan, d("2026-09-27"), false)).toBe(false); // faltan 8 días
    expect(debeGenerarOrden(plan, d("2026-09-28"), false)).toBe(true); // exactamente 7 días antes
    expect(debeGenerarOrden(plan, d("2026-10-20"), false)).toBe(true); // vencido
    expect(debeGenerarOrden(plan, d("2026-10-20"), true)).toBe(false); // ya tiene orden abierta
    expect(debeGenerarOrden({ ...plan, activoPlan: false }, d("2026-10-20"), false)).toBe(false);
  });

  it("compara por día de Bogotá, no por hora UTC", () => {
    // 23:30 del 27 en Bogotá = 04:30 UTC del 28
    const noche = new Date("2026-09-28T04:30:00Z");
    expect(diasHasta(d("2026-09-28"), noche)).toBe(1);
    expect(debeGenerarOrden({ proximaFecha: d("2026-10-05"), diasAnticipacion: 7, activoPlan: true }, noche, false)).toBe(false);
  });

  it("semáforo y umbrales de aviso de vencimientos", () => {
    const hoy = d("2026-09-27");
    expect(semaforoVencimiento(d("2026-09-20"), hoy)).toBe("VENCIDO");
    expect(semaforoVencimiento(d("2026-10-20"), hoy, 30)).toBe("POR_VENCER");
    expect(semaforoVencimiento(d("2026-12-20"), hoy, 30)).toBe("VIGENTE");
    expect(semaforoVencimiento(null, hoy)).toBeNull();
    expect(tocaAvisar(d("2026-10-27"), hoy, 30)).toBe(true); // 30 días
    expect(tocaAvisar(d("2026-10-26"), hoy, 30)).toBe(false); // 29 días: no repite
    expect(tocaAvisar(d("2026-10-04"), hoy, 30)).toBe(true); // 7 días
    expect(tocaAvisar(d("2026-09-26"), hoy, 30)).toBe(true); // venció ayer
    expect(tocaAvisar(d("2026-09-20"), hoy, 30)).toBe(false);
  });

  it("cumplimiento y MTBF", () => {
    const c = cumplimiento([
      { estado: "COMPLETADA", fechaProgramada: d("2026-01-10"), fechaCierre: d("2026-01-11") },
      { estado: "COMPLETADA", fechaProgramada: d("2026-02-10"), fechaCierre: d("2026-02-20") },
      { estado: "PROGRAMADA", fechaProgramada: d("2026-03-10"), fechaCierre: null },
      { estado: "CANCELADA", fechaProgramada: d("2026-04-10"), fechaCierre: null },
    ]);
    expect(c).toMatchObject({ total: 3, completadas: 2, aTiempo: 1, pctCumplimiento: 66.7, pctATiempo: 33.3 });
    expect(mtbfDias([d("2026-01-01"), d("2026-01-31"), d("2026-03-02")])).toBe(30);
    expect(mtbfDias([d("2026-01-01")], { desde: d("2026-01-01"), hasta: d("2026-07-01") })).toBe(181);
    expect(mtbfDias([])).toBeNull();
  });

  it("checklist y evidencias", () => {
    expect(lineas("- Revisar frenos\n\n2. Lubricar guías\r\n• Probar puertas")).toEqual(["Revisar frenos", "Lubricar guías", "Probar puertas"]);
    expect(parseChecklist([{ item: "A", ok: true }, "B", null, { item: "" }])).toEqual([{ item: "A", ok: true }, { item: "B", ok: false }]);
    const u = conMomento("/api/files/c1/ordenes/x.jpg", "antes");
    expect(u).toBe("/api/files/c1/ordenes/x.jpg#antes");
    expect(momentoEvidencia(conMomento(u, "despues"))).toBe("despues");
  });
});

describe("contratos por fechas", () => {
  const hoy = d("2026-09-27");
  it("vigente, por vencer, vencido y terminado", () => {
    expect(estadoContrato({ fin: d("2027-03-01"), diasAlerta: 30 }, hoy)).toBe("VIGENTE");
    expect(estadoContrato({ fin: d("2026-10-27"), diasAlerta: 30 }, hoy)).toBe("POR_VENCER");
    expect(estadoContrato({ fin: d("2026-09-27"), diasAlerta: 30 }, hoy)).toBe("POR_VENCER"); // vence hoy
    expect(estadoContrato({ fin: d("2026-09-26"), diasAlerta: 30 }, hoy)).toBe("VENCIDO");
    expect(estadoContrato({ fin: d("2026-09-26"), diasAlerta: 30, estado: "TERMINADO" }, hoy)).toBe("TERMINADO");
  });
  it("la renovación automática prorroga por el mismo periodo hasta cubrir hoy", () => {
    const r = renovarContrato({ inicio: d("2025-01-01"), fin: d("2025-12-31") }, hoy);
    expect(r.veces).toBe(1);
    expect(r.inicio.toISOString()).toBe(d("2026-01-01").toISOString());
    expect(estadoContrato({ fin: r.fin, diasAlerta: 30 }, hoy)).not.toBe("VENCIDO");
  });
  it("utilidades de proveedores", () => {
    expect(digitoVerificacionNit("900123456")).toBe(8);
    expect(promedioCalificacion([5, 4, 4, 9])).toBe(4.33);
  });
});

describe("exportación contable por software", () => {
  const gastos: GastoContable[] = [
    { id: "g1", fecha: d("2026-09-05"), descripcion: "Vigilancia; septiembre", valor: 16_800_000, estado: "PAGADO", cuentaContable: null, rubroCuenta: "513505", rubroNombre: "Vigilancia", proveedorNit: "890112233-4", proveedorNombre: "Seguridad Atlántico" },
    { id: "g2", fecha: d("2026-09-10"), descripcion: "Repuesto motobomba", valor: 1_850_000, estado: "APROBADO", cuentaContable: "514525", rubroCuenta: "514510", rubroNombre: "Mantenimiento", proveedorNit: null, proveedorNombre: null },
    { id: "g3", fecha: d("2026-09-11"), descripcion: "Pendiente", valor: 100_000, estado: "PENDIENTE_APROBACION", cuentaContable: null, rubroCuenta: null, rubroNombre: null, proveedorNit: null, proveedorNombre: null },
  ];
  const lineasC = asientosDeGastos(gastos, { ...OPCIONES_DEFECTO, nitConjunto: "900999888-1", nombreConjunto: "Conjunto Demo" });

  it("partida doble: pagado contra bancos, aprobado contra cuentas por pagar, sin pendientes", () => {
    expect(lineasC).toHaveLength(4);
    expect(cuadra(lineasC)).toBe(true);
    const [d1, c1, d2, c2] = lineasC;
    expect(d1).toMatchObject({ comprobante: "CE", numero: 1, cuenta: "513505", debito: 16_800_000, credito: 0, nit: "890112233", dv: "4" });
    expect(c1).toMatchObject({ cuenta: "111005", credito: 16_800_000 });
    expect(d2).toMatchObject({ comprobante: "NC", numero: 2, cuenta: "514525", nit: "900999888" }); // cuenta del gasto sobre la del rubro; tercero = conjunto
    expect(c2.cuenta).toBe("233595");
    expect(d1.detalle).not.toContain(";");
  });

  it("cada software tiene su plantilla de columnas y formato de fecha", () => {
    expect(SOFTWARES).toEqual(["SIIGO", "WORLD_OFFICE", "ALEGRA", "HELISA"]);
    const siigo = tablaContable("SIIGO", lineasC);
    expect(siigo.headers.slice(0, 3)).toEqual(["Tipo de comprobante", "Consecutivo comprobante", "Fecha de elaboración"]);
    expect(siigo.rows[0][2]).toBe("05/09/2026");
    expect(siigo.headers).toContain("Código centro/subcentro de costos");
    const wo = tablaContable("WORLD_OFFICE", lineasC);
    expect(wo.headers).toContain("Doc Contable: Débito");
    expect(wo.rows[1][wo.headers.indexOf("Doc Contable: Crédito")]).toBe(16_800_000);
    const alegra = tablaContable("ALEGRA", lineasC);
    expect(alegra.separador).toBe(",");
    expect(alegra.rows[0][0]).toBe("2026-09-05");
    expect(alegra.rows[0][1]).toBe("CE-1");
    const helisa = tablaContable("HELISA", lineasC);
    expect(helisa.rows[0][helisa.headers.indexOf("Fecha")]).toBe("20260905");
    expect(helisa.rows[0][helisa.headers.indexOf("NIT")]).toBe("890112233");
    for (const s of SOFTWARES) {
      const t = tablaContable(s, lineasC);
      const iD = t.headers.findIndex((h) => /D[ée]bito/.test(h));
      const iC = t.headers.findIndex((h) => /Cr[ée]dito/.test(h));
      const sum = (i: number) => t.rows.reduce((a, r) => a + Number(r[i]), 0);
      expect(sum(iD)).toBe(sum(iC));
      expect(PLANTILLAS[s].columnas.length).toBe(t.headers.length);
    }
  });

  it("CSV con BOM, separador y comillas", () => {
    const csv = toCsv(["A", "B"], [["x;y", 'di "hola"'], [1, 2]], ";");
    expect(csv.startsWith("﻿A;B\r\n")).toBe(true);
    expect(csv).toContain('"x;y";"di ""hola"""');
  });

  it("presupuesto mensualizado suma exactamente el valor anual", () => {
    const { headers, rows } = presupuestoMensualizado([{ tipo: "GASTO", nombre: "Vigilancia", cuentaContable: "513505", valorAnual: 100_000_001 }]);
    expect(headers).toHaveLength(17);
    const meses = rows[0].slice(4, 16) as number[];
    expect(meses.reduce((a, b) => a + b, 0)).toBe(100_000_001);
  });
});

describe("ejecución vs presupuesto", () => {
  const rubros = [
    { id: "i1", tipo: "INGRESO" as const, nombre: "Cuotas de administración", cuentaContable: "417005", valorAnual: 120_000_000 },
    { id: "g1", tipo: "GASTO" as const, nombre: "Vigilancia", cuentaContable: "513505", valorAnual: 12_000_000 },
    { id: "g2", tipo: "GASTO" as const, nombre: "Mantenimiento", cuentaContable: "514510", valorAnual: 6_000_000 },
  ];
  it("calcula ejecutado, % anual, % a la fecha y alertas", () => {
    const ej = new Map<string, number[]>([
      ["i1", [10e6, 10e6, 5e6, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      ["g1", [1e6, 1e6, 1e6, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
      ["g2", [3e6, 1e6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ]);
    const r = ejecucionPresupuestal(rubros, ej, 3);
    const f = Object.fromEntries(r.filas.map((x) => [x.id, x]));
    expect(f.i1).toMatchObject({ ejecutado: 25e6, presupuestadoALaFecha: 30e6, pct: 20.8, pctALaFecha: 83.3, alerta: "BAJO" });
    expect(f.g1).toMatchObject({ ejecutado: 3e6, pctALaFecha: 100, alerta: null, diferencia: 9e6 });
    expect(f.g2).toMatchObject({ ejecutado: 4e6, presupuestadoALaFecha: 1.5e6, alerta: "SOBREEJECUTADO" });
    expect(r.ingresos.ejecutado).toBe(25e6);
    expect(r.gastos.ejecutado).toBe(7e6);
    expect(r.gastos.porMes.slice(0, 3)).toEqual([4e6, 2e6, 1e6]);
    expect(r.superavit).toBe(18e6);
  });
  it("relaciona conceptos de cobro con rubros de ingreso por cuenta y por nombre", () => {
    expect(rubroParaConcepto(rubros, { nombre: "Cuota de administración", tipo: "ADMINISTRACION", cuentaContable: "417005" })).toBe("i1");
    expect(rubroParaConcepto(rubros, { nombre: "Cuotas de administración", tipo: "ADMINISTRACION", cuentaContable: null })).toBe("i1");
    expect(rubroParaConcepto(rubros, { nombre: "Multa", tipo: "MULTA", cuentaContable: "425050" })).toBeNull();
  });
});
