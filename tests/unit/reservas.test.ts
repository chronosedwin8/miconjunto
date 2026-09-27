import { describe, expect, it } from "vitest";
import {
  buscarSolape,
  diaSemana,
  domingoPascua,
  fechaHoraBogota,
  fechaLocal,
  festivosColombia,
  franjasDelDia,
  haySolape,
  horarioDia,
  minutosLocal,
  politicaCancelacion,
  resumenDia,
  validarSolicitud,
  valoresReserva,
  type ContextoValidacion,
  type ZonaReglas,
} from "@/lib/reservas/reglas";
import { calcularIva } from "@/lib/cartera/calculos";

const T = (s: string) => new Date(s);
const bog = (f: string, h: string) => fechaHoraBogota(f, h);

describe("traslapes (haySolape)", () => {
  const a = { inicio: T("2026-10-10T15:00:00Z"), fin: T("2026-10-10T17:00:00Z") };
  it("detecta traslape parcial y contenido", () => {
    expect(haySolape(a, { inicio: T("2026-10-10T16:00:00Z"), fin: T("2026-10-10T18:00:00Z") })).toBe(true);
    expect(haySolape(a, { inicio: T("2026-10-10T14:00:00Z"), fin: T("2026-10-10T15:30:00Z") })).toBe(true);
    expect(haySolape(a, { inicio: T("2026-10-10T15:30:00Z"), fin: T("2026-10-10T16:00:00Z") })).toBe(true);
    expect(haySolape(a, { inicio: T("2026-10-10T14:00:00Z"), fin: T("2026-10-10T18:00:00Z") })).toBe(true);
    expect(haySolape(a, a)).toBe(true);
  });
  it("reservas contiguas (fin = inicio) no se traslapan", () => {
    expect(haySolape(a, { inicio: T("2026-10-10T17:00:00Z"), fin: T("2026-10-10T19:00:00Z") })).toBe(false);
    expect(haySolape(a, { inicio: T("2026-10-10T13:00:00Z"), fin: T("2026-10-10T15:00:00Z") })).toBe(false);
  });
  it("es simétrico y encuentra el primer choque", () => {
    const b = { inicio: T("2026-10-10T16:59:00Z"), fin: T("2026-10-10T20:00:00Z") };
    expect(haySolape(a, b)).toBe(haySolape(b, a));
    expect(buscarSolape(b, [{ ...a, id: 1 }])).toMatchObject({ id: 1 });
    expect(buscarSolape({ inicio: T("2026-10-11T00:00:00Z"), fin: T("2026-10-11T01:00:00Z") }, [a])).toBeNull();
  });
});

describe("fechas en hora de Bogotá (UTC−5)", () => {
  it("convierte fecha/hora local a UTC y de vuelta", () => {
    const d = bog("2026-10-10", "20:30");
    expect(d.toISOString()).toBe("2026-10-11T01:30:00.000Z");
    expect(fechaLocal(d)).toBe("2026-10-10");
    expect(minutosLocal(d)).toBe(20 * 60 + 30);
    expect(diaSemana("2026-09-27")).toBe(0); // domingo
  });
});

describe("festivos de Colombia (Ley Emiliani)", () => {
  it("calcula Pascua", () => {
    expect(domingoPascua(2026)).toBe("2026-04-05");
    expect(domingoPascua(2025)).toBe("2025-04-20");
  });
  it("festivos 2026 trasladados al lunes", () => {
    const f = new Map(festivosColombia(2026).map((x) => [x.fecha, x.nombre]));
    expect(f.size).toBe(18);
    expect(f.get("2026-01-12")).toMatch(/Reyes/); // 6 de enero (martes) → lunes 12
    expect(f.get("2026-04-02")).toBe("Jueves Santo");
    expect(f.get("2026-04-03")).toBe("Viernes Santo");
    expect(f.get("2026-05-18")).toMatch(/Ascensión/);
    expect(f.get("2026-06-08")).toBe("Corpus Christi");
    expect(f.get("2026-06-15")).toMatch(/Sagrado/);
    expect(f.get("2026-07-20")).toMatch(/Independencia/);
    expect(f.get("2026-12-08")).toMatch(/Inmaculada/);
  });
});

const zona: ZonaReglas = {
  reservable: true,
  estado: "ACTIVA",
  horario: { "0": { abre: "08:00", cierra: "23:00" }, "1": null, "2": { abre: "08:00", cierra: "23:00" }, "3": { abre: "08:00", cierra: "23:00" }, "4": { abre: "08:00", cierra: "23:00" }, "5": { abre: "08:00", cierra: "23:00" }, "6": { abre: "08:00", cierra: "00:00" } },
  capacidad: 80,
  duracionMinimaMin: 240,
  duracionMaximaMin: 480,
  anticipacionMinimaHoras: 72,
  anticipacionMaximaDias: 60,
  maxReservasMesUnidad: 2,
};
const ahora = bog("2026-10-01", "10:00");
const ctxVacio = (extra: Partial<ContextoValidacion> = {}): ContextoValidacion => ({ ahora, ocupadas: [], bloqueos: [], reservasUnidad: [], ...extra });
// sábado 10 de octubre de 2026
const sol = (hIni: string, hFin: string, fecha = "2026-10-10", asistentes = 30) => ({ inicio: bog(fecha, hIni), fin: bog(fecha, hFin), asistentes });

