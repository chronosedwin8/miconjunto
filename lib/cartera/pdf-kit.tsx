import * as React from "react";
import type { DocumentProps, Styles } from "@react-pdf/renderer";
import type { ConjuntoPdf, PdfCol } from "@/lib/pdf/kit";

/**
 * Kit PDF de cartera con carga diferida de @react-pdf/renderer (mismo diseño que lib/pdf/kit.tsx).
 * Se importa dinámicamente para que los módulos de cartera se puedan usar desde el worker de jobs y el seed (tsx),
 * donde la importación estática de @react-pdf falla; así la campaña de cobro puede adjuntar el estado de cuenta.
 */
export async function pdfKit() {
  const R = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } = R;
  const s = StyleSheet.create({
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
  } satisfies Styles);

  function Header({ conjunto, derecha }: { conjunto: ConjuntoPdf; derecha?: React.ReactNode }) {
    return (
      <View style={s.header} fixed>
        <View>
          <Text style={s.conjunto}>{conjunto.nombre}</Text>
          {conjunto.nit ? <Text style={s.muted}>NIT {conjunto.nit}</Text> : null}
          <Text style={s.muted}>{[conjunto.direccion, conjunto.ciudad].filter(Boolean).join(" · ")}</Text>
          <Text style={s.muted}>{[conjunto.telefono, conjunto.email].filter(Boolean).join(" · ")}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>{derecha}</View>
      </View>
    );
  }

  function Footer({ texto }: { texto?: string }) {
    return (
      <View style={s.footer} fixed>
        <Text>{texto ?? "Generado por MiConjunto"}</Text>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    );
  }

  function Table({ columns, rows }: { columns: PdfCol[]; rows: Record<string, React.ReactNode>[] }) {
    const w = (c: PdfCol) => (c.width !== undefined ? (typeof c.width === "number" ? `${c.width}%` : c.width) : `${100 / columns.length}%`);
    return (
      <View style={s.table}>
        <View style={s.tr} fixed>
          {columns.map((c) => (
            <Text key={c.key} style={[s.th, { width: w(c), textAlign: c.align ?? "left" }]}>
              {c.header}
            </Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[s.tr, i % 2 ? { backgroundColor: "#fafafa" } : {}]} wrap={false}>
            {columns.map((c) => (
              <Text key={c.key} style={[s.td, { width: w(c), textAlign: c.align ?? "left" }]}>
                {r[c.key] === null || r[c.key] === undefined ? "" : (r[c.key] as string)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }

  function Qr({ dataUrl, size = 90, caption }: { dataUrl: string; size?: number; caption?: string }) {
    return (
      <View style={{ alignItems: "center" }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <Image src={dataUrl} style={{ width: size, height: size }} />
        {caption ? <Text style={[s.muted, { fontSize: 7, marginTop: 2 }]}>{caption}</Text> : null}
      </View>
    );
  }

  const render = (doc: React.ReactElement) => renderToBuffer(doc as React.ReactElement<DocumentProps>);
  return { Document, Page, Text, View, Header, Footer, Table, Qr, render, s };
}
