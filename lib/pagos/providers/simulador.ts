import crypto from "node:crypto";
import type { MedioPago } from "@prisma/client";
import { appUrl } from "@/lib/email";
import { simuladorFirmar, simuladorTokenCheckout, simuladorVerificar } from "../firmas";
import {
  FirmaInvalidaError,
  type EventoPago,
  type OpcionesCheckout,
  type PagoCheckout,
  type PaymentProvider,
  type ResultadoCheckout,
  type WebhookInput,
} from "../types";

/**
 * Pasarela simulada para demo y pruebas. Imita un checkout (PSE / tarjeta / Nequi / Bancolombia) en
 * `/pagar/simulador/[referencia]`; los botones Aprobar/Rechazar envían un webhook FIRMADO (HMAC con
 * APP_ENCRYPTION_KEY) a `/api/webhooks/simulador`, de modo que el flujo es idéntico al de una pasarela real.
 * Solo se habilita con PAYMENTS_SIMULATOR=true (o en pruebas).
 */

export function simuladorHabilitado() {
  return process.env.PAYMENTS_SIMULATOR === "true" || process.env.NODE_ENV === "test" || !!process.env.VITEST;
}

export type EventoSimulador = { referencia: string; estado: "APROBADO" | "RECHAZADO"; medio: MedioPago; valor: number; id: string };

export function cuerpoEventoSimulador(e: Omit<EventoSimulador, "id"> & { id?: string }) {
  return JSON.stringify({ ...e, id: e.id ?? `SIM-${crypto.randomBytes(6).toString("hex").toUpperCase()}` });
}

/** Envía el webhook firmado del simulador a la app (como lo haría una pasarela). */
export async function enviarWebhookSimulado(e: Omit<EventoSimulador, "id">) {
  const body = cuerpoEventoSimulador(e);
  const res = await fetch(appUrl("/api/webhooks/simulador"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-simulador-firma": simuladorFirmar(body) },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`El webhook del simulador respondió ${res.status}`);
}

export class SimuladorProvider implements PaymentProvider {
  readonly pasarela = "SIMULADOR" as const;

  async crearCheckout(pago: PagoCheckout, opciones: OpcionesCheckout): Promise<ResultadoCheckout> {
    const t = simuladorTokenCheckout(pago.referencia);
    return {
      url: appUrl(`/pagar/simulador/${encodeURIComponent(pago.referencia)}?t=${t}`),
      datos: { redirectUrl: opciones.redirectUrl, medioSolicitado: pago.medio },
    };
  }

  async verificarWebhook({ rawBody, headers }: WebhookInput): Promise<EventoPago | null> {
    if (!simuladorVerificar(rawBody, headers.get("x-simulador-firma"))) throw new FirmaInvalidaError("Firma del simulador inválida");
    const e = JSON.parse(rawBody) as EventoSimulador;
    if (!e.referencia) return null;
    return {
      referencia: e.referencia,
      estado: e.estado === "APROBADO" ? "APROBADO" : "RECHAZADO",
      referenciaExterna: e.id,
      medio: e.medio,
      valor: e.valor,
      raw: e,
    };
  }

  async consultarEstado(): Promise<EventoPago | null> {
    return null; // el simulador no tiene estado remoto: todo llega por webhook
  }
}
