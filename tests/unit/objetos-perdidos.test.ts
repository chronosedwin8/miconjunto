import { describe, expect, it } from "vitest";
import {
  accionVencimiento,
  admiteCustodia,
  admiteDisposicion,
  admiteEntrega,
  admiteReclamo,
  calcularVencimiento,
  coloresDe,
  custodiaVencida,
  formatoCodigo,
  mejoresCoincidencias,
  normalizarTexto,
  palabrasClave,
  puntajeCoincidencia,
  UMBRAL_PROBABLE,
  UMBRAL_SUGERENCIA,
  type DatosCoincidencia,
} from "@/lib/objetos-perdidos/reglas";

const DIA = 86_400_000;
const base = new Date("2026-10-01T15:00:00Z");
const dias = (n: number) => new Date(base.getTime() + n * DIA);

const llavesPerdidas: DatosCoincidencia = {
  id: "p1",
  tipo: "PERDIDO",
  categoria: "LLAVES",
  titulo: "Llaves con llavero de Millonarios",
  descripcion: "Tres llaves con llavero azul del escudo de Millonarios",
  color: "Azul",
  lugar: "Gimnasio",
  zonaId: "z-gym",
  fecha: base,
};

const llavesEncontradas: DatosCoincidencia = {
  id: "e1",
  tipo: "ENCONTRADO",
  categoria: "LLAVES",
  titulo: "Llavero azul con 3 llaves",
  descripcion: "Llavero de fútbol con tres llaves, estaba junto al gimnasio",
  color: "azul oscuro",
  zonaId: "z-gym",
  fecha: dias(1),
};

describe("texto y colores", () => {
  it("normaliza tildes, mayúsculas y signos", () => {
    expect(normalizarTexto("  ¡Cédula  de CIUDADANÍA! ")).toBe("cedula de ciudadania");
  });

  it("extrae palabras clave sin stopwords, con raíz de plurales y género", () => {
    const k = palabrasClave("Las llaves con el llavero negro");
    expect(k.has("llav")).toBe(true); // llaves → llav
    expect(k.has("llaver")).toBe(true);
    expect(k.has("con")).toBe(false);
    expect(k.has("negr")).toBe(false); // los colores se comparan aparte
    expect(palabrasClave("gafa").has("gaf")).toBe(true);
    expect(palabrasClave("gafas").has("gaf")).toBe(true);
  });

  it("reconoce colores y sus variantes", () => {
    expect([...coloresDe("Billetera marrón", "café")]).toEqual(["cafe"]);
    expect(coloresDe("plateado").has("gris")).toBe(true);
    expect(coloresDe("Negra").has("negro")).toBe(true);
    expect(coloresDe("sin color").size).toBe(0);
  });
});

