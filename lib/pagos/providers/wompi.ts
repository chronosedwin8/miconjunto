import type { MedioPago } from "@prisma/client";
import { aCentavos, deCentavos } from "../calculos";
import { wompiFirmaIntegridad, wompiVerificarEvento, type WompiEvento } from "../firmas";
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
 * Wompi (Bancolombia): Web Checkout por redirección + eventos `transaction.updated`.
 * Docs: https://docs.wompi.co/docs/colombia/widget-checkout-web/ y /eventos/
 */
export type WompiCreds = { publicKey: string; privateKey?: string; eventsSecret?: string; integritySecret: string; env?: string };

export const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";

export function wompiApiBase(env?: string) {
  return (env ?? "sandbox").toLowerCase().startsWith("prod") ? "https://production.wompi.co/v1" : "https://sandbox.wompi.co/v1";
}

export function wompiEstado(status: string | undefined): EstadoEvento {
  if (status === "APPROVED") return "APROBADO";
  if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") return "RECHAZADO";
  return "PENDIENTE";
}

export function wompiMedio(tipo: string | undefined): MedioPago {
  switch (tipo) {
    case "CARD":
      return "TARJETA";
    case "PSE":
      return "PSE";
    case "NEQUI":
      return "NEQUI";
    case "BANCOLOMBIA_TRANSFER":
    case "BANCOLOMBIA_QR":
    case "BANCOLOMBIA_COLLECT":
    case "BANCOLOMBIA_BNPL":
      return "BANCOLOMBIA_QR";
    default:
      return "PASARELA";
  }
}

type WompiTx = { id?: string; status?: string; reference?: string; amount_in_cents?: number; payment_method_type?: string; finalized_at?: string };

function normalizar(tx: WompiTx, raw: unknown): EventoPago | null {
  if (!tx?.reference) return null;
  return {
    referencia: tx.reference,
    estado: wompiEstado(tx.status),
    referenciaExterna: tx.id ?? null,
    medio: wompiMedio(tx.payment_method_type),
    valor: typeof tx.amount_in_cents === "number" ? deCentavos(tx.amount_in_cents) : null,
    raw,
  };
}

export class WompiProvider implements PaymentProvider {
  readonly pasarela = "WOMPI" as const;
  constructor(private creds: WompiCreds) {}

  async crearCheckout(pago: PagoCheckout, opciones: OpcionesCheckout): Promise<ResultadoCheckout> {
    const centavos = aCentavos(pago.valor);
    const firma = wompiFirmaIntegridad(pago.referencia, centavos, "COP", this.creds.integritySecret);
    const params = new URLSearchParams({
      "public-key": this.creds.publicKey,
      currency: "COP",
      "amount-in-cents": String(centavos),
      reference: pago.referencia,
      "signature:integrity": firma,
      "redirect-url": opciones.redirectUrl,
    });
    if (pago.pagadorEmail) params.set("customer-data:email", pago.pagadorEmail);
    if (pago.pagadorNombre) params.set("customer-data:full-name", pago.pagadorNombre);
    return { url: `${WOMPI_CHECKOUT_URL}?${params.toString()}`, datos: { amountInCents: centavos, env: this.creds.env ?? "sandbox" } };
  }

  async verificarWebhook({ rawBody, headers }: WebhookInput): Promise<EventoPago | null> {
    let evento: WompiEvento;
    try {
      evento = JSON.parse(rawBody) as WompiEvento;
    } catch {
      throw new FirmaInvalidaError("Cuerpo no válido");
    }
    if (!this.creds.eventsSecret || !wompiVerificarEvento(evento, this.creds.eventsSecret, headers.get("x-event-checksum"))) {
      throw new FirmaInvalidaError("Checksum de Wompi inválido");
    }
    if (evento.event !== "transaction.updated") return null;
    return normalizar((evento.data?.transaction ?? {}) as WompiTx, evento);
  }

  async consultarEstado(referencia: string): Promise<EventoPago | null> {
    if (!this.creds.privateKey) return null;
    const res = await fetch(`${wompiApiBase(this.creds.env)}/transactions?reference=${encodeURIComponent(referencia)}`, {
      headers: { Authorization: `Bearer ${this.creds.privateKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Wompi respondió ${res.status}`);
    const json = (await res.json()) as { data?: WompiTx[] };
    const txs = json.data ?? [];
    const tx = txs.find((t) => t.status === "APPROVED") ?? txs.find((t) => t.status === "PENDING") ?? txs[0];
    return tx ? normalizar(tx, tx) : null;
  }
}