describe("horario de la zona", () => {
  it("interpreta cierre a medianoche y días cerrados", () => {
    expect(horarioDia(zona.horario, 6)).toEqual({ abre: 480, cierra: 1440 });
    expect(horarioDia(zona.horario, 1)).toBeNull();
  });
  it("acepta una reserva dentro del horario", () => {
    expect(validarSolicitud(zona, sol("14:00", "20:00"), ctxVacio())).toEqual([]);
  });
  it("rechaza fuera de horario y días cerrados", () => {
    expect(validarSolicitud(zona, sol("06:00", "11:00"), ctxVacio()).join()).toMatch(/Fuera del horario/);
    expect(validarSolicitud(zona, sol("19:00", "23:30", "2026-10-07"), ctxVacio()).join()).toMatch(/Fuera del horario/);
    expect(validarSolicitud(zona, sol("10:00", "15:00", "2026-10-12"), ctxVacio()).join()).toMatch(/no abre los lunes/);
  });
  it("permite terminar a medianoche si la zona cierra a las 24:00", () => {
    const s = { inicio: bog("2026-10-10", "19:00"), fin: bog("2026-10-11", "00:00"), asistentes: 10 };
    expect(validarSolicitud(zona, s, ctxVacio())).toEqual([]);
  });
});

describe("reglas de negocio", () => {
  it("duración mínima y máxima", () => {
    expect(validarSolicitud(zona, sol("14:00", "16:00"), ctxVacio()).join()).toMatch(/al menos 4 horas/);
    expect(validarSolicitud(zona, sol("08:00", "18:00"), ctxVacio()).join()).toMatch(/máximo 8 horas/);
  });
  it("anticipación mínima y máxima", () => {
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-10-02"), ctxVacio()).join()).toMatch(/72 horas/);
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-12-20"), ctxVacio()).join()).toMatch(/hasta 60 días/);
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-09-26"), ctxVacio()).join()).toMatch(/pasada/);
  });
  it("capacidad y MAX_ASISTENTES", () => {
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-10-10", 90), ctxVacio()).join()).toMatch(/capacidad máxima es de 80/);
    const r = validarSolicitud(zona, sol("14:00", "18:00", "2026-10-10", 50), ctxVacio({ reglas: [{ tipo: "MAX_ASISTENTES", valor: { max: 40 } }] }));
    expect(r.join()).toMatch(/Máximo 40 asistentes/);
  });
  it("SOLO_FINES_SEMANA acepta sábados, domingos y festivos", () => {
    const reglas = [{ tipo: "SOLO_FINES_SEMANA", valor: {} }];
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-10-10"), ctxVacio({ reglas }))).toEqual([]);
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-10-14"), ctxVacio({ reglas })).join()).toMatch(/fines de semana/);
    // 2026-10-12 es lunes festivo (Diversidad Étnica), pero la zona cierra los lunes
    const z2 = { ...zona, horario: { ...zona.horario, "1": { abre: "08:00", cierra: "23:00" } } };
    expect(validarSolicitud(z2, sol("14:00", "18:00", "2026-10-12"), ctxVacio({ reglas, festivos: new Set(["2026-10-12"]) }))).toEqual([]);
  });
  it("DIAS_PERMITIDOS y UN_TURNO_POR_DIA", () => {
    expect(validarSolicitud(zona, sol("14:00", "18:00"), ctxVacio({ reglas: [{ tipo: "DIAS_PERMITIDOS", valor: { dias: [0] } }] })).join()).toMatch(/solo se reserva: domingo/);
    const previa = { inicio: bog("2026-10-10", "08:00"), fin: bog("2026-10-10", "12:00") };
    expect(validarSolicitud(zona, sol("14:00", "18:00"), ctxVacio({ reglas: [{ tipo: "UN_TURNO_POR_DIA", valor: {} }], reservasUnidad: [previa] })).join()).toMatch(/ya tiene un turno/);
  });
  it("traslape con otras reservas y bloqueos", () => {
    const ocupada = { inicio: bog("2026-10-10", "16:00"), fin: bog("2026-10-10", "20:00") };
    expect(validarSolicitud(zona, sol("14:00", "18:00"), ctxVacio({ ocupadas: [ocupada] })).join()).toMatch(/ocupado/);
    expect(validarSolicitud(zona, sol("20:00", "24:00"), ctxVacio({ ocupadas: [ocupada] }))).toEqual([]);
    const bloqueo = { inicio: bog("2026-10-10", "00:00"), fin: bog("2026-10-11", "00:00"), motivo: "Mantenimiento" };
    expect(validarSolicitud(zona, sol("14:00", "18:00"), ctxVacio({ bloqueos: [bloqueo] })).join()).toMatch(/bloqueada.*Mantenimiento/);
  });
  it("máximo de reservas por unidad al mes", () => {
    const previas = [
      { inicio: bog("2026-10-03", "10:00"), fin: bog("2026-10-03", "14:00") },
      { inicio: bog("2026-10-04", "10:00"), fin: bog("2026-10-04", "14:00") },
    ];
    expect(validarSolicitud(zona, sol("14:00", "18:00"), ctxVacio({ reservasUnidad: previas })).join()).toMatch(/máximo 2/);
    // reservas de otro mes no cuentan
    expect(validarSolicitud(zona, sol("14:00", "18:00", "2026-11-07"), ctxVacio({ reservasUnidad: previas }))).toEqual([]);
  });
  it("zona inactiva o no reservable", () => {
    expect(validarSolicitud({ ...zona, estado: "MANTENIMIENTO" }, sol("14:00", "18:00"), ctxVacio()).join()).toMatch(/mantenimiento/);
    expect(validarSolicitud({ ...zona, reservable: false }, sol("14:00", "18:00"), ctxVacio()).join()).toMatch(/no se puede reservar/);
  });
});

