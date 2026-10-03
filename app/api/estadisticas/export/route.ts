import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { datosTablero, filtroDesdeParams, tablerosVisibles, type TableroKey } from "@/lib/estadisticas/tableros";

export const runtime = "nodejs";

/** Exporta el tablero de estadísticas actual a Excel (una hoja por conjunto de datos). */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, ["estadisticas.ver", "estadisticas.personal", "estadisticas.exportar"])) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const tab = tablerosVisibles(ctx).find((t) => t.key === sp.tab)?.key as TableroKey | undefined;
  if (!tab) return NextResponse.json({ error: "Tablero no disponible" }, { status: 403 });
  const { actual } = await datosTablero(ctx, tab, filtroDesdeParams(sp));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Conjunto360";
  const hoja = (nombre: string, filas: Record<string, unknown>[]) => {
    if (!filas.length) return;
    const ws = wb.addWorksheet(nombre.slice(0, 31));
    const cols = Object.keys(filas[0]);
    ws.columns = cols.map((c) => ({ header: c, key: c, width: Math.max(14, c.length + 4) }));
    ws.getRow(1).font = { bold: true };
    filas.forEach((f) => ws.addRow(f));
  };
  for (const [k, v] of Object.entries(actual as Record<string, unknown>)) {
    if (Array.isArray(v)) hoja(k, v as Record<string, unknown>[]);
    else if (v && typeof v === "object") {
      const entries = Object.entries(v as Record<string, unknown>);
      if (entries.every(([, x]) => typeof x === "number" || typeof x === "string")) hoja(k, entries.map(([indicador, valor]) => ({ indicador, valor })));
      else for (const [k2, v2] of entries) if (Array.isArray(v2)) hoja(`${k}-${k2}`, v2 as Record<string, unknown>[]);
    }
  }
  if (!wb.worksheets.length) wb.addWorksheet("Sin datos");
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="estadisticas-${tab}.xlsx"` },
  });
}
