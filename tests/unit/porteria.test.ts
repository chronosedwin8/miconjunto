import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { agotadaTrasUso, esCodigoValido, evaluarAutorizacion, generarCodigo, generarQrToken, interpretarLectura, urlAccesoVisitante } from "@/lib/porteria/codigos";
import { calcularTarifaParqueadero, evaluarFrecuente, sumarDiasHabiles, textoPermanencia, validarAnulacion } from "@/lib/porteria/reglas";
import { vigenciaDesdeFormulario } from "@/lib/porteria/vigencia";

const bogota = (s: string) => fromZonedTime(s, "America/Bogota");

describe("códigos de autorización", () => {
  it("genera códigos de 6 dígitos que no empiezan por 0", () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^[1-9]\d{5}$/);
      expect(esCodigoValido(c)).toBe(true);
    }
    expect(generarCodigo(() => 0)).toBe("100000");
    expect(generarCodigo(() => 0.999999)).toBe("999999");
    expect(esCodigoValido("12345")).toBe(false);
    expect(esCodigoValido("12a456")).toBe(false);
  });

  it("genera tokens QR únicos y URL-safe", () => {
    const set = new Set(Array.from({ length: 100 }, generarQrToken));
    expect(set.size).toBe(100);
    for (const t of set) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it("interpreta lo leído por el escáner: URL del pase, token o código", () => {
    const t = generarQrToken();
    expect(interpretarLectura(urlAccesoVisitante("https://app.co/", t))).toEqual({ token: t });
    expect(interpretarLectura(" 246810 ")).toEqual({ codigo: "246810" });
    expect(interpretarLectura(t)).toEqual({ token: t });
    expect(interpretarLectura("Código: 246810")).toEqual({ codigo: "246810" });
    expect(interpretarLectura("hola")).toBeNull();
  });

  const base = {
    estado: "ACTIVA" as const,
    fechaInicio: bogota("2026-09-01T00:00"),
    fechaFin: bogota("2026-09-30T23:59"),
    recurrente: false,
    diasSemana: [],
    horaInicio: null,
    horaFin: null,
    usosPermitidos: 1,
    usos: 0,
  };

  it("valida estado, vigencia y usos", () => {
    const ahora = bogota("2026-09-15T10:00");
    expect(evaluarAutorizacion(base, ahora).ok).toBe(true);
    expect(evaluarAutorizacion({ ...base, estado: "REVOCADA" }, ahora).ok).toBe(false);
    expect(evaluarAutorizacion(base, bogota("2026-10-01T08:00"))).toMatchObject({ ok: false, motivo: expect.stringMatching(/vencida/) });
    expect(evaluarAutorizacion(base, bogota("2026-08-31T08:00"))).toMatchObject({ ok: false, motivo: expect.stringMatching(/todavía/) });
    expect(evaluarAutorizacion({ ...base, usos: 1 }, ahora).ok).toBe(false);
    expect(evaluarAutorizacion({ ...base, usosPermitidos: 0, usos: 99 }, ahora).ok).toBe(true);
    expect(agotadaTrasUso({ usosPermitidos: 2, usos: 1 })).toBe(true);
    expect(agotadaTrasUso({ usosPermitidos: 2, usos: 0 })).toBe(false);
    expect(agotadaTrasUso({ usosPermitidos: 0, usos: 50 })).toBe(false);
  });

  it("valida días y horas de autorizaciones recurrentes (hora de Bogotá)", () => {
    const rec = { ...base, recurrente: true, diasSemana: [1, 3, 5], horaInicio: "07:00", horaFin: "12:00", usosPermitidos: 0 };
    expect(evaluarAutorizacion(rec, bogota("2026-09-14T08:00")).ok).toBe(true); // lunes
    expect(evaluarAutorizacion(rec, bogota("2026-09-15T08:00")).ok).toBe(false); // martes
    expect(evaluarAutorizacion(rec, bogota("2026-09-14T13:00")).ok).toBe(false); // fuera de hora
  });
});

