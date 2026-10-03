/**
 * Generador mínimo de PDF de solo texto (sin dependencias), útil para el seed y para pruebas:
 * Helvetica con codificación WinAnsi, ajuste de línea aproximado y varias páginas.
 * Para documentos con diseño usa `lib/pdf/kit.tsx` en route handlers.
 */
export type SeccionPdf = { titulo?: string; parrafos: string[] };

const W = 612; // Carta
const H = 792;
const M = 56;

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\xff]/g, "?");
}

function wrap(text: string, max: number) {
  const out: string[] = [];
  for (const par of text.split("\n")) {
    let line = "";
    for (const w of par.split(/\s+/)) {
      if (!w) continue;
      if ((line + " " + w).trim().length > max) {
        if (line) out.push(line);
        line = w;
      } else line = (line + " " + w).trim();
    }
    out.push(line);
  }
  return out;
}

export function pdfSimple(opts: { titulo: string; encabezado?: string; subtitulo?: string; secciones: SeccionPdf[] }): Buffer {
  type Linea = { t: string; size: number; bold?: boolean; gap?: number };
  const lineas: Linea[] = [];
  if (opts.encabezado) lineas.push({ t: opts.encabezado, size: 10, bold: true, gap: 6 });
  lineas.push(...wrap(opts.titulo, 60).map((t) => ({ t, size: 16, bold: true })));
  if (opts.subtitulo) lineas.push(...wrap(opts.subtitulo, 95).map((t) => ({ t, size: 9 })));
  lineas.push({ t: "", size: 8 });
  for (const s of opts.secciones) {
    if (s.titulo) lineas.push({ t: "", size: 6 }, ...wrap(s.titulo, 75).map((t) => ({ t, size: 12, bold: true })));
    for (const p of s.parrafos) lineas.push(...wrap(p, 92).map((t) => ({ t, size: 10.5 })), { t: "", size: 5 });
  }
  // Paginación
  const paginas: Linea[][] = [[]];
  let y = H - M;
  for (const l of lineas) {
    const alto = l.size * 1.45 + (l.gap ?? 0);
    if (y - alto < M + 20) {
      paginas.push([]);
      y = H - M;
    }
    paginas[paginas.length - 1].push(l);
    y -= alto;
  }
  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const kids: number[] = [];
  paginas.forEach((pag, i) => {
    let yy = H - M;
    const ops: string[] = [];
    for (const l of pag) {
      yy -= l.size * 1.45;
      if (l.t) ops.push(`BT /${l.bold ? "F2" : "F1"} ${l.size} Tf ${M} ${yy.toFixed(1)} Td (${esc(l.t)}) Tj ET`);
      yy -= l.gap ?? 0;
    }
    ops.push(`BT /F1 8 Tf ${M} 30 Td (${esc(`${opts.encabezado ?? "Conjunto360"} - Página ${i + 1} de ${paginas.length}`)}) Tj ET`);
    const stream = ops.join("\n");
    const pageId = 5 + i * 2;
    const contentId = pageId + 1;
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    kids.push(pageId);
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out, "latin1");
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
