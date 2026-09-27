import type { MedioPago } from "@prisma/client";
import { mpVerificarFirma } from "../firmas";
import {
  FirmaInvalidaError,
  type EstadoEvento,
  type EventoPago,
  type OpcionesCheckout,
  type PagoCheckout,
  type PaymentProvider,
  type ResultadoCheckout,
  type WebhookInput,
} from "../types";

/**
 * Mercado Pago: Checkout Pro (preferencias) + notificaciones Webhooks con `x-signature`.
 * Docs: https://www.mercadopago.com.co/developers/es/docs/checkout-pro y /your-integrations/notifications/webhooks
 */
export type MercadoPagoCreds = { accessToken: string; publicKey?: string; webhookSecret?: string };

const API = "https://api.mercadopago.com";

export function mpEstado(status: string | undefined): EstadoEvento {
  if (status === "approved") return "APROBADO";
  if (status === "rejected" || status === "cancelled" || status === "refunded" || status === "charged_back") return "RECHAZADO";
  return "PENDIENTE";
}

export function mpMedio(tipo: string | undefined, metodo?: string): MedioPago {
  if (metodo === "pse" || tipo === "bank_transfer") return "PSE";
  if (tipo === "credit_card" || tipo === "debit_card" || tipo === "prepaid_card") return "TARJETA";
  return "PASARELA";
}

type MpPayment = {
  id?: number | string;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  payment_type_id?: string;
  payment_method_id?: string;
};

function normalizar(p: MpPayment): EventoPago | null {
  if (!p?.external_reference) return null;
  return {
    referencia: p.external_reference,
    estado: mpEstado(p.status),
    referenciaExterna: p.id !== undefined ? String(p.id) : null,
    medio: mpMedio(p.payment_type_id, p.payment_method_id),
    valor: typeof p.transaction_amount === "number" ? Math.round(p.transaction_amount) : null,
    raw: p,
  };
}

export class MercadoPagoProvider implements PaymentProvider {
  readonly pasarela = "MERCADOPAGO" as const;
  constructor(private creds: MercadoPagoCreds) {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.creds.accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Mercado Pago respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async crearCheckout(pago: PagoCheckout, opciones: OpcionesCheckout): Promise<ResultadoCheckout> {
    const pref = await this.api<{ id: string; init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": pago.referencia },
      body: JSON.stringify({
        items: [{ id: pago.referencia, title: pago.descripcion.slice(0, 250), quantity: 1, unit_price: Math.round(pago.valor), currency_id: "COP" }],
        external_reference: pago.referencia,
        payer: pago.pagadorEmail ? { email: pago.pagadorEmail, name: pago.pagadorNombre ?? undefined } : undefined,
        back_urls: { success: opciones.redirectUrl, failure: opciones.redirectUrl, pending: opciones.redirectUrl },
        auto_return: "approved",
        notification_url: opciones.webhookUrl,
        statement_descriptor: "MICONJUNTO",
        expires: true,
        expiration_date_to: new Date(Date.now() + 24 * 3600_000).toISOString(),
      }),
    });
    const sandbox = this.creds.accessToken.startsWith("TEST-");
    return { url: (sandbox && pref.sandbox_init_point) || pref.init_point, datos: { preferenceId: pref.id } };
  }

  async verificarWebhook({ rawBody, headers, url }: WebhookInput): Promise<EventoPago | null> {
    let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      /* algunos avisos llegan sin cuerpo */
    }
    const dataId = url.searchParams.get("data.id") ?? (body.data?.id !== undefined ? String(body.data.id) : null);
    const ok = mpVerificarFirma({
      xSignature: headers.get("x-signature"),
      xRequestId: headers.get("x-request-id"),
      dataId,
      secreto: this.creds.webhookSecret ?? "",
    });
    if (!ok) throw new FirmaInvalidaError("x-signature de Mercado Pago inválida");
    const tipo = url.searchParams.get("type") ?? body.type;
    if (tipo !== "payment" || !dataId) return null;
    // La notificación solo trae el id: el estado real se consulta a la API (no se confía en el cuerpo).
    const p = await this.api<MpPayment>(`/v1/payments/${encodeURIComponent(dataId)}`);
    return normalizar(p);
  }

  async consultarEstado(referencia: string): Promise<EventoPago | null> {
    const r = await this.api<{ results?: MpPayment[] }>(
      `/v1/payments/search?external_reference=${encodeURIComponent(referencia)}&sort=date_created&criteria=desc`,
    );
    const list = r.results ?? [];
    const p = list.find((x) => x.status === "approved") ?? list[0];
    return p ? normalizar(p) : null;
  }
}
