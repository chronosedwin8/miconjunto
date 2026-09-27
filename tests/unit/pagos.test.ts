import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  mpFirmar,
  mpManifiesto,
  mpVerificarFirma,
  simuladorFirmar,
  simuladorVerificar,
  wompiChecksumEvento,
  wompiFirmaIntegridad,
  wompiVerificarEvento,
  type WompiEvento,
} from "@/lib/pagos/firmas";
import { aCentavos, calcularValorPago, ErrorCalculoPago, valorHoy, type CuotaPagable } from "@/lib/pagos/calculos";
import { wompiEstado, wompiMedio } from "@/lib/pagos/providers/wompi";
import { mpEstado, mpMedio } from "@/lib/pagos/providers/mercadopago";

describe("Wompi — firma de integridad", () => {
  it("coincide con el ejemplo de la documentación de Wompi", () => {
    // https://docs.wompi.co/docs/colombia/widget-checkout-web/ (firma de integridad)
    const f = wompiFirmaIntegridad("sk8-438k4-xmxm392-sn2m", 2490000, "COP", "prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6");
    expect(f).toBe("37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5");
  });

  it("es sha256(referencia + centavos + moneda + secreto) y los pesos se pasan a centavos", () => {
    const esperado = crypto.createHash("sha256").update("P123ABC27000000COPsecreto").digest("hex");
    expect(wompiFirmaIntegridad("P123ABC", aCentavos(270000), "COP", "secreto")).toBe(esperado);
    expect(aCentavos(270000)).toBe(27000000);
  });
});

