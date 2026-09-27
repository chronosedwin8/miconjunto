/**
 * Construcción PURA de los cuerpos de la API de Factus v2 (sin BD ni red). Probada en tests/unit/factus.test.ts.
 * Referencia: docs/integraciones/factus-skill.md y https://developers.factus.com.co/tablas-de-referencia/tablas/
 */
import type { ClienteFactura, DatosFactura, DatosNotaCredito, ItemFactura } from "./tipos";

/** Tipo de documento (Persona.tipoDocumento) → código DIAN `identification_document_code`. */
export const CODIGO_DOCUMENTO: Record<string, string> = {
  RC: "11",
  TI: "12",
  CC: "13",
  TE: "21",
  CE: "22",
  NIT: "31",
  PA: "41",
  DIE: "42",
  PEP: "47",
  PPT: "48",
};

/** Medio de pago de MiConjunto → `payment_method_code` DIAN (tabla "Códigos de métodos de pago"). */
export function codigoMetodoPago(medio: string, datosPasarela?: unknown): string {
  const dp = (datosPasarela ?? {}) as Record<string, unknown>;
  const texto = JSON.stringify(dp).toUpperCase();
  switch (medio) {
    case "EFECTIVO":
      return "10";
    case "CONSIGNACION":
      return "42";
    case "TARJETA":
      return /DEBIT|DEBITO|DÉBITO/.test(texto) ? "49" : "48";
    case "PASARELA":
      if (/CARD|TARJETA/.test(texto)) return /DEBIT|DEBITO|DÉBITO/.test(texto) ? "49" : "48";
      return "47";
    case "PSE":
    case "NEQUI":
    case "BANCOLOMBIA_QR":
    case "TRANSFERENCIA":
      return "47";
    default:
      return "1"; // medio de pago no definido
  }
}

export const d2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Separa NIT y dígito de verificación ("900123456-7" → { id: "900123456", dv: "7" }). */
export function separarNit(numero: string) {
  const limpio = numero.replace(/[\s.]/g, "");
  const m = limpio.match(/^(\d+)-(\d)$/);
  return m ? { id: m[1], dv: m[2] } : { id: limpio.replace(/\D/g, ""), dv: undefined };
}

export function construirCustomer(c: ClienteFactura) {
  const esNit = c.tipoDocumento === "NIT";
  const { id, dv } = esNit ? separarNit(c.numeroDocumento) : { id: c.numeroDocumento.replace(/\D/g, "") || c.numeroDocumento, dv: undefined };
  const customer: Record<string, unknown> = {
    identification_document_code: CODIGO_DOCUMENTO[c.tipoDocumento] ?? "13",
    identification: id,
    ...(dv ? { dv } : {}),
    legal_organization_code: esNit ? "1" : "2",
    ...(esNit ? { company: c.nombre } : { names: c.nombre }),
    tribute_code: "ZZ",
    responsibilities: ["R-99-PN"],
    country_code: "CO",
  };
  if (c.email) customer.email = c.email;
  if (c.telefono) customer.phone = c.telefono;
  if (c.direccion) customer.address = c.direccion;
  if (c.municipioCodigo) customer.municipality_code = c.municipioCodigo;
  return customer;
}

export function construirItems(items: ItemFactura[]) {
  return items.map((it) => ({
    code_reference: it.codigo,
    name: it.nombre.slice(0, 250),
    quantity: d2(it.cantidad),
    discount_rate: "0.00",
    price: d2(it.precio),
    unit_measure_code: "94", // unidad
    standard_code: "999", // estándar de adopción del contribuyente
    taxes: [{ code: "01", rate: d2(it.excluido ? 0 : it.tarifaIva), ...(it.excluido ? { is_excluded: true } : {}) }],
  }));
}

/** Total que calcula Factus (base + IVA por ítem, con 2 decimales). */
export function totalFactus(items: ItemFactura[]) {
  return items.reduce((a, it) => {
    const base = Math.round(it.precio * it.cantidad * 100) / 100;
    const iva = it.excluido ? 0 : Math.round(base * it.tarifaIva) / 100;
    return Math.round((a + base + iva) * 100) / 100;
  }, 0);
}