describe("puntaje de coincidencia perdido ↔ encontrado", () => {
  // Sin la zona en común, para que el puntaje no se sature en 100 al comparar variaciones.
  const sinZona: DatosCoincidencia = { ...llavesEncontradas, zonaId: null };

  it("misma categoría + palabras + color + zona + fechas cercanas = muy probable", () => {
    const r = puntajeCoincidencia(llavesPerdidas, llavesEncontradas);
    expect(r.puntaje).toBeGreaterThanOrEqual(UMBRAL_PROBABLE);
    expect(r.razones.join(" ")).toMatch(/Misma categoría/);
    expect(r.razones.join(" ")).toMatch(/Mismo color/);
    expect(r.razones.join(" ")).toMatch(/Misma zona/);
  });

  it("es simétrico respecto al orden de los argumentos", () => {
    expect(puntajeCoincidencia(llavesEncontradas, llavesPerdidas).puntaje).toBe(puntajeCoincidencia(llavesPerdidas, llavesEncontradas).puntaje);
  });

  it("dos reportes del mismo tipo nunca coinciden", () => {
    expect(puntajeCoincidencia(llavesPerdidas, { ...llavesEncontradas, tipo: "PERDIDO" }).puntaje).toBe(0);
  });

  it("categorías distintas (ninguna 'Otro') descartan", () => {
    expect(puntajeCoincidencia(llavesPerdidas, { ...llavesEncontradas, categoria: "BILLETERA" }).puntaje).toBe(0);
  });

  it("'Otro' no descarta pero puntúa menos", () => {
    const otro = puntajeCoincidencia(llavesPerdidas, { ...llavesEncontradas, categoria: "OTRO" }).puntaje;
    const igual = puntajeCoincidencia(llavesPerdidas, llavesEncontradas).puntaje;
    expect(otro).toBeGreaterThan(0);
    expect(otro).toBeLessThan(igual);
  });

  it("colores distintos penalizan", () => {
    const azul = puntajeCoincidencia(llavesPerdidas, sinZona).puntaje;
    const rojo = puntajeCoincidencia(llavesPerdidas, { ...sinZona, color: "rojo", descripcion: "Llavero de fútbol con tres llaves", titulo: "Llavero rojo con 3 llaves" }).puntaje;
    expect(rojo).toBeLessThan(azul - 20);
  });

  it("encontrado mucho antes de perderse se penaliza; la cercanía suma", () => {
    const cerca = puntajeCoincidencia(llavesPerdidas, { ...sinZona, fecha: dias(1) }).puntaje;
    const semana = puntajeCoincidencia(llavesPerdidas, { ...sinZona, fecha: dias(6) }).puntaje;
    const lejos = puntajeCoincidencia(llavesPerdidas, { ...sinZona, fecha: dias(45) }).puntaje;
    const antes = puntajeCoincidencia(llavesPerdidas, { ...sinZona, fecha: dias(-10) }).puntaje;
    expect(cerca).toBeGreaterThan(semana);
    expect(semana).toBeGreaterThan(lejos);
    expect(antes).toBeLessThan(lejos);
    // Un día de tolerancia (se reporta la pérdida al día siguiente).
    expect(puntajeCoincidencia(llavesPerdidas, { ...sinZona, fecha: dias(-0.5) }).puntaje).toBe(cerca);
  });

  it("la marca coincide aunque se escriba distinto", () => {
    const a: DatosCoincidencia = { tipo: "PERDIDO", categoria: "ELECTRONICO", titulo: "Audífonos", descripcion: "Audífonos blancos", marca: "Apple", fecha: base };
    const b: DatosCoincidencia = { tipo: "ENCONTRADO", categoria: "ELECTRONICO", titulo: "AirPods", descripcion: "Estuche", marca: "APPLE ", fecha: dias(2) };
    expect(puntajeCoincidencia(a, b).razones.join()).toMatch(/Misma marca/);
  });

  it("el puntaje se mantiene entre 0 y 100", () => {
    const r = puntajeCoincidencia(llavesPerdidas, { ...llavesEncontradas, color: "verde", marca: "x", fecha: dias(-40), zonaId: "otra" });
    expect(r.puntaje).toBeGreaterThanOrEqual(0);
    expect(r.puntaje).toBeLessThanOrEqual(100);
  });

  it("mejoresCoincidencias filtra por umbral, excluye el mismo tipo y ordena", () => {
    const candidatos: DatosCoincidencia[] = [
      { ...llavesEncontradas, id: "debil", titulo: "Llave suelta", descripcion: "Una llave", color: null, zonaId: null, fecha: dias(40) },
      llavesEncontradas,
      { ...llavesEncontradas, id: "billetera", categoria: "BILLETERA" },
      { ...llavesPerdidas, id: "otra-perdida" },
    ];
    const r = mejoresCoincidencias(llavesPerdidas, candidatos);
    expect(r.map((x) => x.objeto.id)).toEqual(["e1"]);
    expect(r[0].puntaje).toBeGreaterThanOrEqual(UMBRAL_SUGERENCIA);
    expect(mejoresCoincidencias(llavesPerdidas, candidatos, { umbral: 1 }).map((x) => x.objeto.id)).toEqual(["e1", "debil"]);
  });
});

