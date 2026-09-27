import type { MedioPago, Pasarela } from "@prisma/client";

/**
 * Abstracción de pasarelas de pago (MICONJUNTO_SPEC §5.5).
 * Cada implementación traduce su API a este contrato; el resto del sistema solo conoce `EventoPago`.
 */

export type EstadoEvento = "APROBADO" | "RECHAZADO" | "PENDIENTE";

/** Medios que el residente puede elegir en la pantalla de pago. */
export const MEDIOS_EN_LINEA = ["PSE", "TARJETA", "NEQUI", "BANCOLOMBIA_QR"] as const;
export type MedioEnLinea = (typeof MEDIOS_EN_LINEA)[number];

/** Datos mínimos del pago que necesita una pasarela para crear el checkout. */
export type PagoCheckout = {
  id: string;
  conjuntoId: string;
  referencia: string;
  /** Valor en pesos (COP, entero). */
  valor: number;
  descripcion: string;
  medio: MedioEnLinea;
  pagadorEmail?: string | null;
  pagadorNombre?: string | null;
};

export type OpcionesCheckout = {
  /** URL absoluta a la que la pasarela devuelve al usuario (no se confía en ella: el estado lo da el webhook). */
  redirectUrl: string;
  /** URL absoluta del webhook (Mercado Pago la recibe por preferencia). */
  webhookUrl?: string;
};

export type ResultadoCheckout = {
  /** URL a la que se redirige al pagador. */
  url: string;
  /** Datos adicionales de la pasarela (id de preferencia, firma, etc.) que se guardan en `Pago.datosPasarela`. */
  datos: Record<string, unknown>;
};

/** Evento normalizado de cualquier pasarela. */
export type EventoPago = {
  referencia: string;
  estado: EstadoEvento;
  referenciaExterna: string | null;
  medio: MedioPago;
  /** Valor reportado por la pasarela en pesos (para validar que coincide con el pago). */
  valor: number | null;
  raw: unknown;
};

export type WebhookInput = { rawBody: string; headers: Headers; url: URL };

export interface PaymentProvider {
  readonly pasarela: Pasarela;
  crearCheckout(pago: PagoCheckout, opciones: OpcionesCheckout): Promise<ResultadoCheckout>;
  /** Verifica la firma y devuelve el evento normalizado. Lanza `FirmaInvalidaError` si la firma no es válida. */
  verificarWebhook(input: WebhookInput): Promise<EventoPago | null>;
  /** Consulta el estado de una transacción por referencia (conciliación de pendientes). */
  consultarEstado(referencia: string): Promise<EventoPago | null>;
}

export class FirmaInvalidaError extends Error {
  constructor(msg = "Firma inválida") {
    super(msg);
    this.name = "FirmaInvalidaError";
  }
}
