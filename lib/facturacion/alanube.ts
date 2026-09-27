/**
 * AlanubeProvider — adaptador REST para Alanube Colombia (API v1.0-COL).
 *
 * Estructura PREPARADA con los mismos métodos de `ElectronicInvoiceProvider`, configurable por conjunto
 * (Configuración → Integraciones → ALANUBE: `baseUrl` y `token`, autenticación `Authorization: Bearer`).
 * Documentación: https://developer.alanube.co/v1.0-COL/ — los nombres exactos de rutas y campos deben
 * confirmarse contra el sandbox del conjunto antes de producción (ver docs/modulos/facturacion.md).
 *
 * Rutas usadas (convención REST de Alanube):
 *   POST {baseUrl}/invoices            · POST {baseUrl}/credit-notes
 *   GET  {baseUrl}/invoices/{id}/pdf   · GET  {baseUrl}/invoices/{id}/xml
 *   DELETE {baseUrl}/invoices/reference/{referenceCode}
 */
import type { Archivo, DatosFactura, DatosNotaCredito, ElectronicInvoiceProvider, ResultadoEmision } from "./tipos";
import { CODIGO_DOCUMENTO, codigoMetodoPago, d2, totalFactus } from "./payload";

export type AlanubeCredenciales = { baseUrl: string; token: string };

/** Documento en el formato de Alanube (camelCase, montos numéricos). */
export function construirPayloadAlanube(d: DatosFactura) {
  const total = totalFactus(d.items);
  return {
    externalId: d.referenceCode,
    documentType: "01",
    operationType: "10",
    paymentForm: "1",
    paymentMethod: codigoMetodoPago(d.medioPago, d.datosPasarela),
    notes: d.observacion ?? undefined,
    customer: {
      identificationType: CODIGO_DOCUMENTO[d.cliente.tipoDocumento] ?? "13",
      identificationNumber: d.cliente.numeroDocumento,
      organizationType: d.cliente.tipoDocumento === "NIT" ? "1" : "2",
      name: d.cliente.nombre,
      email: d.cliente.email ?? undefined,
      phone: d.cliente.telefono ?? undefined,
      address: d.cliente.direccion ?? undefined,
      cityCode: d.cliente.municipioCodigo ?? undefined,
      taxResponsibilities: ["R-99-PN"],
      taxScheme: "ZZ",
    },
    items: d.items.map((it) => ({
      code: it.codigo,
      description: it.nombre,
      quantity: it.cantidad,
      unitMeasure: "94",
      unitPrice: Number(d2(it.precio)),
      taxes: it.excluido ? [] : [{ type: "01", rate: it.tarifaIva }],
    })),
    totals: { total, paid: d.totalPagado },
  };
}

export class AlanubeProvider implements ElectronicInvoiceProvider {
  readonly nombre = "ALANUBE" as const;
  private base: string;

  constructor(
    private cred: AlanubeCredenciales,
    private f: typeof fetch = fetch,
  ) {
    this.base = cred.baseUrl.replace(/\/+$/, "");
  }

  private async req(method: string, path: string, body?: unknown) {
    const r = await this.f(`${this.base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cred.token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  }

  private leer(payload: unknown, res: { status: number; json: Record<string, unknown> }): ResultadoEmision {
    const j = res.json;
    const doc = ((j.data as Record<string, unknown>) ?? j) as Record<string, unknown>;
    const ok = res.status >= 200 && res.status < 300;
    const estado = String(doc.status ?? doc.legalStatus ?? "").toUpperCase();
    const validada = ok && (estado.includes("ACCEPTED") || estado.includes("ACEPTAD") || estado.includes("VALID") || !!doc.cufe);
    return {
      ok: validada,
      validada,
      numero: (doc.number as string) ?? (doc.documentNumber as string) ?? null,
      cufe: (doc.cufe as string) ?? null,
      validadaEn: validada ? new Date() : null,
      urlPublica: (doc.publicUrl as string) ?? (doc.pdfUrl as string) ?? null,
      qr: (doc.qr as string) ?? (doc.qrCode as string) ?? null,
      errores: ok ? (doc.errors ?? null) : (j.errors ?? j.message ?? `HTTP ${res.status}`),
      payload,
      respuesta: j,
      reintentable: res.status === 429 || res.status >= 500 || (ok && !validada),
      mensaje: validada ? "Aceptada por la DIAN" : ok ? "En proceso de validación" : String(j.message ?? `Alanube respondió ${res.status}`),
    };
  }

  async emitirFactura(datos: DatosFactura) {
    const payload = construirPayloadAlanube(datos);
    return this.leer(payload, await this.req("POST", "/invoices", payload));
  }

  async notaCredito(datos: DatosNotaCredito) {
    const payload = { ...construirPayloadAlanube(datos), documentType: "91", correctionConcept: datos.conceptoCorreccion, billingReference: { number: datos.numeroFactura } };
    return this.leer(payload, await this.req("POST", "/credit-notes", payload));
  }

  private async archivo(numero: string, tipo: "FACTURA" | "NOTA_CREDITO", formato: "pdf" | "xml"): Promise<Archivo | null> {
    const r = await this.req("GET", `/${tipo === "FACTURA" ? "invoices" : "credit-notes"}/${encodeURIComponent(numero)}/${formato}`);
    const b64 = ((r.json.data as Record<string, string>) ?? (r.json as Record<string, string>))?.[formato === "pdf" ? "pdf" : "xml"] ?? (r.json as Record<string, string>).content;
    if (r.status >= 400 || typeof b64 !== "string") return null;
    return { nombre: `${numero}.${formato}`, contenido: Buffer.from(b64, "base64"), mime: formato === "pdf" ? "application/pdf" : "application/xml" };
  }

  descargarPdf(numero: string, tipo: "FACTURA" | "NOTA_CREDITO" = "FACTURA") {
    return this.archivo(numero, tipo, "pdf");
  }
  descargarXml(numero: string, tipo: "FACTURA" | "NOTA_CREDITO" = "FACTURA") {
    return this.archivo(numero, tipo, "xml");
  }
  async eliminarPendiente(referenceCode: string, tipo: "FACTURA" | "NOTA_CREDITO" = "FACTURA") {
    const r = await this.req("DELETE", `/${tipo === "FACTURA" ? "invoices" : "credit-notes"}/reference/${encodeURIComponent(referenceCode)}`);
    return r.status < 300;
  }
}