describe("estados", () => {
  it("solo los encontrados sin dueño admiten reclamo y disposición", () => {
    expect(admiteReclamo({ tipo: "ENCONTRADO", estado: "EN_CUSTODIA" })).toBe(true);
    expect(admiteReclamo({ tipo: "ENCONTRADO", estado: "ABIERTO" })).toBe(true);
    expect(admiteReclamo({ tipo: "ENCONTRADO", estado: "RECLAMADO" })).toBe(false);
    expect(admiteReclamo({ tipo: "PERDIDO", estado: "ABIERTO" })).toBe(false);
    expect(admiteDisposicion({ tipo: "ENCONTRADO", estado: "EN_CUSTODIA" })).toBe(true);
    expect(admiteDisposicion({ tipo: "ENCONTRADO", estado: "DEVUELTO" })).toBe(false);
  });

  it("custodia solo para encontrados abiertos; entrega para encontrados activos", () => {
    expect(admiteCustodia({ tipo: "ENCONTRADO", estado: "ABIERTO" })).toBe(true);
    expect(admiteCustodia({ tipo: "ENCONTRADO", estado: "EN_CUSTODIA" })).toBe(false);
    expect(admiteEntrega({ tipo: "ENCONTRADO", estado: "RECLAMADO" })).toBe(true);
    expect(admiteEntrega({ tipo: "ENCONTRADO", estado: "DONADO" })).toBe(false);
    expect(admiteEntrega({ tipo: "PERDIDO", estado: "ABIERTO" })).toBe(false);
  });

  it("formatea el código consecutivo", () => {
    expect(formatoCodigo(2026, 1)).toBe("OP-2026-0001");
    expect(formatoCodigo(2026, 12345)).toBe("OP-2026-12345");
  });
});

describe("vencimientos", () => {
  const cfg = { diasCustodia: 60, diasPerdido: 90 };

  it("calcula el vencimiento según el tipo", () => {
    expect(calcularVencimiento("PERDIDO", base, cfg).getTime() - base.getTime()).toBe(90 * DIA);
    expect(calcularVencimiento("ENCONTRADO", base, cfg).getTime() - base.getTime()).toBe(60 * DIA);
  });

  it("pérdida: avisa una sola vez 7 días antes y cierra al vencer", () => {
    const venceEn = calcularVencimiento("PERDIDO", base, cfg);
    const o = { tipo: "PERDIDO" as const, estado: "ABIERTO" as const, venceEn };
    // El job corre una vez al día: exactamente un día cae en la ventana del aviso.
    const acciones = Array.from({ length: 95 }, (_, d) => accionVencimiento(o, new Date(base.getTime() + d * DIA + 3_600_000)));
    expect(acciones.filter((a) => a === "AVISAR_CIERRE")).toHaveLength(1);
    expect(acciones.indexOf("AVISAR_CIERRE")).toBe(83);
    expect(acciones.indexOf("CERRAR")).toBe(90);
    expect(accionVencimiento(o, new Date(venceEn.getTime() - 1))).toBeNull();
    expect(accionVencimiento({ ...o, estado: "DEVUELTO" }, new Date(venceEn.getTime() + DIA))).toBeNull();
  });

  it("custodia: pide disposición el día que vence y luego cada 7 días", () => {
    const venceEn = calcularVencimiento("ENCONTRADO", base, cfg);
    const o = { tipo: "ENCONTRADO" as const, estado: "EN_CUSTODIA" as const, venceEn };
    expect(accionVencimiento(o, new Date(venceEn.getTime() - DIA))).toBeNull();
    expect(accionVencimiento(o, new Date(venceEn.getTime() + 3_600_000))).toBe("PEDIR_DISPOSICION");
    expect(accionVencimiento(o, new Date(venceEn.getTime() + 3 * DIA))).toBeNull();
    expect(accionVencimiento(o, new Date(venceEn.getTime() + 7 * DIA + 60_000))).toBe("PEDIR_DISPOSICION");
    expect(accionVencimiento({ ...o, estado: "ABIERTO" }, new Date(venceEn.getTime() + DIA))).toBeNull();
    expect(custodiaVencida(o, new Date(venceEn.getTime() + 1))).toBe(true);
    expect(custodiaVencida(o, new Date(venceEn.getTime() - 1))).toBe(false);
  });

  it("sin fecha de vencimiento no hace nada", () => {
    expect(accionVencimiento({ tipo: "PERDIDO", estado: "ABIERTO", venceEn: null }, base)).toBeNull();
  });
});
