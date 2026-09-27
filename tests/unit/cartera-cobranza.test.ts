import { describe, expect, it } from "vitest";
import { calcularFestivos, diasCubiertos, domingoPascua, esFestivo, FESTIVOS_CO, horarioCobranzaPermitido, semanaCalendario, siguienteHorarioPermitido } from "@/lib/cartera/cobranza";

/** Fecha/hora en Bogotá. */
const b = (s: string) => new Date(`${s}-05:00`);

describe("Ley 2300 de 2023 — horario de cobranza", () => {
  it("lunes a viernes de 7:00 a 19:00", () => {
    expect(horarioCobranzaPermitido(b("2026-09-28T06:59")).ok).toBe(false); // lunes
    expect(horarioCobranzaPermitido(b("2026-09-28T07:00")).ok).toBe(true);
    expect(horarioCobranzaPermitido(b("2026-09-30T13:30")).ok).toBe(true);
    expect(horarioCobranzaPermitido(b("2026-10-02T19:00")).ok).toBe(true); // viernes, límite
    expect(horarioCobranzaPermitido(b("2026-10-02T19:01")).ok).toBe(false);
    expect(horarioCobranzaPermitido(b("2026-10-02T22:00")).motivo).toMatch(/7:00 p\. m\./);
  });

  it("sábados de 8:00 a 15:00", () => {
    expect(horarioCobranzaPermitido(b("2026-10-03T07:30")).ok).toBe(false);
    expect(horarioCobranzaPermitido(b("2026-10-03T08:00")).ok).toBe(true);
    expect(horarioCobranzaPermitido(b("2026-10-03T15:00")).ok).toBe(true);
    expect(horarioCobranzaPermitido(b("2026-10-03T15:30")).ok).toBe(false);
  });

  it("nunca domingos ni festivos", () => {
    expect(horarioCobranzaPermitido(b("2026-10-04T10:00")).ok).toBe(false); // domingo
    expect(horarioCobranzaPermitido(b("2026-10-12T10:00")).ok).toBe(false); // Día de la Raza (lunes festivo)
    expect(horarioCobranzaPermitido(b("2026-10-12T10:00")).motivo).toMatch(/festivo/);
    expect(horarioCobranzaPermitido(b("2027-03-25T10:00")).ok).toBe(false); // Jueves Santo 2027
  });

  it("usa la hora de Bogotá aunque la fecha venga en UTC", () => {
    // 2026-09-29 00:30 UTC = lunes 28 a las 19:30 en Bogotá → fuera de horario
    expect(horarioCobranzaPermitido(new Date("2026-09-29T00:30:00Z")).ok).toBe(false);
    // 2026-09-28 12:00 UTC = lunes 7:00 en Bogotá → permitido
    expect(horarioCobranzaPermitido(new Date("2026-09-28T12:00:00Z")).ok).toBe(true);
  });

  it("calcula el siguiente horario permitido", () => {
    const s = siguienteHorarioPermitido(b("2026-10-03T16:00")); // sábado tarde → lunes 5 a las 7:00
    expect(s.toISOString()).toBe(b("2026-10-05T07:00").toISOString());
  });
});

describe("festivos de Colombia", () => {
  it("la lista 2025–2027 coincide con el cálculo (Ley Emiliani + Pascua)", () => {
    for (const y of [2025, 2026, 2027]) expect(calcularFestivos(y)).toEqual([...FESTIVOS_CO[y]].sort());
  });
  it("Pascua", () => {
    expect(domingoPascua(2025).toISOString().slice(0, 10)).toBe("2025-04-20");
    expect(domingoPascua(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(domingoPascua(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });
  it("detecta festivos trasladados al lunes", () => {
    expect(esFestivo(b("2026-01-12T09:00"))).toBe(true); // Reyes
    expect(esFestivo(b("2026-01-06T09:00"))).toBe(false);
    expect(esFestivo(b("2025-06-30T09:00"))).toBe(true); // Sagrado Corazón y San Pedro
    expect(esFestivo(b("2028-12-25T09:00"))).toBe(true); // fuera de la lista: se calcula
  });
});

describe("frecuencia y envíos automáticos", () => {
  it("semana calendario de lunes a domingo", () => {
    const s = semanaCalendario(b("2026-10-01T10:00")); // jueves
    expect(s.desde.toISOString()).toBe(b("2026-09-28T00:00").toISOString());
    expect(s.hasta.toISOString()).toBe(b("2026-10-05T00:00").toISOString());
    const dom = semanaCalendario(b("2026-10-04T23:00"));
    expect(dom.desde.toISOString()).toBe(b("2026-09-28T00:00").toISOString());
  });

  it("los recordatorios que caen en domingo o festivo se envían el siguiente día hábil", () => {
    expect(diasCubiertos(b("2026-10-04T08:00"))).toEqual([]); // domingo
    expect(diasCubiertos(b("2026-10-05T08:00"))).toEqual(["2026-10-04", "2026-10-05"]); // lunes cubre el domingo
    expect(diasCubiertos(b("2026-10-13T08:00"))).toEqual(["2026-10-11", "2026-10-12", "2026-10-13"]); // martes tras puente
    expect(diasCubiertos(b("2026-10-07T08:00"))).toEqual(["2026-10-07"]);
  });
});
