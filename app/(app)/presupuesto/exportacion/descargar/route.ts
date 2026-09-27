import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { nowBogota, toNumber } from "@/lib/format";
import { toXlsx } from "@/lib/export/xlsx";
import { lineasContables, presupuestoDelAnio } from "@/lib/presupuesto/service";
import { cuadra, presupuestoMensualizado, SOFTWARES, tablaContable, toCsv, type Software } from "@/lib/presupuesto/contable";

export const runtime = "nodejs";

/**
 * Exportación contable: /presupuesto/exportacion/descargar?software=SIIGO&formato=csv|xlsx&desde&hasta&estado
 * (&tipo=presupuesto para el presupuesto mensualizado del año `anio`).
 */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(ctx, "presupuesto.exportar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const software = (SOFTWARES as readonly string[]).includes(sp.software) ? (sp.software as Software) : "SIIGO";
  const formato = sp.formato === "xlsx" ? "xlsx" : "csv";
  const stamp = new Date().toISOString().slice(0, 10);

  let headers: string[];
  let rows: (string | number)[][];
  let sep = ";";
  let nombre: string;
  let filas = 0;
  if (sp.tipo === "presupuesto") {
    const anio = Number(sp.anio) || nowBogota().year;
    const p = await presupuestoDelAnio(ctx, anio);
    if (!p) return NextResponse.json({ error: `No hay presupuesto ${anio}` }, { status: 404 });
    ({ headers, rows } = presupuestoMensualizado(
      p.rubros.map((r) => ({ tipo: r.tipo, nombre: r.nombre, cuentaContable: r.cuentaContable, valorAnual: toNumber(r.valorAnual) })),
      sp.centroCosto ?? "",
    ));
    nombre = `presupuesto-${anio}-${software.toLowerCase()}`;
    filas = rows.length;
  } else {
    const { lineas } = await lineasContables(
      ctx,
      { desde: sp.desde || undefined, hasta: sp.hasta || undefined, estado: sp.estado || undefined },
      {
        cuentaBancos: sp.cuentaBancos || undefined,
        cuentaPorPagar: sp.cuentaPorPagar || undefined,
        cuentaGastoDefecto: sp.cuentaGastoDefecto || undefined,
        centroCosto: sp.centroCosto || undefined,
        comprobanteEgreso: sp.comprobanteEgreso || undefined,
        comprobanteCausacion: sp.comprobanteCausacion || undefined,
        consecutivoInicial: Number(sp.consecutivoInicial) || undefined,
      },
    );
    if (!lineas.length) return NextResponse.json({ error: "No hay gastos aprobados o pagados en el periodo" }, { status: 404 });
    if (!cuadra(lineas)) return NextResponse.json({ error: "Los comprobantes no cuadran (débitos ≠ créditos)" }, { status: 500 });
    const t = tablaContable(software, lineas);
    headers = t.headers;
    rows = t.rows;
    sep = t.separador;
    nombre = `gastos-${software.toLowerCase()}-${sp.desde || "inicio"}-${sp.hasta || stamp}`;
    filas = lineas.length;
  }
  await audit(ctx, "exportacion_contable", sp.tipo === "presupuesto" ? "Presupuesto" : "Gasto", null, undefined, { software, formato, filas, desde: sp.desde, hasta: sp.hasta });

  if (formato === "xlsx") {
    const cols = headers.map((h, i) => ({ header: h, key: `c${i}`, width: Math.max(12, Math.min(40, h.length + 4)) }));
    const buf = await toXlsx(nombre, cols, rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v]))), "Movimientos");
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${nombre}.xlsx"` },
    });
  }
  return new NextResponse(toCsv(headers, rows, sep), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}.csv"` },
  });
}
