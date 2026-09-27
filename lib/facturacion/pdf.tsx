import * as React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { PdfFooter, PdfHeader, PdfQr, PdfTable, pdfStyles, renderPdf, type ConjuntoPdf } from "@/lib/pdf/kit";
import { cop, fechaHora } from "@/lib/format";
import type { DatosFactura } from "./tipos";

export type FacturaPdfProps = {
  conjunto: ConjuntoPdf;
  tipo: "FACTURA" | "NOTA_CREDITO";
  numero: string;
  cufe: string;
  fecha: Date;
  datos: DatosFactura;
  qrDataUrl?: string | null;
  simulada: boolean;
  facturaReferencia?: string | null;
};

/** Representación gráfica de la factura / nota crédito (usada por el proveedor simulado). */
export function FacturaPdf({ conjunto, tipo, numero, cufe, fecha, datos, qrDataUrl, simulada, facturaReferencia }: FacturaPdfProps) {
  const filas = datos.items.map((it) => {
    const base = it.precio * it.cantidad;
    const iva = it.excluido ? 0 : Math.round((base * it.tarifaIva) / 100);
    return { descripcion: it.nombre, cantidad: String(it.cantidad), precio: cop(it.precio), iva: `${it.excluido ? 0 : it.tarifaIva} %`, total: cop(base + iva), _base: base, _iva: iva };
  });
  const subtotal = filas.reduce((a, f) => a + f._base, 0);
  const iva = filas.reduce((a, f) => a + f._iva, 0);
  const titulo = tipo === "FACTURA" ? "Factura electrónica de venta" : "Nota crédito electrónica";
  return (
    <Document title={`${titulo} ${numero}`} author="MiConjunto">
      <Page size="A4" style={pdfStyles.page}>
        {simulada ? (
          <View style={{ position: "absolute", top: 330, left: 40, right: 40, transform: "rotate(-30deg)" }} fixed>
            <Text style={{ fontSize: 34, color: "#fca5a5", textAlign: "center", fontFamily: "Helvetica-Bold", opacity: 0.6 }}>SIMULACIÓN — sin validez fiscal</Text>
          </View>
        ) : null}
        <PdfHeader
          conjunto={conjunto}
          derecha={
            <>
              <Text style={pdfStyles.bold}>{titulo}</Text>
              <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold" }}>N.º {numero}</Text>
              <Text style={pdfStyles.muted}>{fechaHora(fecha)}</Text>
            </>
          }
        />
        {simulada ? (
          <View style={[pdfStyles.box, { borderColor: "#dc2626", backgroundColor: "#fef2f2" }]}>
            <Text style={[pdfStyles.bold, { color: "#b91c1c" }]}>SIMULACIÓN — sin validez fiscal</Text>
            <Text style={{ color: "#b91c1c" }}>Documento generado en modo demostración. No fue enviado a la DIAN. Configure Factus o Alanube para emitir facturas reales.</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={[pdfStyles.box, { flex: 1 }]}>
            <Text style={pdfStyles.h2}>Adquiriente</Text>
            <Text>{datos.cliente.nombre}</Text>
            <Text style={pdfStyles.muted}>
              {datos.cliente.tipoDocumento} {datos.cliente.numeroDocumento}
            </Text>
            {datos.cliente.email ? <Text style={pdfStyles.muted}>{datos.cliente.email}</Text> : null}
            {datos.cliente.direccion ? <Text style={pdfStyles.muted}>{datos.cliente.direccion}</Text> : null}
          </View>
          <View style={[pdfStyles.box, { flex: 1 }]}>
            <Text style={pdfStyles.h2}>Pago</Text>
            <Text>Forma: contado</Text>
            <Text>Medio: {datos.medioPago.toLowerCase().replace(/_/g, " ")}</Text>
            <Text style={pdfStyles.muted}>Referencia: {datos.referenceCode}</Text>
            {facturaReferencia ? <Text style={pdfStyles.muted}>Factura que afecta: {facturaReferencia}</Text> : null}
          </View>
        </View>
        <PdfTable
          columns={[
            { header: "Descripción", key: "descripcion", width: 40 },
            { header: "Cant.", key: "cantidad", width: 10, align: "right" },
            { header: "Precio unitario", key: "precio", width: 18, align: "right" },
            { header: "IVA", key: "iva", width: 12, align: "right" },
            { header: "Total", key: "total", width: 20, align: "right" },
          ]}
          rows={filas}
        />
        <View style={{ alignSelf: "flex-end", width: 220, marginTop: 8 }}>
          <View style={[pdfStyles.tr, { justifyContent: "space-between", paddingVertical: 3 }]}>
            <Text>Base gravable</Text>
            <Text>{cop(subtotal)}</Text>
          </View>
          <View style={[pdfStyles.tr, { justifyContent: "space-between", paddingVertical: 3 }]}>
            <Text>IVA</Text>
            <Text>{cop(iva)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
            <Text style={pdfStyles.bold}>Total</Text>
            <Text style={pdfStyles.bold}>{cop(datos.totalPagado)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 14, alignItems: "flex-start" }}>
          {qrDataUrl ? <PdfQr dataUrl={qrDataUrl} size={80} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={pdfStyles.h2}>{tipo === "FACTURA" ? "CUFE" : "CUDE"}</Text>
            <Text style={[pdfStyles.muted, { fontSize: 7 }]}>{cufe}</Text>
            {datos.observacion ? <Text style={[pdfStyles.p, { marginTop: 6 }]}>Observación: {datos.observacion}</Text> : null}
          </View>
        </View>
        <PdfFooter texto={simulada ? "SIMULACIÓN — sin validez fiscal · MiConjunto" : "Representación gráfica · MiConjunto"} />
      </Page>
    </Document>
  );
}

export function renderFacturaPdf(p: FacturaPdfProps) {
  return renderPdf(<FacturaPdf {...p} />);
}
