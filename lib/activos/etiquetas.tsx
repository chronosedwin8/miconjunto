import * as React from "react";
import QRCode from "qrcode";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfQr, pdfStyles, renderPdf } from "@/lib/pdf/kit";
import { appUrl } from "@/lib/email";

export type EtiquetaActivo = { nombre: string; categoria: string; ubicacion: string | null; codigoQr: string };

/** Etiquetas por hoja A4: 3 columnas × 5 filas (15 por hoja, ~6,3 × 5,3 cm), aptas para papel adhesivo. */
export const ETIQUETAS_POR_HOJA = 15;

function Etiqueta({ e, qr, conjunto, color }: { e: EtiquetaActivo; qr: string; conjunto: string; color: string }) {
  return (
    <View
      style={{ width: "33.33%", height: "20%", padding: 4 }}
      wrap={false}
    >
      <View style={{ flex: 1, borderWidth: 0.8, borderColor: "#a1a1aa", borderStyle: "dashed", borderRadius: 6, padding: 6, flexDirection: "row", alignItems: "center" }}>
        <PdfQr dataUrl={qr} size={78} />
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={{ fontSize: 6.5, color, fontFamily: "Helvetica-Bold" }}>{conjunto.toUpperCase()}</Text>
          <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{e.nombre}</Text>
          <Text style={[pdfStyles.muted, { fontSize: 7, marginTop: 1 }]}>{e.categoria}</Text>
          {e.ubicacion ? <Text style={[pdfStyles.muted, { fontSize: 7 }]}>{e.ubicacion}</Text> : null}
          <Text style={{ fontSize: 6.5, marginTop: 4 }}>¿Falla? Escanea y repórtala</Text>
          <Text style={[pdfStyles.muted, { fontSize: 5.5, marginTop: 1 }]}>{e.codigoQr.slice(-8).toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

export async function etiquetasPdf(activos: EtiquetaActivo[], conjunto: { nombre: string; colorPrimario?: string | null }) {
  const qrs = await Promise.all(activos.map((a) => QRCode.toDataURL(appUrl(`/activo/${a.codigoQr}`), { margin: 0, width: 300, errorCorrectionLevel: "M" })));
  const hojas: number[][] = [];
  for (let i = 0; i < activos.length; i += ETIQUETAS_POR_HOJA) hojas.push(activos.slice(i, i + ETIQUETAS_POR_HOJA).map((_, j) => i + j));
  const color = conjunto.colorPrimario ?? "#0f766e";
  const doc = (
    <Document title={`Etiquetas QR · ${conjunto.nombre}`} author="MiConjunto">
      {hojas.map((idx, h) => (
        <Page key={h} size="A4" style={{ padding: 18, fontFamily: "Helvetica", color: "#18181b" }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", height: "100%" }}>
            {idx.map((i) => (
              <Etiqueta key={i} e={activos[i]} qr={qrs[i]} conjunto={conjunto.nombre} color={color} />
            ))}
          </View>
        </Page>
      ))}
    </Document>
  );
  return renderPdf(doc);
}
