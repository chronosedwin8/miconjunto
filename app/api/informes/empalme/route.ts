import * as React from "react";
import { NextResponse } from "next/server";
import { Document, Page, Text } from "@react-pdf/renderer";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { informeEmpalme } from "@/lib/informes/service";
import { PdfFooter, PdfHeader, PdfTable, pdfStyles, renderPdf } from "@/lib/pdf/kit";
import { cop, fecha, parseLocal } from "@/lib/format";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** PDF del informe de gestión / empalme de administración. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "informes.empalme")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const hasta = sp.get("hasta") ? parseLocal(sp.get("hasta")!) : new Date();
  const desde = sp.get("desde") ? parseLocal(sp.get("desde")!) : new Date(hasta.getTime() - 365 * 86400000);
  const r = await informeEmpalme(ctx, desde, new Date(hasta.getTime() + 86399000));
  const c = await ctx.db.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } });
  const h = React.createElement;
  const seccion = (titulo: string, cols: { header: string; key: string; width?: number; align?: "right" }[], rows: Record<string, string>[]) => [
    h(Text, { key: `t-${titulo}`, style: pdfStyles.h2 }, titulo),
    rows.length ? h(PdfTable, { key: `tb-${titulo}`, columns: cols, rows }) : h(Text, { key: `e-${titulo}`, style: pdfStyles.muted }, "Sin datos en el periodo."),
  ];
  const doc = h(
    Document,
    { title: "Informe de gestión" },
    h(
      Page,
      { size: "A4", style: pdfStyles.page },
      h(PdfHeader, { conjunto: { nombre: c.nombre, nit: c.nit, direccion: c.direccion, ciudad: c.ciudad, telefono: c.telefono, email: c.email } }),
      h(Text, { style: pdfStyles.title }, "Informe de gestión y empalme de administración"),
      h(Text, { style: pdfStyles.p }, `Periodo: ${fecha(desde)} a ${fecha(hasta)}. Generado por ${ctx.nombre} el ${fecha(new Date())}.`),
      h(Text, { style: pdfStyles.p }, `Unidades: ${r.estructura.unidades} · Personas registradas: ${r.estructura.personas} · Recaudo: ${cop(r.recaudo.total)} (${r.recaudo.pagos} pagos) · Gastos: ${cop(r.gastos.total)} · Cartera pendiente: ${cop(r.cartera.saldoPendiente)}.`),
      ...seccion("Top morosos", [{ header: "Unidad", key: "u", width: 50 }, { header: "Saldo vencido", key: "s", width: 50, align: "right" }], r.cartera.topMorosos.map((m) => ({ u: m.unidad, s: cop(m.saldo) }))),
      ...seccion("PQRS abiertas", [{ header: "Radicado", key: "r", width: 18 }, { header: "Asunto", key: "a", width: 52 }, { header: "Estado", key: "e", width: 15 }, { header: "Vence", key: "v", width: 15 }], r.pqrs.abiertos.map((t) => ({ r: t.radicado, a: t.titulo, e: t.estado, v: fecha(t.vence) }))),
      ...seccion("Contratos vigentes", [{ header: "Proveedor", key: "p", width: 30 }, { header: "Objeto", key: "o", width: 35 }, { header: "Valor", key: "v", width: 18, align: "right" }, { header: "Fin", key: "f", width: 17 }], r.contratos.map((x) => ({ p: x.proveedor, o: x.objeto, v: cop(x.valor), f: fecha(x.fin) }))),
      ...seccion("Pólizas", [{ header: "Póliza", key: "p", width: 70 }, { header: "Vence", key: "v", width: 30 }], r.polizas.map((p) => ({ p: p.titulo, v: fecha(p.vence) }))),
      ...seccion("Mantenimiento", [{ header: "Estado", key: "e", width: 40 }, { header: "Órdenes", key: "n", width: 30, align: "right" }, { header: "Costo", key: "c", width: 30, align: "right" }], r.mantenimiento.map((m) => ({ e: m.estado, n: String(m.total), c: cop(m.costo) }))),
      ...seccion("Asambleas", [{ header: "Asamblea", key: "a", width: 45 }, { header: "Fecha", key: "f", width: 20 }, { header: "Estado", key: "e", width: 15 }, { header: "Acta", key: "c", width: 20 }], r.asambleas.map((a) => ({ a: a.titulo, f: fecha(a.fecha), e: a.estado, c: a.acta ?? "—" }))),
      ...seccion("Convivencia", [{ header: "Estado", key: "e", width: 40 }, { header: "Cantidad", key: "n", width: 30, align: "right" }, { header: "Valor", key: "v", width: 30, align: "right" }], r.convivencia.map((m) => ({ e: m.estado, n: String(m.total), v: cop(m.valor) }))),
      h(Text, { style: [pdfStyles.p, { marginTop: 24 }] }, "________________________________              ________________________________"),
      h(Text, { style: pdfStyles.muted }, "Administrador saliente                                              Administrador entrante"),
      h(PdfFooter, {}),
    ),
  );
  const buf = await renderPdf(doc);
  await audit(ctx, "generar_informe_empalme", "Conjunto", ctx.conjuntoId, undefined, { desde, hasta });
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="informe-empalme.pdf"` } });
}
