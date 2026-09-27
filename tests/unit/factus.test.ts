import { describe, expect, it } from "vitest";
import {
  codigoMetodoPago,
  construirCustomer,
  construirPayloadFactus,
  construirPayloadNotaCreditoFactus,
  debeFacturar,
  leerRespuestaFactus,
  parseFechaFactus,
  separarNit,
  totalFactus,
} from "@/lib/facturacion/payload";
import { FactusProvider, _limpiarTokensFactus } from "@/lib/facturacion/factus";
import { cufeSimulado, numeroSimulado } from "@/lib/facturacion/simulado";
import type { DatosFactura } from "@/lib/facturacion/tipos";

const datos = (extra: Partial<DatosFactura> = {}): DatosFactura => ({
  referenceCode: "RES-abc123",
  numberingRangeId: 8,
  medioPago: "PSE",
  cliente: { tipoDocumento: "CC", numeroDocumento: "1045678901", nombre: "Laura Gómez Fontalvo", email: "propietario@demo.co", municipioCodigo: "08001" },
  items: [{ codigo: "ZONA-SALON", nombre: "Salón social", cantidad: 1, precio: 250000, tarifaIva: 19 }],
  totalPagado: 297500,
  ...extra,
});

describe("payload de Factus (POST /v2/bills/validate)", () => {
  it("arma la factura estándar con IVA 19 %", () => {
    const p = construirPayloadFactus(datos());
    expect(p).toMatchObject({ reference_code: "RES-abc123", document: "01", operation_type: "10", numbering_range_id: 8 });
    expect(p.payment_details).toEqual([{ payment_form: "1", payment_method_code: "47", amount: "297500.00" }]);
    expect(p.items).toEqual([
      { code_reference: "ZONA-SALON", name: "Salón social", quantity: "1.00", discount_rate: "0.00", price: "250000.00", unit_measure_code: "94", standard_code: "999", taxes: [{ code: "01", rate: "19.00" }] },
    ]);
    expect("cash_rounding_amount" in p).toBe(false);
    expect(totalFactus(datos().items)).toBe(297500);
  });

  it("customer de persona natural: CC → 13, organización 2, tributo ZZ, R-99-PN, municipio DIVIPOLA", () => {
    expect(construirPayloadFactus(datos()).customer).toEqual({
      identification_document_code: "13",
      identification: "1045678901",
      legal_organization_code: "2",
      names: "Laura Gómez Fontalvo",
      tribute_code: "ZZ",
      responsibilities: ["R-99-PN"],
      country_code: "CO",
      email: "propietario@demo.co",
      municipality_code: "08001",
    });
  });

  it("customer con NIT: persona jurídica, separa el dígito de verificación", () => {
    expect(separarNit("900.123.456-7")).toEqual({ id: "900123456", dv: "7" });
    const c = construirCustomer({ tipoDocumento: "NIT", numeroDocumento: "900123456-7", nombre: "Eventos SAS" });
    expect(c).toMatchObject({ identification_document_code: "31", identification: "900123456", dv: "7", legal_organization_code: "1", company: "Eventos SAS" });
    expect(c.names).toBeUndefined();
    expect(construirCustomer({ tipoDocumento: "CE", numeroDocumento: "E123", nombre: "X" }).identification_document_code).toBe("22");
    expect(construirCustomer({ tipoDocumento: "PPT", numeroDocumento: "123", nombre: "X" }).identification_document_code).toBe("48");
    expect(construirCustomer({ tipoDocumento: "PA", numeroDocumento: "AB123", nombre: "X" }).identification_document_code).toBe("41");
  });

  it("códigos de método de pago según el medio", () => {
    expect(codigoMetodoPago("TRANSFERENCIA")).toBe("47");
    expect(codigoMetodoPago("PSE")).toBe("47");
    expect(codigoMetodoPago("NEQUI")).toBe("47");
    expect(codigoMetodoPago("TARJETA")).toBe("48");
    expect(codigoMetodoPago("TARJETA", { card: { type: "DEBIT" } })).toBe("49");
    expect(codigoMetodoPago("PASARELA", { payment_method_type: "CARD" })).toBe("48");
    expect(codigoMetodoPago("CONSIGNACION")).toBe("42");
    expect(codigoMetodoPago("EFECTIVO")).toBe("10");
    expect(codigoMetodoPago("OTRO")).toBe("1");
  });

  it("ajuste de redondeo cuando el IVA de cartera (al peso) difiere del de Factus", () => {
    // base 33.333 × 19 % = 6.333,27 en Factus; cartera cobra 6.333 → total 39.666
    const p = construirPayloadFactus(datos({ items: [{ codigo: "Z", nombre: "BBQ", cantidad: 1, precio: 33333, tarifaIva: 19 }], totalPagado: 39666 }));
    expect(p.cash_rounding_amount).toBe("-0.27");
    expect(() => construirPayloadFactus(datos({ totalPagado: 100 }))).toThrow(/no coincide/);
  });

  it("ítem excluido de IVA", () => {
    const p = construirPayloadFactus(datos({ items: [{ codigo: "Z", nombre: "Cancha", cantidad: 1, precio: 50000, tarifaIva: 0, excluido: true }], totalPagado: 50000 }));
    expect(p.items[0].taxes).toEqual([{ code: "01", rate: "0.00", is_excluded: true }]);
  });

  it("nota crédito de anulación referencia la factura", () => {
    const p = construirPayloadNotaCreditoFactus({ ...datos({ referenceCode: "NC-RES-abc123", numberingRangeId: null }), numeroFactura: "SETP990000012", conceptoCorreccion: "2" });
    expect(p).toMatchObject({ reference_code: "NC-RES-abc123", correction_concept_code: "2", customization_id: "20", bill_number: "SETP990000012" });
    expect(p.items[0].price).toBe("250000.00");
    expect("numbering_range_id" in p).toBe(false);
  });

  it("regla DIAN: solo alquileres gravados, nunca administración ni multas", () => {
    expect(debeFacturar({ conceptoTipo: "ALQUILER_ZONA", valor: 250000, generaFactura: true })).toBe(true);
    expect(debeFacturar({ conceptoTipo: "PARQUEADERO", valor: 5000, generaFactura: true })).toBe(true);
    expect(debeFacturar({ conceptoTipo: "ALQUILER_ZONA", valor: 0, generaFactura: true })).toBe(false);
    expect(debeFacturar({ conceptoTipo: "ALQUILER_ZONA", valor: 250000, generaFactura: false })).toBe(false);
    for (const t of ["ADMINISTRACION", "EXTRAORDINARIA", "MULTA", "INTERES_MORA"]) expect(debeFacturar({ conceptoTipo: t, valor: 100000, generaFactura: true })).toBe(false);
  });
});

