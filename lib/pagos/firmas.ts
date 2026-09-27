import crypto from "node:crypto";
import { hmacSha256Hex, sha256Hex } from "@/lib/crypto";

/**
 * Firmas de las pasarelas (funciones puras, probadas en tests/unit/pagos.test.ts).
 */

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a.toLowerCase(), "utf8");
  const bb = Buffer.from(b.toLowerCase(), "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ── Wompi ────────────────────────────────────────────────────────────────

/** Firma de integridad del Web Checkout: sha256(referencia + montoEnCentavos + moneda + secretoIntegridad). */
export function wompiFirmaIntegridad(referencia: string, montoEnCentavos: number, moneda: string, secretoIntegridad: string) {
  return sha256Hex(`${referencia}${montoEnCentavos}${moneda}${secretoIntegridad}`);
}

export type WompiEvento = {
  event?: string;
  data?: Record<string, unknown>;
  environment?: string;
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number | string;
  sent_at?: string;
};

function dig(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** Checksum esperado de un evento: sha256(valores de `signature.properties` tomados de `data` + timestamp + secretoEventos). */
export function wompiChecksumEvento(evento: WompiEvento, secretoEventos: string) {
  const props = evento.signature?.properties ?? [];
  const valores = props.map((p) => {
    const v = dig(evento.data, p);
    return v === undefined || v === null ? "" : String(v);
  });
  return sha256Hex(`${valores.join("")}${evento.timestamp ?? ""}${secretoEventos}`);
}

/** Verifica el checksum del evento (y, si viene, el encabezado X-Event-Checksum). */
export function wompiVerificarEvento(evento: WompiEvento, secretoEventos: string, headerChecksum?: string | null) {
  const recibido = evento.signature?.checksum ?? headerChecksum ?? "";
  if (!recibido || !secretoEventos || !evento.signature?.properties?.length) return false;
  const esperado = wompiChecksumEvento(evento, secretoEventos);
  if (!safeEqual(esperado, recibido)) return false;
  if (headerChecksum && !safeEqual(esperado, headerChecksum)) return false;
  return true;
}

// ── Mercado Pago ─────────────────────────────────────────────────────────

/** Separa el encabezado `x-signature: ts=…,v1=…`. */
export function mpParseFirma(header: string | null | undefined) {
  const out: { ts?: string; v1?: string } = {};
  for (const part of (header ?? "").split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k === "ts") out.ts = v;
    if (k === "v1") out.v1 = v;
  }
  return out;
}

/** Plantilla firmada por Mercado Pago: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (se omiten las partes ausentes). */
export function mpManifiesto(dataId: string | null | undefined, requestId: string | null | undefined, ts: string) {
  let m = "";
  if (dataId) m += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) m += `request-id:${requestId};`;
  m += `ts:${ts};`;
  return m;
}

export function mpFirmar(dataId: string | null | undefined, requestId: string | null | undefined, ts: string, secreto: string) {
  return hmacSha256Hex(secreto, mpManifiesto(dataId, requestId, ts));
}

/** Verifica `x-signature` (HMAC-SHA256 del manifiesto con el secreto del webhook). */
export function mpVerificarFirma(opts: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secreto: string }) {
  const { ts, v1 } = mpParseFirma(opts.xSignature);
  if (!ts || !v1 || !opts.secreto) return false;
  return safeEqual(mpFirmar(opts.dataId, opts.xRequestId, ts, opts.secreto), v1);
}

// ── Simulador ────────────────────────────────────────────────────────────

function claveSimulador() {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k) throw new Error("APP_ENCRYPTION_KEY no está configurada");
  return `simulador-pagos:${k}`;
}

/** Encabezado `x-simulador-firma: t=<ts>,v1=<hmac(t.body)>` para el webhook del simulador. */
export function simuladorFirmar(body: string, ts = Math.floor(Date.now() / 1000)) {
  return `t=${ts},v1=${hmacSha256Hex(claveSimulador(), `${ts}.${body}`)}`;
}

export function simuladorVerificar(body: string, header: string | null | undefined, toleranciaSeg = 300, ahora = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string]));
  const ts = Number(parts.t);
  if (!ts || !parts.v1 || Math.abs(ahora - ts) > toleranciaSeg) return false;
  return safeEqual(hmacSha256Hex(claveSimulador(), `${ts}.${body}`), parts.v1);
}

/** Token del checkout simulado (solo quien recibió la URL puede aprobar o rechazar esa referencia). */
export function simuladorTokenCheckout(referencia: string) {
  return hmacSha256Hex(claveSimulador(), `checkout:${referencia}`).slice(0, 32);
}

export function simuladorVerificarTokenCheckout(referencia: string, token: string | null | undefined) {
  return !!token && safeEqual(simuladorTokenCheckout(referencia), token);
}

// ── Estado público de un pago ────────────────────────────────────────────

/** Firma corta para ver el estado de un pago hecho desde el link público, sin sesión (`/pagar/estado/<ref>?f=`). */
export function firmaEstadoPublico(referencia: string) {
  return hmacSha256Hex(claveSimulador(), `estado:${referencia}`).slice(0, 24);
}

export function verificarFirmaEstado(referencia: string, f: string | null | undefined) {
  return !!f && safeEqual(firmaEstadoPublico(referencia), f);
}
