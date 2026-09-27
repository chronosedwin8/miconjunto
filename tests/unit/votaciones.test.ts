import { describe, expect, it } from "vitest";
import {
  calcularQuorum,
  calcularResultado,
  codigoVerificacion,
  comprobanteHash,
  esComprobanteValido,
  parseCompromisos,
  parseOrdenDelDia,
  validarAntelacion,
  type VotoCalculo,
} from "@/lib/votaciones/calculos";

const SI = { id: "si", texto: "Sí" };
const NO = { id: "no", texto: "No" };
const ABS = { id: "abs", texto: "Abstención" };

/** 10 unidades con coeficiente 10 % cada una (suma 100). */
const unidades = Array.from({ length: 10 }, (_, i) => ({ unidadId: `u${i + 1}`, coeficiente: 10 }));
const votos = (spec: [number, string][]): VotoCalculo[] => spec.map(([i, opcionId]) => ({ ...unidades[i], opcionId }));

describe("quórum (Ley 675 art. 45)", () => {
  it("exige más de la mitad de los coeficientes: 50 % exacto no alcanza", () => {
    const q = calcularQuorum({ presentes: unidades.slice(0, 5), totalCoeficientes: 100, totalUnidades: 10 });
    expect(q.porcentaje).toBe(50);
    expect(q.hayQuorum).toBe(false);
    expect(q.faltante).toBeCloseTo(0.000001, 6);
  });

  it("suma presentes y representados por poder, sin contar dos veces la misma unidad", () => {
    const presentes = [...unidades.slice(0, 5), { unidadId: "u6", coeficiente: 10 }, { unidadId: "u1", coeficiente: 10 }];
    const q = calcularQuorum({ presentes, totalCoeficientes: 100, totalUnidades: 10 });
    expect(q.unidadesPresentes).toBe(6);
    expect(q.coeficientePresente).toBe(60);
    expect(q.hayQuorum).toBe(true);
    expect(q.faltante).toBe(0);
    expect(q.porcentajeUnidades).toBe(60);
  });

  it("funciona con coeficientes desiguales y quórum requerido configurable", () => {
    const presentes = [
      { unidadId: "a", coeficiente: 35.5 },
      { unidadId: "b", coeficiente: 15.25 },
    ];
    expect(calcularQuorum({ presentes, totalCoeficientes: 100, totalUnidades: 20 }).hayQuorum).toBe(true);
    expect(calcularQuorum({ presentes, totalCoeficientes: 100, totalUnidades: 20, requerido: 70 }).hayQuorum).toBe(false);
  });
});

