import { describe, expect, it } from "vitest";
import { diasHabilesEntre, domingoDePascua, esDiaHabil, esFestivo, festivosColombia, sumarDiasHabiles } from "@/lib/tickets/dias-habiles";
import { diasSla, estadoSla, fechaLimiteSla, formatoRadicado, prioridadSugerida, puedeCalificar, puedeReabrir, puedeTransicionar, TRANSICIONES } from "@/lib/tickets/reglas";
import { calcularEstadisticas, type TicketStatRow } from "@/lib/tickets/stats";

/** Instante a una hora local de Bogotá (UTC−5). */
const bog = (iso: string) => new Date(`${iso}-05:00`);

describe("festivos de Colombia", () => {
  it("calcula el domingo de Pascua", () => {
    expect(domingoDePascua(2024)).toEqual([3, 31]);
    expect(domingoDePascua(2025)).toEqual([4, 20]);
    expect(domingoDePascua(2026)).toEqual([4, 5]);
    expect(domingoDePascua(2027)).toEqual([3, 28]);
  });

  it("lista los 18 festivos de 2026 con Ley Emiliani y fechas de Pascua", () => {
    expect(festivosColombia(2026).map((f) => f.fecha)).toEqual([
      "2026-01-01",
      "2026-01-12",
      "2026-03-23",
      "2026-04-02",
      "2026-04-03",
      "2026-05-01",
      "2026-05-18",
      "2026-06-08",
      "2026-06-15",
      "2026-06-29",
      "2026-07-20",
      "2026-08-07",
      "2026-08-17",
      "2026-10-12",
      "2026-11-02",
      "2026-11-16",
      "2026-12-08",
      "2026-12-25",
    ]);
  });

  it("2025: festivos trasladados coinciden con el calendario oficial", () => {
    const f = festivosColombia(2025).map((x) => x.fecha);
    for (const d of ["2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", "2025-06-02", "2025-06-23", "2025-06-30", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17"]) {
      expect(f).toContain(d);
    }
  });

  it("identifica días hábiles en hora de Bogotá", () => {
    expect(esFestivo(bog("2026-07-20T10:00"))).toBe(true);
    expect(esDiaHabil(bog("2026-07-20T10:00"))).toBe(false); // lunes festivo
    expect(esDiaHabil(bog("2026-07-21T10:00"))).toBe(true);
    expect(esDiaHabil(bog("2026-09-26T10:00"))).toBe(false); // sábado
    expect(esDiaHabil(bog("2026-09-27T10:00"))).toBe(false); // domingo
    // 21:30 del lunes 20 de julio en Bogotá ya es martes en UTC, pero sigue siendo festivo local
    expect(esDiaHabil(bog("2026-07-20T21:30"))).toBe(false);
  });
});

describe("suma de días hábiles", () => {
  it("15 días hábiles saltando fines de semana, San José y Semana Santa", () => {
    // Viernes 20/03/2026: 23/03 es festivo; 02 y 03/04 son Jueves y Viernes Santo
    const limite = sumarDiasHabiles(bog("2026-03-20T10:00"), 15);
    expect(limite.toISOString()).toBe(bog("2026-04-15T23:59:59.999").toISOString());
  });

  it("el día de radicación no cuenta y el plazo termina al final del día", () => {
    const limite = sumarDiasHabiles(bog("2026-09-28T08:00"), 1); // lunes → martes
    expect(limite.toISOString()).toBe(bog("2026-09-29T23:59:59.999").toISOString());
    expect(sumarDiasHabiles(bog("2026-09-28T08:00"), 0).toISOString()).toBe(bog("2026-09-28T23:59:59.999").toISOString());
  });

  it("un reporte del viernes antes de un puente vence el martes", () => {
    const limite = sumarDiasHabiles(bog("2026-08-14T16:00"), 1); // 17/08 festivo
    expect(limite.toISOString()).toBe(bog("2026-08-18T23:59:59.999").toISOString());
  });

  it("cuenta días hábiles entre dos fechas", () => {
    expect(diasHabilesEntre(bog("2026-03-20T10:00"), bog("2026-04-15T12:00"))).toBe(15);
    expect(diasHabilesEntre(bog("2026-09-25T10:00"), bog("2026-09-27T10:00"))).toBe(0);
  });
});

describe("SLA por tipo y prioridad", () => {
  it("PQRS: 15 días hábiles sin importar la prioridad", () => {
    for (const tipo of ["PETICION", "QUEJA", "RECLAMO", "SUGERENCIA"] as const) {
      expect(diasSla(tipo, "URGENTE")).toBe(15);
      expect(diasSla(tipo, "BAJA")).toBe(15);
    }
  });

  it("daños: urgente 1, alta 3, media 7, baja 15", () => {
    expect(diasSla("DANO_ZONA_COMUN", "URGENTE")).toBe(1);
    expect(diasSla("DANO_ZONA_COMUN", "ALTA")).toBe(3);
    expect(diasSla("DANO_UNIDAD", "MEDIA")).toBe(7);
    expect(diasSla("DANO_UNIDAD", "BAJA")).toBe(15);
    expect(diasSla("SEGURIDAD", "ALTA")).toBe(3);
    expect(prioridadSugerida("SEGURIDAD")).toBe("ALTA");
  });

  it("fecha límite de un daño de prioridad alta en Navidad", () => {
    const l = fechaLimiteSla("DANO_ZONA_COMUN", "ALTA", bog("2026-12-23T09:00")); // 24, (25 festivo), 28, 29
    expect(l.toISOString()).toBe(bog("2026-12-29T23:59:59.999").toISOString());
  });

  it("estado del SLA", () => {
    const fechaLimite = bog("2026-10-01T23:59:59");
    expect(estadoSla({ fechaLimite, estado: "EN_PROCESO" }, bog("2026-10-02T08:00"))).toBe("VENCIDO");
    expect(estadoSla({ fechaLimite, estado: "EN_PROCESO" }, bog("2026-10-01T10:00"))).toBe("POR_VENCER");
    expect(estadoSla({ fechaLimite, estado: "ABIERTO" }, bog("2026-09-28T10:00"))).toBe("A_TIEMPO");
    expect(estadoSla({ fechaLimite, estado: "RESUELTO", resueltoEn: bog("2026-09-30T10:00") })).toBe("CUMPLIDO");
    expect(estadoSla({ fechaLimite, estado: "CERRADO", resueltoEn: bog("2026-10-03T10:00") })).toBe("INCUMPLIDO");
  });

  it("formato del radicado", () => {
    expect(formatoRadicado(2026, 1)).toBe("2026-0001");
    expect(formatoRadicado(2026, 12345)).toBe("2026-12345");
  });
});

describe("transiciones de estado", () => {
  it("permite el flujo normal de la mesa de ayuda", () => {
    expect(puedeTransicionar("ABIERTO", "EN_REVISION")).toBe(true);
    expect(puedeTransicionar("EN_REVISION", "ASIGNADO")).toBe(true);
    expect(puedeTransicionar("ASIGNADO", "EN_PROCESO")).toBe(true);
    expect(puedeTransicionar("EN_PROCESO", "EN_ESPERA_RESIDENTE")).toBe(true);
    expect(puedeTransicionar("EN_ESPERA_RESIDENTE", "EN_PROCESO")).toBe(true);
    expect(puedeTransicionar("EN_PROCESO", "RESUELTO")).toBe(true);
    expect(puedeTransicionar("RESUELTO", "CERRADO")).toBe(true);
    expect(puedeTransicionar("CERRADO", "REABIERTO")).toBe(true);
    expect(puedeTransicionar("REABIERTO", "EN_PROCESO")).toBe(true);
  });

  it("bloquea saltos inválidos", () => {
    expect(puedeTransicionar("CERRADO", "EN_PROCESO")).toBe(false);
    expect(puedeTransicionar("RESUELTO", "EN_PROCESO")).toBe(false);
    expect(puedeTransicionar("EN_PROCESO", "CERRADO")).toBe(false);
    expect(puedeTransicionar("ABIERTO", "REABIERTO")).toBe(false);
    // ningún estado vuelve a ABIERTO
    for (const destinos of Object.values(TRANSICIONES)) expect(destinos).not.toContain("ABIERTO");
  });

  it("reapertura y calificación", () => {
    const ahora = bog("2026-09-27T10:00");
    expect(puedeReabrir({ estado: "RESUELTO" }, ahora)).toBe(true);
    expect(puedeReabrir({ estado: "CERRADO", cerradoEn: bog("2026-09-10T10:00") }, ahora)).toBe(true);
    expect(puedeReabrir({ estado: "CERRADO", cerradoEn: bog("2026-07-01T10:00") }, ahora)).toBe(false);
    expect(puedeReabrir({ estado: "EN_PROCESO" }, ahora)).toBe(false);
    expect(puedeCalificar({ estado: "RESUELTO", calificacion: null })).toBe(true);
    expect(puedeCalificar({ estado: "CERRADO", calificacion: 4 })).toBe(false);
    expect(puedeCalificar({ estado: "EN_PROCESO", calificacion: null })).toBe(false);
  });
});

describe("estadísticas", () => {
  it("tiempo de resolución, cumplimiento de SLA y satisfacción", () => {
    const base = bog("2026-09-01T08:00");
    const h = (n: number) => new Date(base.getTime() + n * 3_600_000);
    const rows: TicketStatRow[] = [
      { tipo: "DANO_ZONA_COMUN", estado: "CERRADO", createdAt: base, fechaLimite: h(48), primeraRespuestaEn: h(2), resueltoEn: h(24), calificacion: 5, reabiertoVeces: 0 },
      { tipo: "DANO_ZONA_COMUN", estado: "RESUELTO", createdAt: base, fechaLimite: h(48), primeraRespuestaEn: h(4), resueltoEn: h(72), calificacion: 3, reabiertoVeces: 1 },
      { tipo: "PETICION", estado: "EN_PROCESO", createdAt: base, fechaLimite: h(10), primeraRespuestaEn: null, resueltoEn: null, calificacion: null, reabiertoVeces: 0 },
    ];
    const s = calcularEstadisticas(rows, h(100));
    expect(s.total).toBe(3);
    expect(s.porTipo[0]).toEqual({ tipo: "DANO_ZONA_COMUN", total: 2 });
    expect(s.horasResolucionPromedio).toBe(48);
    expect(s.horasPrimeraRespuesta).toBe(3);
    expect(s.cumplimientoSla).toBe(50);
    expect(s.satisfaccionPromedio).toBe(4);
    expect(s.vencidos).toBe(1);
    expect(s.abiertos).toBe(1);
    expect(s.reabiertos).toBe(1);
  });
});
