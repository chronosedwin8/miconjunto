import zlib from "node:zlib";

/**
 * Extracción de texto plano de PDFs SIN dependencias externas (mejor esfuerzo).
 * Descomprime los flujos FlateDecode y lee los operadores de texto Tj / TJ / ' / ".
 * Funciona con PDFs generados por software (react-pdf, Word, LibreOffice) que usan fuentes
 * con codificación estándar (WinAnsi). Para PDFs escaneados (imágenes) o con fuentes
 * incrustadas con codificación propia devuelve null: el asistente IA simplemente no tendrá texto.
 */
export function extraerTextoPdf(buf: Buffer, maxChars = 200_000): string | null {
  try {
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
    const raw = buf.toString("latin1");
    const partes: string[] = [];
    const re = /stream\r?\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const inicio = m.index + m[0].length;
      const fin = raw.indexOf("endstream", inicio);
      if (fin < 0) break;
      const dict = raw.slice(Math.max(0, m.index - 400), m.index);
      const ultimoDict = dict.slice(dict.lastIndexOf("<<"));
      if (/\/Subtype\s*\/Image|\/Length1|\/FontFile/.test(ultimoDict)) {
        re.lastIndex = fin;
        continue;
      }
      let datos = buf.subarray(inicio, fin);
      if (/\/FlateDecode/.test(ultimoDict)) {
        try {
          datos = zlib.inflateSync(datos);
        } catch {
          try {
            datos = zlib.inflateSync(datos.subarray(0, datos.length - 1));
          } catch {
            re.lastIndex = fin;
            continue;
          }
        }
      } else if (/\/Filter/.test(ultimoDict)) {
        re.lastIndex = fin;
        continue;
      }
      const texto = textoDeContenido(datos.toString("latin1"));
      if (texto) partes.push(texto);
      re.lastIndex = fin;
      if (partes.join("\n").length > maxChars) break;
    }
    const out = partes
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxChars);
    // Heurística: si casi no hay letras legibles, no sirve.
    const letras = (out.match(/[a-záéíóúñü]/gi) ?? []).length;
    return out.length >= 20 && letras / out.length > 0.4 ? out : null;
  } catch {
    return null;
  }
}

function decodeLiteral(s: string) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = s[++i];
    if (n === undefined) break;
    if (n === "n") out += "\n";
    else if (n === "r") out += "";
    else if (n === "t") out += " ";
    else if (n === "b" || n === "f") out += "";
    else if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(s[i + 1] ?? "")) oct += s[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else if (n === "\r" || n === "\n") {
      /* continuación de línea */
    } else out += n;
  }
  return out;
}

function decodeHex(h: string) {
  const clean = h.replace(/\s+/g, "");
  let out = "";
  for (let i = 0; i < clean.length; i += 2) out += String.fromCharCode(parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  return out;
}

/** Lee los strings de los operadores de texto de un flujo de contenido. */
export function textoDeContenido(content: string): string {
  if (!/\bBT\b/.test(content)) return "";
  const out: string[] = [];
  // Tokens: literales (...) con paréntesis balanceados, hex <...>, arreglos [...] y operadores.
  let i = 0;
  let linea = "";
  const pila: string[] = [];
  const flush = () => {
    if (linea.trim()) out.push(linea.trim());
    linea = "";
  };
  while (i < content.length) {
    const c = content[i];
    if (c === "(") {
      let depth = 1;
      let j = i + 1;
      let buf = "";
      while (j < content.length && depth > 0) {
        const d = content[j];
        if (d === "\\") {
          buf += d + (content[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (d === "(") depth++;
        else if (d === ")") depth--;
        if (depth > 0) buf += d;
        j++;
      }
      pila.push(decodeLiteral(buf));
      i = j;
      continue;
    }
    if (c === "<" && content[i + 1] !== "<") {
      const j = content.indexOf(">", i);
      if (j < 0) break;
      pila.push(decodeHex(content.slice(i + 1, j)));
      i = j + 1;
      continue;
    }
    if (c === "]") {
      // Arreglo TJ: números grandes negativos = espacio entre palabras.
      i++;
      continue;
    }
    if (/[A-Za-z'"]/.test(c)) {
      let j = i;
      while (j < content.length && /[A-Za-z'"*]/.test(content[j])) j++;
      const op = content.slice(i, j);
      if (op === "Tj" || op === "'" || op === '"') {
        if (op !== "Tj") flush();
        linea += pila.join("");
        pila.length = 0;
      } else if (op === "TJ") {
        linea += pila.join("");
        pila.length = 0;
      } else if (op === "Td" || op === "TD" || op === "T*" || op === "Tm") {
        flush();
        pila.length = 0;
      } else if (op === "ET") {
        flush();
        pila.length = 0;
      } else if (op !== "BT") {
        // Otros operadores: no acumulan texto.
      }
      i = j;
      continue;
    }
    if (c === "-" || /[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < content.length && /[0-9.]/.test(content[j])) j++;
      const n = Number(content.slice(i, j));
      if (pila.length && n < -200) pila.push(" ");
      i = j;
      continue;
    }
    i++;
  }
  flush();
  return out.join("\n");
}
