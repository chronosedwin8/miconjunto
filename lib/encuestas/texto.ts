/**
 * Convierte texto pegado en preguntas de encuesta, para crear muchas de una vez.
 *
 *   ¿Qué horario prefieres para la piscina?
 *   - Mañana
 *   - Tarde
 *   [varias] ¿Qué servicios usas?
 *   - Gimnasio
 *   - BBQ
 *   [escala] ¿Cómo calificas la vigilancia?
 *   ¿Qué mejorarías?
 *
 * Una línea normal es una pregunta; las líneas que empiezan por "-", "*", "•" o "a)" son opciones de la
 * pregunta anterior. Con opciones es de opción única ("[varias]" la vuelve múltiple); "[escala]" la vuelve
 * escala 1–5 y sin opciones queda como texto libre. "(opcional)" al final la marca como no obligatoria.
 */
export type TipoPregunta = "UNICA" | "MULTIPLE" | "ESCALA" | "TEXTO";
export type PreguntaTexto = { tipo: TipoPregunta; texto: string; opciones: string[]; requerida: boolean };

const OPCION = /^\s*(?:[-*•]|[a-zA-Z]\))\s+(.+)$/;
const MARCA = /^\s*\[(varias|multiple|múltiple|escala|texto|unica|única)\]\s*/i;

export function parsearPreguntasTexto(texto: string): PreguntaTexto[] {
  const out: (PreguntaTexto & { forzado?: TipoPregunta })[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const op = linea.match(OPCION);
    if (op && out.length) {
      out[out.length - 1].opciones.push(op[1].trim());
      continue;
    }
    let t = linea.trim().replace(/^\d+[.)]\s+/, "");
    let forzado: TipoPregunta | undefined;
    const m = t.match(MARCA);
    if (m) {
      const k = m[1].toLowerCase();
      forzado = k.startsWith("var") || k.startsWith("m") ? "MULTIPLE" : k === "escala" ? "ESCALA" : k === "texto" ? "TEXTO" : "UNICA";
      t = t.slice(m[0].length);
    }
    let requerida = true;
    if (/\(opcional\)\s*$/i.test(t)) {
      requerida = false;
      t = t.replace(/\s*\(opcional\)\s*$/i, "");
    }
    out.push({ tipo: "TEXTO", texto: t.trim(), opciones: [], requerida, forzado });
  }
  return out
    .filter((p) => p.texto)
    .map(({ forzado, ...p }) => {
      const opciones = [...new Set(p.opciones.filter(Boolean))];
      let tipo: TipoPregunta = forzado ?? (opciones.length >= 2 ? "UNICA" : "TEXTO");
      if ((tipo === "UNICA" || tipo === "MULTIPLE") && opciones.length < 2) tipo = "TEXTO";
      return { ...p, tipo, opciones: tipo === "UNICA" || tipo === "MULTIPLE" ? opciones : [] };
    });
}
