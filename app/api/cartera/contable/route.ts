import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { parseLocal } from "@/lib/format";
import { toXlsx } from "@/lib/export/xlsx";
import { asientosCartera, asientosCsv, columnasFormato, FORMATOS_CONTABLES, type FormatoContable } from "@/lib/cartera/contable";

export const runtime = "nodejs";

/**
 * GET /api/cartera/contable?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&formato=SIIGO|WORLD_OFFICE|ALEGRA|HELISA|GENERICO
 *   &tipo=cuotas|pagos|todo&archivo=xlsx|csv&cartera=&bancos=&caja=&iva=&descuentos=&anticipos=
 * Comprobantes contables de cartera (causación y recaudo) para importar en el software contable.
 */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, ["cartera.exportar", "pagos.exportar"])) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const formato = (FORMATOS_CONTABLES as readonly string[]).includes(sp.get("formato") ?? "") ? (sp.get("formato") as FormatoContable) : "GENERICO";
  const tipo = sp.get("tipo") === "cuotas" || sp.get("tipo") === "pagos" ? (sp.get("tipo") as "cuotas" | "pagos") : "todo";
  const desdeTxt = sp.get("desde");
  const hastaTxt = sp.get("hasta");
  if (!desdeTxt || !hastaTxt || !/^\d{4}-\d{2}-\d{2}$/.test(desdeTxt) || !/^\d{4}-\d{2}-\d{2}$/.test(hastaTxt)) return NextResponse.json({ error: "Indica el rango de fechas" }, { status: 400 });
  const desde = parseLocal(desdeTxt);
  const hasta = new Date(parseLocal(hastaTxt).getTime() + 86_400_000 - 1);
  const cuentas = Object.fromEntries(["cartera", "bancos", "caja", "iva", "descuentos", "anticipos"].map((k) => [k, (sp.get(k) ?? "").replace(/[^\d]/g, "")]));
  const asientos = await asientosCartera(ctx, { desde, hasta, tipo, cuentas });
  await audit(ctx, "exportacion_contable", "Cartera", null, undefined, { formato, tipo, desde: desdeTxt, hasta: hastaTxt, lineas: asientos.length });
  const nombre = `contable-cartera-${formato.toLowerCase()}-${desdeTxt}_${hastaTxt}`;
  if (sp.get("archivo") === "csv") {
    return new Response(asientosCsv(asientos, formato), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}.csv"` } });
  }
  const cols = columnasFormato(formato);
  const keys = cols.map((_, i) => `c${i}`);
  const rows = asientos.map((a, i) => Object.fromEntries(cols.map((c, j) => [keys[j], c.valor(a, i)])));
  const buf = await toXlsx(
    "Exportación contable",
    cols.map((c, j) => ({ header: c.header, key: keys[j], tipo: /d[ée]bito|cr[ée]dito/i.test(c.header) ? ("moneda" as const) : undefined, width: Math.max(12, c.header.length + 4) })),
    rows,
    "Comprobantes",
  );
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nombre}.xlsx"` } });
}