describe("franjas del calendario", () => {
  const dia = {
    fecha: "2026-10-10",
    festivo: null,
    abre: "08:00",
    cierra: "23:00",
    bloqueos: [],
    ocupados: [
      { inicio: bog("2026-10-10", "12:00").toISOString(), fin: bog("2026-10-10", "16:00").toISOString(), propia: false },
      { inicio: bog("2026-10-10", "18:00").toISOString(), fin: bog("2026-10-10", "22:00").toISOString(), propia: true },
    ],
  };
  it("marca libres, ocupadas (ajenas) y propias, y limita la duración por el siguiente choque", () => {
    const fr = franjasDelDia(dia, zona, ahora);
    const by = Object.fromEntries(fr.map((f) => [f.hora, f]));
    expect(by["08:00"].estado).toBe("LIBRE");
    expect(by["08:00"].duracionesPosibles).toEqual([240]); // 08–12, luego choca
    expect(by["12:00"].estado).toBe("OCUPADA");
    expect(by["18:00"].estado).toBe("PROPIA");
    expect(by["16:00"].estado).toBe("OCUPADA"); // 16–20 chocaría con la propia 18:00
    expect(fr.at(-1)!.hora).toBe("19:00"); // última franja que admite 4 h antes de las 23:00
    expect(resumenDia(dia, zona, ahora)).toBe("PARCIAL");
  });
  it("respeta la anticipación mínima", () => {
    const fr = franjasDelDia({ ...dia, ocupados: [] }, zona, bog("2026-10-07", "12:00"));
    expect(fr.find((f) => f.hora === "10:00")!.estado).toBe("PASADA");
    expect(fr.find((f) => f.hora === "13:00")!.estado).toBe("LIBRE");
  });
});

describe("tarifa, IVA y política de cancelación", () => {
  it("calcula base, IVA 19 % y depósito aparte", () => {
    expect(valoresReserva({ tarifa: 250000, gravaIva: true, tarifaIva: 19, deposito: 200000 })).toEqual({ base: 250000, iva: 47500, total: 297500, deposito: 200000, totalAPagar: 497500 });
    expect(valoresReserva({ tarifa: 60000, gravaIva: true, tarifaIva: 19, deposito: 0 }).iva).toBe(calcularIva(60000, 19));
    expect(valoresReserva({ tarifa: 0, gravaIva: true, tarifaIva: 19, deposito: 0 })).toMatchObject({ iva: 0, total: 0 });
    expect(valoresReserva({ tarifa: 100000, gravaIva: false, tarifaIva: 19, deposito: 0 }).iva).toBe(0);
    expect(calcularIva(33333, 19)).toBe(6333);
  });
  it("reembolsa si cancela a tiempo y retiene si no", () => {
    const base = { pagada: true, inicio: bog("2026-10-10", "14:00"), horasReembolso: 48, valor: 297500, deposito: 200000 };
    expect(politicaCancelacion({ ...base, ahora: bog("2026-10-07", "14:00") })).toMatchObject({ tipo: "REEMBOLSO", reembolsoAlquiler: 297500, reembolsoDeposito: 200000 });
    expect(politicaCancelacion({ ...base, ahora: bog("2026-10-09", "14:00") })).toMatchObject({ tipo: "RETENCION", retenido: 297500, reembolsoDeposito: 200000 });
    expect(politicaCancelacion({ ...base, ahora: bog("2026-10-09", "14:00"), porAdministracion: true }).tipo).toBe("REEMBOLSO");
    expect(politicaCancelacion({ ...base, pagada: false, ahora: bog("2026-10-09", "14:00") }).tipo).toBe("SIN_PAGO");
  });
});