describe("Wompi — checksum de eventos", () => {
  const evento: WompiEvento = {
    event: "transaction.updated",
    data: { transaction: { id: "1234-1610641025-49201", status: "APPROVED", amount_in_cents: 4490000, reference: "REF1", payment_method_type: "NEQUI" } },
    signature: { properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"], checksum: "" },
    timestamp: 1530291411,
  };
  const secreto = "prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";

  it("concatena como la documentación de Wompi: valores de properties + timestamp + secreto", () => {
    // Cadena del ejemplo de https://docs.wompi.co/docs/colombia/eventos/ (el checksum publicado allí es ilustrativo).
    const cadena = "1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z";
    expect(wompiChecksumEvento(evento, secreto)).toBe(crypto.createHash("sha256").update(cadena).digest("hex"));
  });

  it("acepta el checksum correcto (mayúsculas o minúsculas) y rechaza alteraciones", () => {
    const ok = { ...evento, signature: { ...evento.signature, checksum: wompiChecksumEvento(evento, secreto).toUpperCase() } };
    expect(wompiVerificarEvento(ok, secreto)).toBe(true);
    expect(wompiVerificarEvento(ok, secreto, ok.signature.checksum)).toBe(true);
    const alterado = { ...ok, data: { transaction: { ...(ok.data!.transaction as object), amount_in_cents: 100 } } };
    expect(wompiVerificarEvento(alterado, secreto)).toBe(false);
    expect(wompiVerificarEvento(ok, "otro-secreto")).toBe(false);
    expect(wompiVerificarEvento({ ...ok, timestamp: 1530291412 }, secreto)).toBe(false);
    expect(wompiVerificarEvento({ ...ok, signature: { properties: [], checksum: "x" } }, secreto)).toBe(false);
  });

  it("normaliza estados y medios de Wompi", () => {
    expect(wompiEstado("APPROVED")).toBe("APROBADO");
    expect(wompiEstado("DECLINED")).toBe("RECHAZADO");
    expect(wompiEstado("VOIDED")).toBe("RECHAZADO");
    expect(wompiEstado("PENDING")).toBe("PENDIENTE");
    expect(wompiMedio("CARD")).toBe("TARJETA");
    expect(wompiMedio("PSE")).toBe("PSE");
    expect(wompiMedio("NEQUI")).toBe("NEQUI");
    expect(wompiMedio("BANCOLOMBIA_TRANSFER")).toBe("BANCOLOMBIA_QR");
  });
});

describe("Mercado Pago — x-signature", () => {
  const secreto = "mp-webhook-secret";

  it("arma el manifiesto id;request-id;ts (id alfanumérico en minúsculas)", () => {
    expect(mpManifiesto("ABC123", "req-1", "1704908010")).toBe("id:abc123;request-id:req-1;ts:1704908010;");
    expect(mpManifiesto("123456", null, "1")).toBe("id:123456;ts:1;");
  });

  it("verifica HMAC-SHA256 del manifiesto y rechaza firmas alteradas", () => {
    const v1 = crypto.createHmac("sha256", secreto).update("id:98765;request-id:abc-def;ts:1704908010;").digest("hex");
    expect(mpFirmar("98765", "abc-def", "1704908010", secreto)).toBe(v1);
    const header = `ts=1704908010,v1=${v1}`;
    expect(mpVerificarFirma({ xSignature: header, xRequestId: "abc-def", dataId: "98765", secreto })).toBe(true);
    expect(mpVerificarFirma({ xSignature: header, xRequestId: "abc-def", dataId: "98766", secreto })).toBe(false);
    expect(mpVerificarFirma({ xSignature: header, xRequestId: "otro", dataId: "98765", secreto })).toBe(false);
    expect(mpVerificarFirma({ xSignature: `ts=1704908011,v1=${v1}`, xRequestId: "abc-def", dataId: "98765", secreto })).toBe(false);
    expect(mpVerificarFirma({ xSignature: null, xRequestId: "abc-def", dataId: "98765", secreto })).toBe(false);
    expect(mpVerificarFirma({ xSignature: header, xRequestId: "abc-def", dataId: "98765", secreto: "" })).toBe(false);
  });

  it("normaliza estados y medios de Mercado Pago", () => {
    expect(mpEstado("approved")).toBe("APROBADO");
    expect(mpEstado("rejected")).toBe("RECHAZADO");
    expect(mpEstado("in_process")).toBe("PENDIENTE");
    expect(mpMedio("bank_transfer", "pse")).toBe("PSE");
    expect(mpMedio("credit_card")).toBe("TARJETA");
  });
});

describe("Simulador — webhook firmado", () => {
  it("firma con HMAC y rechaza cuerpo alterado o firma vieja", () => {
    const body = JSON.stringify({ referencia: "R1", estado: "APROBADO" });
    const ahora = Math.floor(Date.now() / 1000);
    const h = simuladorFirmar(body, ahora);
    expect(simuladorVerificar(body, h, 300, ahora)).toBe(true);
    expect(simuladorVerificar(body.replace("APROBADO", "RECHAZADO"), h, 300, ahora)).toBe(false);
    expect(simuladorVerificar(body, h, 300, ahora + 301)).toBe(false);
    expect(simuladorVerificar(body, "t=1,v1=abc", 300, ahora)).toBe(false);
    expect(simuladorVerificar(body, null)).toBe(false);
  });
});

describe("Cálculo del valor a pagar", () => {
  const hoy = new Date("2026-09-03T15:00:00Z");
  const q = (id: string, o: Partial<CuotaPagable> = {}): CuotaPagable => ({
    id,
    descripcion: id,
    tipo: "ADMINISTRACION",
    saldo: 300000,
    valorBase: 300000,
    valorTotal: 300000,
    fechaVencimiento: new Date("2026-09-10T05:00:00Z"),
    fechaProntoPago: null,
    porcentajeProntoPago: 0,
    ...o,
  });
  const vencida = q("ago", { fechaVencimiento: new Date("2026-08-10T05:00:00Z") });
  const actual = q("sep", { fechaProntoPago: new Date("2026-09-05T05:00:00Z"), porcentajeProntoPago: 10 });
  const interes = q("int", { tipo: "INTERES_MORA", saldo: 5000, valorBase: 5000, valorTotal: 5000 });
  const cuotas = [vencida, actual, interes];

  it("paga el saldo total con el descuento de pronto pago vigente", () => {
    const r = calcularValorPago(cuotas, { permitirAbonos: true, hoy });
    expect(r.modo).toBe("TOTAL");
    expect(r.valor).toBe(300000 + 270000 + 5000);
    expect(r.descuento).toBe(30000);
    expect(r.cuotaIds).toHaveLength(3);
  });

  it("paga solo las cuotas elegidas", () => {
    const r = calcularValorPago(cuotas, { cuotaIds: ["sep"], permitirAbonos: true, hoy });
    expect(r).toMatchObject({ modo: "CUOTAS", valor: 270000, descuento: 30000, cuotaIds: ["sep"] });
  });

  it("no da descuento después de la fecha de pronto pago ni a cuotas ya abonadas", () => {
    expect(valorHoy(actual, new Date("2026-09-06T15:00:00Z"))).toBe(300000);
    expect(valorHoy({ ...actual, saldo: 100000 }, hoy)).toBe(100000);
    expect(valorHoy({ ...actual, tipo: "MULTA" }, hoy)).toBe(300000);
  });

  it("abono parcial solo si el conjunto lo permite; si supera el saldo paga el total", () => {
    expect(calcularValorPago(cuotas, { valor: 100000, permitirAbonos: true, hoy })).toMatchObject({ modo: "ABONO", valor: 100000, cuotaIds: [] });
    expect(() => calcularValorPago(cuotas, { valor: 100000, permitirAbonos: false, hoy })).toThrow(ErrorCalculoPago);
    expect(calcularValorPago(cuotas, { valor: 9_999_999, permitirAbonos: false, hoy })).toMatchObject({ modo: "TOTAL", valor: 575000 });
    expect(() => calcularValorPago(cuotas, { valor: 500, permitirAbonos: true, hoy })).toThrow(/mínimo/);
  });

  it("rechaza cuotas ajenas o pagadas y cuentas sin saldo", () => {
    expect(() => calcularValorPago(cuotas, { cuotaIds: ["otra"], permitirAbonos: true, hoy })).toThrow(/cuotas elegidas/);
    expect(() => calcularValorPago([], { permitirAbonos: true, hoy })).toThrow(/saldo pendiente/);
  });
});
