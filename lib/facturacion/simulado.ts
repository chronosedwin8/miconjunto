/**
 * SimuladoProvider — proveedor por defecto en la demo (o cuando el conjunto no tiene credenciales).
 * Genera un número consecutivo "SETP-990000xxx", un CUFE SHA-384 simulado y un PDF propio marcado
 * "SIMULACIÓN — sin validez fiscal". No se comunica con la DIAN.
 */
import crypto from "node:crypto";
import QRCode from "qrcode";
import { nextConsecutivo } from "@/lib/consecutivo";
import type { ConjuntoPdf } from "@/lib/pdf/kit";
import type { DatosFactura, DatosNotaCredito, ElectronicInvoiceProvider, ResultadoEmision } from "./tipos";
import { construirPayloadFactus, construirPayloadNotaCreditoFactus, totalFactus } from "./payload";

export function numeroSimulado(tipo: "FACTURA" | "NOTA_CREDITO", n: number) {
  return `${tipo === "FACTURA" ? "SETP" : "NCSP"}-${990000000 + n}`;
}

export function cufeSimulado(p: { numero: string; fecha: Date; total: number; nit: string; cliente: string }) {
  return crypto.createHash("sha384").update(`${p.numero}|${p.fecha.toISOString()}|${p.total.toFixed(2)}|${p.nit}|${p.cliente}|SIMULADO-MICONJUNTO`).digest("hex");
}

function xmlSimulado(tipo: string, numero: string, cufe: string, fecha: Date, d: DatosFactura) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lineas = d.items
    .map(
      (it, i) =>
        `  <cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="94">${it.cantidad}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="COP">${(it.precio * it.cantidad).toFixed(2)}</cbc:LineExtensionAmount><cac:Item><cbc:Description>${esc(it.nombre)}</cbc:Description></cac:Item><cac:TaxTotal><cbc:Percent>${it.tarifaIva.toFixed(2)}</cbc:Percent></cac:TaxTotal></cac:InvoiceLine>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SIMULACIÓN — sin validez fiscal. Documento generado por Conjunto360 en modo demostración. -->
<${tipo} xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>${numero}</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${cufe}</cbc:UUID>
  <cbc:IssueDate>${fecha.toISOString().slice(0, 10)}</cbc:IssueDate>
  <cac:AccountingCustomerParty><cbc:CompanyID>${esc(d.cliente.numeroDocumento)}</cbc:CompanyID><cbc:Name>${esc(d.cliente.nombre)}</cbc:Name></cac:AccountingCustomerParty>
${lineas}
  <cac:LegalMonetaryTotal><cbc:PayableAmount currencyID="COP">${d.totalPagado.toFixed(2)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
</${tipo}>
`;
}

/**
 * Renderiza el PDF con @react-pdf (import diferido: fuera de Next —p. ej. el seed con tsx— el paquete
 * puede no resolverse; en ese caso se devuelve null y el PDF se genera al descargarlo).
 */
export async function renderSimulado(p: import("./pdf").FacturaPdfProps): Promise<Buffer | null> {
  try {
    const { renderFacturaPdf } = await import("./pdf");
    return await renderFacturaPdf(p);
  } catch (e) {
    console.warn("[facturacion] PDF simulado diferido:", (e as Error).message.slice(0, 120));
    return null;
  }
}

/** QR (data URL) del enlace de verificación DIAN simulado. */
export function qrSimulado(url: string) {
  return QRCode.toDataURL(url, { margin: 1, width: 240 });
}

export class SimuladoProvider implements ElectronicInvoiceProvider {
  readonly nombre = "SIMULADO" as const;
  constructor(
    private conjuntoId: string,
    private conjunto: ConjuntoPdf,
  ) {}

  private async emitir(tipo: "FACTURA" | "NOTA_CREDITO", datos: DatosFactura, payload: unknown, facturaReferencia?: string): Promise<ResultadoEmision> {
    const n = await nextConsecutivo(this.conjuntoId, tipo === "FACTURA" ? "FACTURA_SIMULADA" : "NOTA_CREDITO_SIMULADA");
    const numero = numeroSimulado(tipo, n);
    const fecha = new Date();
    const cufe = cufeSimulado({ numero, fecha, total: totalFactus(datos.items), nit: this.conjunto.nit ?? "", cliente: datos.cliente.numeroDocumento });
    const urlPublica = `https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=${cufe}`;
    const qrDataUrl = await QRCode.toDataURL(urlPublica, { margin: 1, width: 240 });
    const pdf = await renderSimulado({ conjunto: this.conjunto, tipo, numero, cufe, fecha, datos, qrDataUrl, simulada: true, facturaReferencia });
    const xml = Buffer.from(xmlSimulado(tipo === "FACTURA" ? "Invoice" : "CreditNote", numero, cufe, fecha, datos), "utf8");
    return {
      ok: true,
      validada: true,
      numero,
      cufe,
      validadaEn: fecha,
      urlPublica: null,
      qr: urlPublica,
      errores: null,
      payload,
      respuesta: { simulado: true, status: "Created", message: "SIMULACIÓN — sin validez fiscal", data: { number: numero, cufe, is_validated: true } },
      pdf,
      xml,
      mensaje: "Validada (simulación)",
    };
  }

  emitirFactura(datos: DatosFactura) {
    return this.emitir("FACTURA", datos, construirPayloadFactus(datos));
  }

  notaCredito(datos: DatosNotaCredito) {
    return this.emitir("NOTA_CREDITO", datos, construirPayloadNotaCreditoFactus(datos), datos.numeroFactura);
  }

  // El simulado entrega PDF y XML al emitir; se sirven desde el almacenamiento propio.
  async descargarPdf() {
    return null;
  }
  async descargarXml() {
    return null;
  }
  async eliminarPendiente() {
    return true;
  }
}