describe("mayoría simple", () => {
  it("por coeficiente fuera de asamblea: más de la mitad de lo emitido", () => {
    const r = calcularResultado({
      opciones: [SI, NO],
      votos: votos([[0, "si"], [1, "si"], [2, "si"], [3, "no"], [4, "no"]]),
      ponderacion: "COEFICIENTE",
      tipoMayoria: "SIMPLE",
      totalCoeficientes: 100,
      totalUnidades: 10,
    });
    expect(r.aprobada).toBe(true);
    expect(r.ganadora?.id).toBe("si");
    const si = r.opciones.find((o) => o.id === "si")!;
    expect(si.pctCoeficiente).toBe(30);
    expect(si.pctParticipacion).toBe(60);
    expect(r.participacionCoeficiente).toBe(50);
    expect(r.participacionUnidades).toBe(50);
  });

  it("en asamblea mide contra lo representado en la sesión (abstenciones y no votantes cuentan en la base)", () => {
    const r = calcularResultado({
      opciones: [SI, NO, ABS],
      votos: votos([[0, "si"], [1, "si"], [2, "si"], [3, "no"], [4, "abs"]]),
      ponderacion: "COEFICIENTE",
      tipoMayoria: "SIMPLE",
      totalCoeficientes: 100,
      totalUnidades: 10,
      presentes: { coeficiente: 70, unidades: 7 },
    });
    // 30 de 70 presentes no es más de la mitad
    expect(r.base.peso).toBe(70);
    expect(r.ganadora?.id).toBe("si");
    expect(r.aprobada).toBe(false);
  });

  it("la ponderación por coeficiente puede cambiar el resultado frente a la ponderación por unidad", () => {
    const grandes = [
      { unidadId: "g1", coeficiente: 30, opcionId: "no" },
      { unidadId: "g2", coeficiente: 30, opcionId: "no" },
      { unidadId: "p1", coeficiente: 10, opcionId: "si" },
      { unidadId: "p2", coeficiente: 10, opcionId: "si" },
      { unidadId: "p3", coeficiente: 10, opcionId: "si" },
    ];
    const base = { opciones: [SI, NO], votos: grandes, tipoMayoria: "SIMPLE" as const, totalCoeficientes: 100, totalUnidades: 6 };
    const porCoef = calcularResultado({ ...base, ponderacion: "COEFICIENTE" });
    const porUnidad = calcularResultado({ ...base, ponderacion: "UNIDAD" });
    expect(porCoef.ganadora?.id).toBe("no");
    expect(porCoef.aprobada).toBe(true);
    expect(porUnidad.ganadora?.id).toBe("si");
    expect(porUnidad.aprobada).toBe(true);
    expect(porUnidad.opciones.find((o) => o.id === "si")!.pctParticipacion).toBe(60);
  });

  it("empate no aprueba", () => {
    const r = calcularResultado({
      opciones: [SI, NO],
      votos: votos([[0, "si"], [1, "no"]]),
      ponderacion: "COEFICIENTE",
      tipoMayoria: "SIMPLE",
      totalCoeficientes: 100,
      totalUnidades: 10,
    });
    expect(r.empate).toBe(true);
    expect(r.aprobada).toBe(false);
    expect(r.ganadora).toBeNull();
  });

  it("un voto por unidad: los duplicados se ignoran", () => {
    const r = calcularResultado({
      opciones: [SI, NO],
      votos: [...votos([[0, "si"]]), { ...unidades[0], opcionId: "no" }],
      ponderacion: "UNIDAD",
      tipoMayoria: "SIMPLE",
      totalCoeficientes: 100,
      totalUnidades: 10,
    });
    expect(r.totalVotos).toBe(1);
    expect(r.ganadora?.id).toBe("si");
  });
});

describe("mayoría calificada del 70 % (Ley 675 art. 46)", () => {
  it("se mide contra el total de coeficientes del conjunto, no contra los presentes", () => {
    const seis = votos([[0, "si"], [1, "si"], [2, "si"], [3, "si"], [4, "si"], [5, "si"]]);
    const r = calcularResultado({ opciones: [SI, NO], votos: seis, ponderacion: "COEFICIENTE", tipoMayoria: "CALIFICADA_70", totalCoeficientes: 100, totalUnidades: 10, presentes: { coeficiente: 60, unidades: 6 } });
    expect(r.opciones[0].pctParticipacion).toBe(100);
    expect(r.aprobada).toBe(false); // 60 % del total < 70 %
    const siete = votos([[0, "si"], [1, "si"], [2, "si"], [3, "si"], [4, "si"], [5, "si"], [6, "si"], [7, "no"]]);
    const r2 = calcularResultado({ opciones: [SI, NO], votos: siete, ponderacion: "COEFICIENTE", tipoMayoria: "CALIFICADA_70", totalCoeficientes: 100, totalUnidades: 10 });
    expect(r2.aprobada).toBe(true); // exactamente 70 %
    expect(r2.base.umbral).toBe(70);
  });

  it("por unidad usa el total de unidades", () => {
    const r = calcularResultado({
      opciones: [SI, NO],
      votos: votos([[0, "si"], [1, "si"], [2, "si"], [3, "si"], [4, "si"], [5, "si"], [6, "no"]]),
      ponderacion: "UNIDAD",
      tipoMayoria: "CALIFICADA_70",
      totalCoeficientes: 100,
      totalUnidades: 10,
    });
    expect(r.aprobada).toBe(false); // 6 de 10
  });
});

