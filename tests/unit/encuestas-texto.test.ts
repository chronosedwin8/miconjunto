import { describe, expect, it } from "vitest";
import { parsearPreguntasTexto } from "@/lib/encuestas/texto";

describe("parsearPreguntasTexto", () => {
  it("convierte líneas en preguntas con opciones, marcas y opcionales", () => {
    const r = parsearPreguntasTexto(`1. ¿Qué horario prefieres?
- Mañana
* Tarde
• Mañana
[varias] ¿Qué zonas usas?
a) Gimnasio
b) BBQ
[escala] ¿Cómo calificas la vigilancia?

¿Qué mejorarías? (opcional)`);
    expect(r).toEqual([
      { tipo: "UNICA", texto: "¿Qué horario prefieres?", opciones: ["Mañana", "Tarde"], requerida: true },
      { tipo: "MULTIPLE", texto: "¿Qué zonas usas?", opciones: ["Gimnasio", "BBQ"], requerida: true },
      { tipo: "ESCALA", texto: "¿Cómo calificas la vigilancia?", opciones: [], requerida: true },
      { tipo: "TEXTO", texto: "¿Qué mejorarías?", opciones: [], requerida: false },
    ]);
  });

  it("una pregunta de opción con menos de dos opciones queda como texto libre", () => {
    expect(parsearPreguntasTexto("[varias] ¿Algo?\n- Solo una")[0].tipo).toBe("TEXTO");
  });

  it("soporta muchas preguntas", () => {
    const txt = Array.from({ length: 80 }, (_, i) => `Pregunta ${i + 1}\n- Sí\n- No`).join("\n");
    const r = parsearPreguntasTexto(txt);
    expect(r).toHaveLength(80);
    expect(r.every((p) => p.tipo === "UNICA" && p.opciones.length === 2)).toBe(true);
  });
});
