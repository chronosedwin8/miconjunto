import ExcelJS from "exceljs";

export type ExportColumn = { header: string; key: string; width?: number; tipo?: "texto" | "moneda" | "numero" | "fecha" };

/** Genera un .xlsx con encabezado formateado. */
export async function toXlsx(titulo: string, columns: ExportColumn[], rows: Record<string, unknown>[], hoja = "Datos") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MiConjunto";
  wb.created = new Date();
  const ws = wb.addWorksheet(hoja.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  header.alignment = { vertical: "middle" };
  for (const r of rows) {
    const row: Record<string, unknown> = {};
    for (const c of columns) {
      const v = r[c.key];
      row[c.key] = v instanceof Date ? v : typeof v === "object" && v !== null && "toNumber" in (v as object) ? Number(String(v)) : v;
    }
    ws.addRow(row);
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.tipo === "moneda") col.numFmt = '"$"#,##0';
    if (c.tipo === "numero") col.numFmt = "#,##0.######";
    if (c.tipo === "fecha") col.numFmt = "dd/mm/yyyy";
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  wb.title = titulo;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Lee la primera hoja de un Excel/CSV como arreglo de objetos (encabezados normalizados). */
export async function readSheet(buffer: Buffer, filename: string): Promise<Record<string, string>[]> {
  const norm = (h: string) =>
    h
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const sep = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ";" : ",";
    const parse = (line: string) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else q = !q;
        } else if (ch === sep && !q) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const headers = parse(lines[0]).map(norm);
    return lines.slice(1).map((l) => {
      const vals = parse(l);
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
    });
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = norm(String(cell.text ?? ""));
  });
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const obj: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      let v = "";
      if (cell.value instanceof Date) v = cell.value.toISOString().slice(0, 10);
      else v = String(cell.text ?? "").trim();
      if (v) any = true;
      obj[h] = v;
    });
    if (any) rows.push(obj);
  });
  return rows;
}
