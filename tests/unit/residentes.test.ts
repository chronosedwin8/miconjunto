import { describe, expect, it } from "vitest";
import {
  calcularIndicadores,
  datosAnonimizados,
  dentroDeHorario,
  describirHorario,
  esAdultoMayor,
  esMenorDeEdad,
  estadoVencimiento,
  hashDocumento,
  normalizarHorario,
  normalizarPlaca,
  placaValida,
  reglaVinculoResidente,
} from "@/lib/residentes/calculos";

const REF = new Date("2026-09-27T12:00:00-05:00");
const nacido = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

describe("edades: menores y adultos mayores", () => {
  it("es menor hasta el día antes de cumplir 18", () => {
    expect(esMenorDeEdad(nacido(2008, 9, 28), REF)).toBe(true); // cumple 18 mañana
    expect(esMenorDeEdad(nacido(2008, 9, 27), REF)).toBe(false); // cumple hoy
    expect(esMenorDeEdad(null, REF)).toBe(false);
  });
  it("adulto mayor desde los 60 años cumplidos", () => {
    expect(esAdultoMayor(nacido(1966, 9, 27), REF)).toBe(true);
    expect(esAdultoMayor(nacido(1966, 9, 28), REF)).toBe(false);
    expect(esAdultoMayor(undefined, REF)).toBe(false);
  });
});

describe("placas", () => {
  it("normaliza a mayúsculas sin espacios ni guiones", () => {
    expect(normalizarPlaca(" abc-123 ")).toBe("ABC123");
    expect(normalizarPlaca("xyz 12d")).toBe("XYZ12D");
  });
  it("valida formatos colombianos por tipo", () => {
    expect(placaValida("abc 123", "CARRO")).toBe(true);
    expect(placaValida("ABC12D", "CARRO")).toBe(false);
    expect(placaValida("abc12d", "MOTO")).toBe(true);
    expect(placaValida("ABC123", "MOTO")).toBe(false);
    expect(placaValida("B1", "BICICLETA")).toBe(true);
  });
});

describe("horario permitido de empleados", () => {
  it("normaliza días y valida horas", () => {
    expect(normalizarHorario({ dias: ["5", "1", "1", 3], desde: "07:00", hasta: "16:00" })).toEqual({ dias: [1, 3, 5], desde: "07:00", hasta: "16:00" });
    expect(normalizarHorario({ dias: [], desde: "", hasta: "" })).toBeNull();
    expect(() => normalizarHorario({ dias: [1], desde: "17:00", hasta: "08:00" })).toThrow(/posterior/);
    expect(() => normalizarHorario({ dias: [], desde: "08:00", hasta: "10:00" })).toThrow(/día/);
  });
  it("describe y evalúa el horario", () => {
    const h = { dias: [1, 2, 3, 4, 5], desde: "07:00", hasta: "16:00" };
    expect(describirHorario(h)).toBe("Lun a Vie · 07:00 a 16:00");
    expect(dentroDeHorario(h, 2, "08:30")).toBe(true);
    expect(dentroDeHorario(h, 6, "08:30")).toBe(false);
    expect(dentroDeHorario(h, 2, "18:00")).toBe(false);
  });
});

describe("reglas de vínculos registrados por residentes", () => {
  it("el arrendatario lo registra solo el propietario y queda pendiente de aprobación", () => {
    expect(reglaVinculoResidente("ARRENDATARIO", true)).toEqual({ permitido: true, estado: "PENDIENTE_APROBACION" });
    expect(reglaVinculoResidente("ARRENDATARIO", false).permitido).toBe(false);
    expect(reglaVinculoResidente("PROPIETARIO", true).permitido).toBe(false);
    expect(reglaVinculoResidente("FAMILIAR", false)).toEqual({ permitido: true, estado: "ACTIVO" });
    expect(reglaVinculoResidente("AUTORIZADO_MENORES", false).estado).toBe("ACTIVO");
  });
});

describe("anonimización (habeas data)", () => {
  it("reemplaza identidad por 'Titular retirado', documento por hash y borra contacto y salud", () => {
    const d = datosAnonimizados({ id: "p1", conjuntoId: "c1", tipoDocumento: "CC", numeroDocumento: "1234567" });
    expect(d.nombres).toBe("Titular retirado");
    expect(d.numeroDocumento).toMatch(/^ANON-[0-9A-F]{20}$/);
    expect(d.numeroDocumento).not.toContain("1234567");
    expect(d.telefono).toBeNull();
    expect(d.email).toBeNull();
    expect(d.tipoSangre).toBeNull();
    expect(d.movilidadReducida).toBe(false);
    expect(d.anonimizada).toBe(true);
  });
  it("el hash es estable y distinto por persona", () => {
    expect(hashDocumento("c1", "CC", "1", "a")).toBe(hashDocumento("c1", "CC", "1", "a"));
    expect(hashDocumento("c1", "CC", "1", "a")).not.toBe(hashDocumento("c1", "CC", "1", "b"));
  });
});

describe("indicadores de población", () => {
  it("cuenta menores, adultos mayores y movilidad por torre y piso", () => {
    const ind = calcularIndicadores(
      [
        { fechaNacimiento: nacido(2015, 1, 1), movilidadReducida: false, requiereAsistenciaEvacuacion: false, unidades: [{ torre: "Torre 1", piso: 1 }] },
        { fechaNacimiento: nacido(1945, 1, 1), movilidadReducida: true, requiereAsistenciaEvacuacion: true, unidades: [{ torre: "Torre 1", piso: 1 }] },
        { fechaNacimiento: nacido(1980, 1, 1), movilidadReducida: false, requiereAsistenciaEvacuacion: true, unidades: [{ torre: "Torre 2", piso: 8 }] },
        { fechaNacimiento: null, movilidadReducida: false, requiereAsistenciaEvacuacion: false, unidades: [] },
      ],
      REF,
    );
    expect(ind.totalPersonas).toBe(4);
    expect(ind.menores).toBe(1);
    expect(ind.adultosMayores).toBe(1);
    expect(ind.sinFechaNacimiento).toBe(1);
    expect(ind.movilidadReducida).toBe(2);
    expect(ind.movilidadPorTorrePiso).toEqual([
      { torre: "Torre 1", piso: 1, personas: 1 },
      { torre: "Torre 2", piso: 8, personas: 1 },
    ]);
  });
});

describe("vencimientos (SOAT, tecnomecánica, antirrábica)", () => {
  it("clasifica vigente, por vencer (30 días) y vencido", () => {
    expect(estadoVencimiento(new Date(REF.getTime() - 86400000), REF)).toBe("VENCIDO");
    expect(estadoVencimiento(new Date(REF.getTime() + 10 * 86400000), REF)).toBe("POR_VENCER");
    expect(estadoVencimiento(new Date(REF.getTime() + 60 * 86400000), REF)).toBe("VIGENTE");
    expect(estadoVencimiento(null, REF)).toBeNull();
  });
});
