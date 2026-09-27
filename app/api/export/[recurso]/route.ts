import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { getExporter } from "@/lib/export/registry";
import "@/lib/export/exporters";
import { toXlsx } from "@/lib/export/xlsx";
import { renderPdf, TablaPdf } from "@/lib/pdf/kit";
import { cop, fecha, num } from "@/lib/format";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** Exportación genérica de listas a Excel o PDF: /api/export/<recurso>?formato=xlsx|pdf&filtros… */
export async function GET(req: Request, { params }: { params: Promise<{ recurso: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { recurso } = await params;
  const exp = getExporter(recurso);
  if (!exp) return NextResponse.json({ error: "Recurso no exportable" }, { status: 404 });
  if (!can(ctx, exp.perm)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const rows = await exp.rows(ctx, sp);
  const formato = sp.formato ?? "xlsx";
  const stamp = new Date().toISOString().slice(0, 10);
  await audit(ctx, "exportar", recurso, null, undefined, { formato, filas: rows.length });
  if (formato === "pdf") {
    const conjunto = await ctx.db.conjunto.findUnique({ where: { id: ctx.conjuntoId } });
    const fmt = (v: unknown, tipo?: string) =>
      v === null || v === undefined ? "" : tipo === "moneda" ? cop(v as number) : tipo === "fecha" ? fecha(v as Date) : tipo === "numero" ? num(v as number, 6) : String(v);
    const buf = await renderPdf(
      TablaPdf({
        titulo: exp.titulo,
        conjunto: { nombre: conjunto?.nombre ?? "", nit: conjunto?.nit, direccion: conjunto?.direccion, ciudad: conjunto?.ciudad },
        columns: exp.columns.map((c) => ({ header: c.header, key: c.key, align: c.tipo === "moneda" || c.tipo === "numero" ? "right" : "left" })),
        rows: rows.map((r) => Object.fromEntries(exp.columns.map((c) => [c.key, fmt(r[c.key], c.tipo)]))),
      }),
    );
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${recurso}-${stamp}.pdf"` },
    });
  }
  const buf = await toXlsx(exp.titulo, exp.columns, rows);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${recurso}-${stamp}.xlsx"`,
    },
  });
}