describe("respuesta de Factus", () => {
  it("lee número, CUFE, validación, enlaces y fecha", () => {
    const r = leerRespuestaFactus({
      status: "Created",
      data: { bill: { number: "SETP990002443", cufe: "a821f2", is_validated: true, validated_at: "13-05-2026 08:21:49 PM", errors: {}, links: { qr: "https://qr", public_url: "https://pub" } } },
    });
    expect(r).toMatchObject({ numero: "SETP990002443", cufe: "a821f2", validada: true, urlPublica: "https://pub", qr: "https://qr", errores: null });
    expect(r.validadaEn!.toISOString()).toBe("2026-05-14T01:21:49.000Z");
    expect(parseFechaFactus("01-01-2026 12:05:00 AM")!.toISOString()).toBe("2026-01-01T05:05:00.000Z");
  });
});

describe("FactusProvider (red simulada)", () => {
  it("autentica con password grant, cachea el token y ante 409 elimina el pendiente y reintenta", async () => {
    _limpiarTokensFactus();
    const llamadas: string[] = [];
    let validaciones = 0;
    const fake = (async (url: string, init?: RequestInit) => {
      const u = String(url).replace("https://api-sandbox.factus.com.co", "");
      llamadas.push(`${init?.method} ${u}`);
      const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      if (u === "/oauth/token") {
        const fd = init?.body as FormData;
        expect(fd.get("grant_type")).toBe("password");
        return json(200, { access_token: "tok", refresh_token: "ref", expires_in: 3600 });
      }
      if (u === "/v2/bills/validate") {
        validaciones++;
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
        return validaciones === 1 ? json(409, { message: "Se encontró un documento pendiente por enviar a la DIAN" }) : json(201, { data: { bill: { number: "SETP1", cufe: "c", is_validated: true, links: {} } } });
      }
      if (u.startsWith("/v2/bills/destroy/reference/")) return json(200, { status: "OK" });
      return json(404, {});
    }) as unknown as typeof fetch;
    const p = new FactusProvider("conj1", { clientId: "id", clientSecret: "s", username: "u@x.co", password: "p" }, { fetch: fake, esperaBaseMs: 0 });
    const r = await p.emitirFactura(datos());
    expect(r.ok).toBe(true);
    expect(r.numero).toBe("SETP1");
    expect(llamadas).toEqual(["POST /oauth/token", "POST /v2/bills/validate", "DELETE /v2/bills/destroy/reference/RES-abc123", "POST /v2/bills/validate"]);
    await p.emitirFactura(datos());
    expect(llamadas.filter((l) => l.includes("oauth")).length).toBe(1); // token cacheado por conjunto
  });

  it("reintenta errores 5xx con backoff y reporta errores DIAN (422) sin reintentar", async () => {
    _limpiarTokensFactus();
    let n = 0;
    const fake = (async (url: string) => {
      const u = String(url);
      if (u.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      n++;
      if (n === 1) return new Response("{}", { status: 503 });
      return new Response(JSON.stringify({ message: "Validación", data: { errors: { customer: "requerido" } } }), { status: 422 });
    }) as unknown as typeof fetch;
    const p = new FactusProvider("conj2", { clientId: "id", clientSecret: "s", username: "u", password: "p" }, { fetch: fake, esperaBaseMs: 0 });
    const r = await p.emitirFactura(datos());
    expect(n).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.reintentable).toBe(false);
    expect(r.errores).toEqual({ customer: "requerido" });
  });
});

describe("simulador", () => {
  it("numera SETP-990000xxx y genera CUFE SHA-384", () => {
    expect(numeroSimulado("FACTURA", 7)).toBe("SETP-990000007");
    const c = cufeSimulado({ numero: "SETP-990000007", fecha: new Date("2026-01-01T00:00:00Z"), total: 297500, nit: "900", cliente: "1" });
    expect(c).toMatch(/^[0-9a-f]{96}$/);
  });
});
