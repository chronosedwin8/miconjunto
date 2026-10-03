import * as React from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { CotizacionComercial } from "@prisma/client";
import { PdfFooter, PdfTable, pdfStyles } from "@/lib/pdf/kit";
import { cop, PLAN_LABEL, type PlanComercial } from "./precios";
import type { ConjuntoCotizado } from "./service";

// Párrafo compacto (el estilo base del kit tiene interlineado alto para cartas).
const parrafo = { marginBottom: 4, lineHeight: 1.25 };

const fechaCO = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "long", year: "numeric" });

/** PDF de la cotización comercial que descarga el cliente desde la página de precios o el correo. */
export function CotizacionPdf({ c }: { c: CotizacionComercial }) {
  const conjuntos = (c.conjuntos as ConjuntoCotizado[]) ?? [];
  const unitario = Number(c.precioUnitario);
  const rows = Array.from({ length: c.cantidad }, (_, i) => {
    const x = conjuntos[i] ?? {};
    return {
      n: String(i + 1),
      nombre: x.nombre || `Conjunto ${i + 1}`,
      ciudad: x.ciudad || "—",
      unidades: x.unidades ? String(x.unidades) : "—",
      valor: cop(unitario),
    };
  });
  const descuento = Number(c.descuento);
  return (
    <Document title={`Cotización ${c.numero}`} author="Conjunto360">
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header} fixed>
          <View>
            <Text style={pdfStyles.conjunto}>Conjunto360</Text>
            <Text style={pdfStyles.muted}>Software de administración de propiedad horizontal</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={pdfStyles.bold}>Cotización {c.numero}</Text>
            <Text style={pdfStyles.muted}>Fecha: {fechaCO(c.createdAt)}</Text>
            <Text style={pdfStyles.muted}>Válida hasta: {fechaCO(c.validaHasta)}</Text>
          </View>
        </View>

        <Text style={pdfStyles.title}>Plan {PLAN_LABEL[c.plan as PlanComercial]} · pago anual</Text>
        <View style={pdfStyles.box}>
          <Text style={pdfStyles.bold}>{c.nombre}{c.cargo ? ` · ${c.cargo}` : ""}</Text>
          {c.empresa ? <Text>{c.empresa}{c.nit ? ` · NIT ${c.nit}` : ""}</Text> : null}
          <Text style={pdfStyles.muted}>{[c.email, c.telefono, c.ciudad].filter(Boolean).join(" · ")}</Text>
        </View>

        <Text style={pdfStyles.h2}>Conjuntos incluidos</Text>
        <PdfTable
          columns={[
            { header: "#", key: "n", width: 6 },
            { header: "Conjunto", key: "nombre", width: 40 },
            { header: "Ciudad", key: "ciudad", width: 20 },
            { header: "Unidades", key: "unidades", width: 12, align: "right" },
            { header: "Valor anual", key: "valor", width: 22, align: "right" },
          ]}
          rows={rows}
        />

        <View style={{ marginTop: 10, alignSelf: "flex-end", width: "55%" }}>
          <View style={[pdfStyles.tr, { justifyContent: "space-between", paddingVertical: 3 }]}>
            <Text>Subtotal ({c.cantidad} × {cop(unitario)})</Text>
            <Text>{cop(Number(c.subtotal))}</Text>
          </View>
          {descuento > 0 ? (
            <View style={[pdfStyles.tr, { justifyContent: "space-between", paddingVertical: 3 }]}>
              <Text>Descuento multiconjunto (10 %)</Text>
              <Text>- {cop(descuento)}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 }}>
            <Text style={[pdfStyles.bold, { fontSize: 12 }]}>Total anual</Text>
            <Text style={[pdfStyles.bold, { fontSize: 12, color: "#0f766e" }]}>{cop(Number(c.total))}</Text>
          </View>
        </View>

        <Text style={pdfStyles.h2}>Incluye</Text>
        {[
          "Todos los módulos: cartera y pagos en línea, portería y paquetería, reservas, PQRS, convivencia, comunicaciones, documentos, encuestas, votaciones y asambleas, mantenimiento, proveedores, presupuesto, estadísticas y asistente con IA.",
          "Usuarios ilimitados para administración, consejo, portería, residentes y propietarios del conjunto.",
          "App instalable en celular (iOS y Android) con portería que funciona sin internet.",
          "Configuración inicial, importación de datos desde Excel y capacitación al equipo administrativo.",
          "Soporte, actualizaciones y copias de seguridad diarias durante la vigencia.",
        ].map((t) => (
          <Text key={t} style={parrafo}>• {t}</Text>
        ))}

        <Text style={pdfStyles.h2}>Condiciones</Text>
        <Text style={parrafo}>Valores en pesos colombianos (COP) por año de servicio, pagaderos de forma anticipada. El descuento del 10 % aplica a contratos de más de 3 conjuntos facturados juntos. Los costos de pasarela de pago, mensajería de WhatsApp y facturación electrónica de terceros corren por cuenta de cada conjunto según su proveedor.</Text>
        {c.mensaje ? (
          <>
            <Text style={pdfStyles.h2}>Comentarios del cliente</Text>
            <Text style={parrafo}>{c.mensaje}</Text>
          </>
        ) : null}
        <PdfFooter texto={`Conjunto360 · Cotización ${c.numero}`} />
      </Page>
    </Document>
  );
}
