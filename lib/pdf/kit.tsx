import * as React from "react";
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from "@react-pdf/renderer";

/** Kit PDF compartido: encabezado del conjunto, tablas y pie. Usado por certificados, estados de cuenta, actas y reportes. */
export const pdfStyles = StyleSheet.create({
  page: { padding: 32, fontSize: 9.5, fontFamily: "Helvetica", color: "#18181b" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, borderBottomWidth: 2, borderBottomColor: "#0f766e", paddingBottom: 8 },
  conjunto: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  muted: { color: "#71717a" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  p: { marginBottom: 5, lineHeight: 1.45 },
  table: { borderWidth: 0.5, borderColor: "#d4d4d8", marginTop: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e4e4e7" },
  th: { backgroundColor: "#0f766e", color: "#fff", fontFamily: "Helvetica-Bold", padding: 4 },
  td: { padding: 4 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 7.5, color: "#a1a1aa", flexDirection: "row", justifyContent: "space-between" },
  box: { borderWidth: 1, borderColor: "#d4d4d8", borderRadius: 4, padding: 8, marginVertical: 6 },
  bold: { fontFamily: "Helvetica-Bold" },
});

export type ConjuntoPdf = { nombre: string; nit?: string | null; direccion?: string | null; ciudad?: string | null; telefono?: string | null; email?: string | null };

export function PdfHeader({ conjunto, derecha }: { conjunto: ConjuntoPdf; derecha?: React.ReactNode }) {
  return (
    <View style={pdfStyles.header} fixed>
      <View>
        <Text style={pdfStyles.conjunto}>{conjunto.nombre}</Text>
        {conjunto.nit ? <Text style={pdfStyles.muted}>NIT {conjunto.nit}</Text> : null}
        <Text style={pdfStyles.muted}>{[conjunto.direccion, conjunto.ciudad].filter(Boolean).join(" · ")}</Text>
        <Text style={pdfStyles.muted}>{[conjunto.telefono, conjunto.email].filter(Boolean).join(" · ")}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>{derecha}</View>
    </View>
  );
}

export function PdfFooter({ texto }: { texto?: string }) {
  return (
    <View style={pdfStyles.footer} fixed>
      <Text>{texto ?? "Generado por MiConjunto"}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export type PdfCol = { header: string; key: string; width?: number | string; align?: "left" | "right" | "center" };

export function PdfTable({ columns, rows }: { columns: PdfCol[]; rows: Record<string, React.ReactNode>[] }) {
  const w = (c: PdfCol) => (c.width !== undefined ? (typeof c.width === "number" ? `${c.width}%` : c.width) : `${100 / columns.length}%`);
  return (
    <View style={pdfStyles.table}>
      <View style={pdfStyles.tr} fixed>
        {columns.map((c) => (
          <Text key={c.key} style={[pdfStyles.th, { width: w(c), textAlign: c.align ?? "left" }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[pdfStyles.tr, i % 2 ? { backgroundColor: "#fafafa" } : {}]} wrap={false}>
          {columns.map((c) => (
            <Text key={c.key} style={[pdfStyles.td, { width: w(c), textAlign: c.align ?? "left" }]}>
              {r[c.key] === null || r[c.key] === undefined ? "" : (r[c.key] as string)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function PdfQr({ dataUrl, size = 90, caption }: { dataUrl: string; size?: number; caption?: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={dataUrl} style={{ width: size, height: size }} />
      {caption ? <Text style={[pdfStyles.muted, { fontSize: 7, marginTop: 2 }]}>{caption}</Text> : null}
    </View>
  );
}

export async function renderPdf(doc: React.ReactElement) {
  return renderToBuffer(doc as React.ReactElement<import("@react-pdf/renderer").DocumentProps>);
}

/** Reporte tabular genérico (exportaciones PDF de listas). */
export function TablaPdf({ titulo, subtitulo, conjunto, columns, rows }: { titulo: string; subtitulo?: string; conjunto: ConjuntoPdf; columns: PdfCol[]; rows: Record<string, React.ReactNode>[] }) {
  return (
    <Document title={titulo} author="MiConjunto">
      <Page size="A4" orientation={columns.length > 6 ? "landscape" : "portrait"} style={pdfStyles.page}>
        <PdfHeader conjunto={conjunto} derecha={<Text style={pdfStyles.muted}>{new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}</Text>} />
        <Text style={pdfStyles.title}>{titulo}</Text>
        {subtitulo ? <Text style={[pdfStyles.p, pdfStyles.muted]}>{subtitulo}</Text> : null}
        <PdfTable columns={columns} rows={rows} />
        <Text style={[pdfStyles.muted, { marginTop: 6 }]}>{rows.length} registro(s)</Text>
        <PdfFooter />
      </Page>
    </Document>
  );
}