describe("unanimidad", () => {
  it("aprueba solo si todos los votantes eligen la misma opción", () => {
    const base = { opciones: [SI, NO], ponderacion: "COEFICIENTE" as const, tipoMayoria: "UNANIME" as const, totalCoeficientes: 100, totalUnidades: 10 };
    expect(calcularResultado({ ...base, votos: votos([[0, "si"], [1, "si"], [2, "si"]]) }).aprobada).toBe(true);
    expect(calcularResultado({ ...base, votos: votos([[0, "si"], [1, "si"], [2, "no"]]) }).aprobada).toBe(false);
  });

  it("en asamblea, un presente que no vota rompe la unanimidad", () => {
    const r = calcularResultado({
      opciones: [SI, NO],
      votos: votos([[0, "si"], [1, "si"]]),
      ponderacion: "COEFICIENTE",
      tipoMayoria: "UNANIME",
      totalCoeficientes: 100,
      totalUnidades: 10,
      presentes: { coeficiente: 30, unidades: 3 },
    });
    expect(r.aprobada).toBe(false);
  });

  it("sin votos no hay decisión", () => {
    const r = calcularResultado({ opciones: [SI, NO], votos: [], ponderacion: "COEFICIENTE", tipoMayoria: "UNANIME", totalCoeficientes: 100, totalUnidades: 10 });
    expect(r.aprobada).toBe(false);
    expect(r.decision).toMatch(/Sin votos/);
  });
});

describe("comprobante de voto", () => {
  it("es sha256 determinista de votación + unidad + nonce y cambia con el nonce", () => {
    const h1 = comprobanteHash("v1", "u1", "abc");
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    expect(comprobanteHash("v1", "u1", "abc")).toBe(h1);
    expect(comprobanteHash("v1", "u1", "abd")).not.toBe(h1);
    expect(comprobanteHash("v1", "u2", "abc")).not.toBe(h1);
    expect(esComprobanteValido(h1)).toBe(true);
    expect(esComprobanteValido("xyz")).toBe(false);
  });

  it("genera códigos de acta legibles", () => {
    expect(codigoVerificacion("ACT")).toMatch(/^ACT-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });
});

describe("antelación de convocatoria (Ley 675 art. 39)", () => {
  const envio = new Date("2026-03-01T15:00:00-05:00");
  it("ordinaria con 15 días calendario cumple", () => {
    const r = validarAntelacion({ tipo: "ORDINARIA", fechaEnvio: envio, fechaAsamblea: new Date("2026-03-16T08:00:00-05:00") });
    expect(r.dias).toBe(15);
    expect(r.ok).toBe(true);
  });

  it("ordinaria con 14 días se bloquea", () => {
    const r = validarAntelacion({ tipo: "ORDINARIA", fechaEnvio: envio, fechaAsamblea: new Date("2026-03-15T20:00:00-05:00") });
    expect(r.dias).toBe(14);
    expect(r.ok).toBe(false);
    expect(r.bloquea).toBe(true);
    expect(r.mensaje).toMatch(/art\. 39/);
  });

  it("cuenta días calendario en hora de Bogotá (no horas de 24)", () => {
    // Envío a las 11 p. m. y reunión 15 días después a las 7 a. m.: son 15 días calendario.
    const r = validarAntelacion({ tipo: "ORDINARIA", fechaEnvio: new Date("2026-03-01T23:00:00-05:00"), fechaAsamblea: new Date("2026-03-16T07:00:00-05:00") });
    expect(r.dias).toBe(15);
    expect(r.ok).toBe(true);
  });

  it("extraordinaria con poca antelación solo advierte", () => {
    const r = validarAntelacion({ tipo: "EXTRAORDINARIA", fechaEnvio: envio, fechaAsamblea: new Date("2026-03-05T19:00:00-05:00") });
    expect(r.ok).toBe(true);
    expect(r.bloquea).toBe(false);
    expect(r.mensaje).toMatch(/Atención/);
  });

  it("no permite convocar a una fecha pasada", () => {
    expect(validarAntelacion({ tipo: "EXTRAORDINARIA", fechaEnvio: envio, fechaAsamblea: new Date("2026-02-20T19:00:00-05:00") }).bloquea).toBe(true);
  });
});

describe("JSON de asambleas", () => {
  it("normaliza orden del día y compromisos", () => {
    expect(parseOrdenDelDia([{ orden: 2, titulo: "B" }, { orden: 1, titulo: "A", votacionId: "v" }, { foo: 1 }]).map((p) => p.titulo)).toEqual(["A", "B"]);
    const c = parseCompromisos([{ tarea: "Cotizar", responsable: "Admin", estado: "RARO" }, { tarea: "" }]);
    expect(c).toHaveLength(1);
    expect(c[0].estado).toBe("PENDIENTE");
  });
});