/** Cuerpo de `POST /v2/bills/validate` (factura estándar, contado). */
export function construirPayloadFactus(d: DatosFactura) {
  const total = totalFactus(d.items);
  const ajuste = Math.round((d.totalPagado - total) * 100) / 100;
  if (Math.abs(ajuste) > 500) throw new Error(`El total pagado (${d.totalPagado}) no coincide con el total de la factura (${total}).`);
  return {
    reference_code: d.referenceCode,
    document: "01",
    ...(d.numberingRangeId ? { numbering_range_id: d.numberingRangeId } : {}),
    operation_type: "10",
    send_email: d.enviarCorreo ?? true,
    ...(d.observacion ? { observation: d.observacion.slice(0, 250) } : {}),
    payment_details: [
      {
        payment_form: "1",
        payment_method_code: codigoMetodoPago(d.medioPago, d.datosPasarela),
        ...(d.referenciaPago ? { reference_code: d.referenciaPago } : {}),
        amount: d2(d.totalPagado),
      },
    ],
    ...(ajuste !== 0 ? { cash_rounding_amount: d2(ajuste) } : {}),
    customer: construirCustomer(d.cliente),
    items: construirItems(d.items),
  };
}

/** Cuerpo de `POST /v2/credit-notes/validate` (nota crédito que referencia una factura). */
export function construirPayloadNotaCreditoFactus(d: DatosNotaCredito) {
  const f = construirPayloadFactus(d);
  return {
    reference_code: d.referenceCode,
    correction_concept_code: d.conceptoCorreccion,
    customization_id: "20",
    bill_number: d.numeroFactura,
    ...(d.numberingRangeId ? { numbering_range_id: d.numberingRangeId } : {}),
    ...(d.observacion ? { observation: d.observacion.slice(0, 500) } : {}),
    payment_details: f.payment_details,
    ...("cash_rounding_amount" in f ? { cash_rounding_amount: f.cash_rounding_amount } : {}),
    customer: f.customer,
    items: f.items,
  };
}

/**
 * Regla DIAN (spec §5.13 y §15): solo se factura electrónicamente el alquiler gravado de zonas comunes
 * y parqueaderos de visitantes con cobro separado. Administración, extraordinarias, intereses y multas
 * NUNCA se facturan (son expensas / sanciones: llevan recibo o cuenta de cobro).
 */
export function debeFacturar(p: { conceptoTipo: string; valor: number; generaFactura: boolean }) {
  if (!["ALQUILER_ZONA", "PARQUEADERO"].includes(p.conceptoTipo)) return false;
  return p.valor > 0 && p.generaFactura;
}

/** Normaliza la respuesta de validación de Factus. */
export function leerRespuestaFactus(json: unknown) {
  const data = ((json as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>;
  const bill = ((data.bill as Record<string, unknown>) ?? (data.credit_note as Record<string, unknown>) ?? data) as Record<string, unknown>;
  const links = (bill.links ?? data.links ?? {}) as Record<string, string>;
  const errores = bill.errors ?? data.errors ?? null;
  return {
    numero: (bill.number as string) ?? null,
    cufe: (bill.cufe as string) ?? (bill.cude as string) ?? null,
    validada: bill.is_validated === true || bill.is_validated === 1 || bill.status === 1,
    validadaEn: parseFechaFactus(bill.validated_at as string | undefined),
    urlPublica: links.public_url ?? (bill.public_url as string) ?? null,
    qr: links.qr ?? (bill.qr as string) ?? null,
    errores: errores && typeof errores === "object" && Object.keys(errores as object).length ? errores : null,
  };
}

/** Factus devuelve "13-05-2026 08:21:49 AM" (hora de Colombia). */
export function parseFechaFactus(s?: string | null) {
  if (!s) return null;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4}) (\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let h = Number(m[4]);
  if (m[7]?.toUpperCase() === "PM" && h < 12) h += 12;
  if (m[7]?.toUpperCase() === "AM" && h === 12) h = 0;
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${String(h).padStart(2, "0")}:${m[5]}:${m[6]}-05:00`);
}
