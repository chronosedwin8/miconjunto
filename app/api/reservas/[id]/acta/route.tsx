import * as React from "react";
import { NextResponse } from "next/server";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { readFileByUrl } from "@/lib/storage";
import { fechaHora, fechaLarga, hora } from "@/lib/format";
import { label } from "@/lib/labels";
import { nombrePersona, reservaVisible } from "@/lib/reservas/service";
import { PdfFooter, PdfHeader, pdfStyles, renderPdf } from "@/lib/pdf/kit";

export const runtime = "nodejs";

type Acta = { fecha: string; porNombre?: string; checklist: Record<string, boolean>; observaciones?: string | null; fotos?: string[]; danos?: boolean; descripcionDano?: string | null };

async function fotosDataUrl(urls: string[]) {
  const out: string[] = [];
  for (const u of urls.slice(0, 6)) {
    if (!/\.(png|jpe?g)$/i.test(u)) continue;
    const b = await readFileByUrl(u).catch(() => null);
    if (b) out.push(`data:image/${/\.png$/i.test(u) ? "png" : "jpeg"};base64,${b.toString("base64")}`);
  }
  return out;
}

function Bloque({ titulo, acta, fotos }: { titulo: string; acta: Acta; fotos: string[] }) {
  return (
    <View style={pdfStyles.box} wrap={false}>
      <Text style={pdfStyles.h2}>{titulo}</Text>
      <Text style={pdfStyles.muted}>
        {fechaHora(acta.fecha)}
        {acta.porNombre ? ` · Registró: ${acta.porNombre}` : ""}
      </Text>
      {Object.entries(acta.checklist ?? {}).map(([k, v]) => (
        <Text key={k}>
          [{v ? "X" : "  "}] {k}
        </Text>
      ))}
      {acta.observaciones ? <Text style={[pdfStyles.p, { marginTop: 4 }]}>Observaciones: {acta.observaciones}</Text> : null}
      {acta.danos ? <Text style={[pdfStyles.p, { color: "#b91c1c" }]}>Daños: {acta.descripcionDano}</Text> : null}
      {fotos.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          {fotos.map((f, i) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image key={i} src={f} style={{ width: 150, height: 110, objectFit: "cover" }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** GET /api/reservas/:id/acta — PDF del acta de entrega y recepción de la zona. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, ["reservas.ver", "reservas.ver_todos", "reservas.checkin"])) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { id } = await params;
  let r;
  try {
    r = await reservaVisible(ctx, id);
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
  const conjunto = await ctx.db.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } });
  const persona = await nombrePersona(ctx.db, r.personaId);
  const entrega = r.actaEntrega as unknown as Acta | null;
  const recepcion = r.actaRecepcion as unknown as Acta | null;
  const [fe, fr] = await Promise.all([fotosDataUrl(entrega?.fotos ?? []), fotosDataUrl(recepcion?.fotos ?? [])]);
  const doc = (
    <Document title={`Acta ${r.zona.nombre}`} author="Conjunto360">
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader conjunto={{ nombre: conjunto.nombre, nit: conjunto.nit, direccion: conjunto.direccion, ciudad: conjunto.ciudad, telefono: conjunto.telefono, email: conjunto.email }} derecha={<Text style={pdfStyles.bold}>Acta de entrega y recepción</Text>} />
        <Text style={pdfStyles.title}>
          {r.zona.nombre} — {r.unidad.codigo}
        </Text>
        <Text style={pdfStyles.p}>
          Reserva del {fechaLarga(r.inicio)}, de {hora(r.inicio)} a {hora(r.fin)}. Estado: {label(r.estado)}. Asistentes: {r.asistentes}.
          {persona ? ` Responsable: ${persona.nombre}.` : ""}
        </Text>
        {entrega ? <Bloque titulo="Entrega de la zona (check-in)" acta={entrega} fotos={fe} /> : <Text style={pdfStyles.muted}>Sin acta de entrega.</Text>}
        {recepcion ? <Bloque titulo="Recepción de la zona (check-out)" acta={recepcion} fotos={fr} /> : <Text style={pdfStyles.muted}>Sin acta de recepción.</Text>}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 40 }}>
          <Text>_____________________________{"\n"}Portería / administración</Text>
          <Text>_____________________________{"\n"}Residente ({r.unidad.codigo})</Text>
        </View>
        <PdfFooter />
      </Page>
    </Document>
  );
  const buf = await renderPdf(doc);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="acta-${r.unidad.codigo}-${r.id.slice(-6)}.pdf"` } });
}