describe("horario permitido de frecuentes", () => {
  const empleada = { estado: "ACTIVO", horarioPermitido: { dias: [1, 2, 3, 4, 5], desde: "07:00", hasta: "16:00" } };
  it("permite dentro del horario", () => {
    expect(evaluarFrecuente(empleada, bogota("2026-09-16T07:30"))).toEqual({ permitido: true, alertas: [] });
  });
  it("alerta fuera de hora, en día no permitido o con vínculo inactivo", () => {
    expect(evaluarFrecuente(empleada, bogota("2026-09-16T18:00")).alertas[0]).toMatch(/Fuera del horario/);
    expect(evaluarFrecuente(empleada, bogota("2026-09-20T09:00")).alertas[0]).toMatch(/día permitido/); // domingo
    const r = evaluarFrecuente({ ...empleada, estado: "INACTIVO" }, bogota("2026-09-16T09:00"));
    expect(r.permitido).toBe(false);
    expect(r.alertas[0]).toMatch(/no está activo/);
  });
  it("sin horario no hay restricción y admite franjas nocturnas", () => {
    expect(evaluarFrecuente({ estado: "ACTIVO", horarioPermitido: null }, bogota("2026-09-20T03:00")).permitido).toBe(true);
    const noche = { estado: "ACTIVO", horarioPermitido: { desde: "22:00", hasta: "06:00" } };
    expect(evaluarFrecuente(noche, bogota("2026-09-16T23:30")).permitido).toBe(true);
    expect(evaluarFrecuente(noche, bogota("2026-09-16T05:00")).permitido).toBe(true);
    expect(evaluarFrecuente(noche, bogota("2026-09-16T12:00")).permitido).toBe(false);
  });
});

describe("tarifa de parqueadero de visitantes", () => {
  const t0 = new Date("2026-09-16T10:00:00Z");
  const min = (m: number) => new Date(t0.getTime() + m * 60000);
  const tarifas = { tarifaHora: 2000, tarifaDia: 15000 };
  it("gracia de 15 minutos sin cobro", () => {
    expect(calcularTarifaParqueadero(tarifas, t0, min(15)).valor).toBe(0);
  });
  it("fracción de hora se cobra como hora completa", () => {
    expect(calcularTarifaParqueadero(tarifas, t0, min(16)).valor).toBe(2000);
    expect(calcularTarifaParqueadero(tarifas, t0, min(61)).valor).toBe(4000);
  });
  it("tope diario y días adicionales", () => {
    expect(calcularTarifaParqueadero(tarifas, t0, min(10 * 60)).valor).toBe(15000);
    expect(calcularTarifaParqueadero(tarifas, t0, min(26 * 60)).valor).toBe(15000 + 4000);
  });
  it("sin tarifas no cobra; solo tarifa diaria cobra por día", () => {
    expect(calcularTarifaParqueadero({}, t0, min(300)).valor).toBe(0);
    expect(calcularTarifaParqueadero({ tarifaDia: 10000 }, t0, min(30 * 60)).valor).toBe(20000);
  });
});

describe("inmutabilidad de la bitácora", () => {
  it("solo se anula un registro vigente y nunca una anulación", () => {
    expect(validarAnulacion({ tipo: "INGRESO" }, false).ok).toBe(true);
    expect(validarAnulacion({ tipo: "SALIDA" }, true)).toMatchObject({ ok: false, motivo: expect.stringMatching(/ya fue anulado/) });
    expect(validarAnulacion({ tipo: "ANULACION" }, false)).toMatchObject({ ok: false });
    expect(validarAnulacion(null, false).ok).toBe(false);
  });
});

describe("utilidades", () => {
  it("días hábiles saltan fines de semana", () => {
    const viernes = bogota("2026-09-18T10:00");
    expect(sumarDiasHabiles(viernes, 1).getTime()).toBe(bogota("2026-09-21T10:00").getTime());
    expect(sumarDiasHabiles(viernes, 5).getTime()).toBe(bogota("2026-09-25T10:00").getTime());
  });
  it("permanencia legible", () => {
    expect(textoPermanencia(45)).toBe("45 min");
    expect(textoPermanencia(125)).toBe("2 h 5 min");
    expect(textoPermanencia(60 * 26)).toBe("1 d 2 h");
  });
  it("vigencia del formulario del residente", () => {
    const ahora = bogota("2026-09-16T10:00");
    const hoy = vigenciaDesdeFormulario({ cuando: "HOY" }, ahora);
    expect("fechaFin" in hoy && hoy.fechaFin.getTime()).toBe(bogota("2026-09-16T23:59").getTime());
    expect(vigenciaDesdeFormulario({ cuando: "RANGO", fechaInicio: "2026-09-20T10:00", fechaFin: "2026-09-20T09:00" }, ahora)).toMatchObject({ campo: "fechaFin" });
    expect(vigenciaDesdeFormulario({ cuando: "RECURRENTE" }, ahora)).toMatchObject({ campo: "hasta" });
  });
});
