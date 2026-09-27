import { describe, expect, it } from "vitest";
import { generaCargo, pasosDebidoProceso, plazoDescargos, puedeDecidir, puedePresentarDescargos, puedeTransicionarMulta } from "@/lib/convivencia/debido-proceso";
import { franjasSeCruzan, parseEnseres, problemasContratistas, validarFranjaMudanza } from "@/lib/obras/reglas";

const bog = (iso: string) => new Date(`${iso}-05:00`);

describe("debido proceso de multas (Ley 675, art. 59)", () => {
  it("el plazo de descargos es de 5 días hábiles desde la notificación", () => {
    // Viernes 14/08/2026: el lunes 17 es festivo → 18, 19, 20, 21, 24
    expect(plazoDescargos(bog("2026-08-14T10:00")).toISOString()).toBe(bog("2026-08-24T23:59:59.999").toISOString());
  });

  it("transiciones válidas", () => {
    expect(puedeTransicionarMulta("PROPUESTA", "NOTIFICADA")).toBe(true);
    expect(puedeTransicionarMulta("NOTIFICADA", "EN_DESCARGOS")).toBe(true);
    expect(puedeTransicionarMulta("EN_DESCARGOS", "RATIFICADA")).toBe(true);
    expect(puedeTransicionarMulta("EN_DESCARGOS", "REVOCADA")).toBe(true);
    expect(puedeTransicionarMulta("RATIFICADA", "PAGADA")).toBe(true);
    // no se puede ratificar sin notificar, ni revivir una revocada
    expect(puedeTransicionarMulta("PROPUESTA", "RATIFICADA")).toBe(false);
    expect(puedeTransicionarMulta("REVOCADA", "RATIFICADA")).toBe(false);
    expect(puedeTransicionarMulta("PAGADA", "REVOCADA")).toBe(false);
  });

  it("descargos solo dentro del plazo", () => {
    const m = { estado: "NOTIFICADA" as const, plazoDescargos: bog("2026-10-05T23:59:59") };
    expect(puedePresentarDescargos(m, bog("2026-10-05T20:00")).ok).toBe(true);
    expect(puedePresentarDescargos(m, bog("2026-10-06T08:00")).ok).toBe(false);
    expect(puedePresentarDescargos({ estado: "PROPUESTA", plazoDescargos: null }).ok).toBe(false);
    expect(puedePresentarDescargos({ estado: "EN_DESCARGOS", plazoDescargos: null }).ok).toBe(false);
  });

  it("el consejo decide con descargos o con el plazo vencido, nunca antes", () => {
    const plazo = bog("2026-10-05T23:59:59");
    expect(puedeDecidir({ estado: "PROPUESTA", plazoDescargos: null }).ok).toBe(false);
    expect(puedeDecidir({ estado: "NOTIFICADA", plazoDescargos: plazo }, bog("2026-10-02T10:00")).ok).toBe(false);
    expect(puedeDecidir({ estado: "NOTIFICADA", plazoDescargos: plazo }, bog("2026-10-06T10:00")).ok).toBe(true);
    expect(puedeDecidir({ estado: "EN_DESCARGOS", plazoDescargos: plazo }, bog("2026-10-02T10:00")).ok).toBe(true);
    expect(puedeDecidir({ estado: "RATIFICADA", plazoDescargos: plazo }).ok).toBe(false);
  });

  it("solo la multa ratificada genera cargo en cartera", () => {
    expect(generaCargo("RATIFICADA")).toBe(true);
    for (const e of ["PROPUESTA", "NOTIFICADA", "EN_DESCARGOS", "REVOCADA", "PAGADA"] as const) expect(generaCargo(e)).toBe(false);
  });

  it("línea de tiempo del proceso", () => {
    const pasos = pasosDebidoProceso({ estado: "EN_DESCARGOS", createdAt: new Date(), notificadaEn: new Date(), plazoDescargos: new Date(), descargosEn: new Date(), resolucionEn: null });
    expect(pasos.map((p) => p.hecho)).toEqual([true, true, true, false, false]);
  });
});

describe("mudanzas y obras", () => {
  it("detecta cruces de franja (los extremos que se tocan no cruzan)", () => {
    expect(franjasSeCruzan({ horaInicio: "08:00", horaFin: "11:00" }, { horaInicio: "10:00", horaFin: "12:00" })).toBe(true);
    expect(franjasSeCruzan({ horaInicio: "08:00", horaFin: "10:00" }, { horaInicio: "10:00", horaFin: "12:00" })).toBe(false);
    expect(franjasSeCruzan({ horaInicio: "13:00", horaFin: "17:00" }, { horaInicio: "08:00", horaFin: "18:00" })).toBe(true);
  });

  it("valida día y horario de mudanzas", () => {
    expect(validarFranjaMudanza(bog("2026-10-03T00:00"), { horaInicio: "08:00", horaFin: "12:00" })).toBeNull(); // sábado
    expect(validarFranjaMudanza(bog("2026-10-04T00:00"), { horaInicio: "08:00", horaFin: "12:00" })).toMatch(/domingos/);
    expect(validarFranjaMudanza(bog("2026-10-12T00:00"), { horaInicio: "08:00", horaFin: "12:00" })).toMatch(/festivos/);
    expect(validarFranjaMudanza(bog("2026-10-05T00:00"), { horaInicio: "06:00", horaFin: "09:00" })).toMatch(/07:00/);
    expect(validarFranjaMudanza(bog("2026-10-05T00:00"), { horaInicio: "12:00", horaFin: "10:00" })).toMatch(/anterior/);
  });

  it("lee la lista de enseres", () => {
    expect(parseEnseres("2 x Nevera\nSofá\n3 Cajas de libros\n\n")).toEqual([
      { cantidad: 2, descripcion: "Nevera" },
      { cantidad: 1, descripcion: "Sofá" },
      { cantidad: 3, descripcion: "Cajas de libros" },
    ]);
  });

  it("exige seguridad social vigente de los contratistas", () => {
    const fin = bog("2026-10-30T17:00");
    expect(problemasContratistas([{ nombre: "Pedro", documento: "1", seguridadSocialUrl: "/x.pdf", vence: "2026-11-30" }], fin)).toEqual([]);
    expect(problemasContratistas([{ nombre: "Pedro", documento: "1", seguridadSocialUrl: "/x.pdf", vence: "2026-10-15" }], fin)[0]).toMatch(/vence antes/);
    expect(problemasContratistas([{ nombre: "Juan", documento: "2", vence: "2026-12-01" }], fin)[0]).toMatch(/falta el soporte/);
  });
});
