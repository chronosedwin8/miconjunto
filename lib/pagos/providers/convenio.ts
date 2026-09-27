import { AppError } from "@/lib/errors";
import type { EventoPago, PaymentProvider, ResultadoCheckout } from "../types";

/**
 * PSE / recaudo por CONVENIO BANCARIO directo (stub documentado, MICONJUNTO_SPEC §5.5).
 *
 * No hay checkout ni webhook: el copropietario paga en el banco (ventanilla, PSE del banco o botón
 * empresarial) usando la **referencia de pago de 14 dígitos** de la cuota (`Cuota.referenciaPago`,
 * impresa en el estado de cuenta). El recaudo llega en el extracto bancario y se aplica en
 * *Cartera → Conciliación bancaria*, que empareja la línea del extracto por referencia/valor/fecha y
 * registra el pago con `registrarPago` (medio CONSIGNACION/TRANSFERENCIA).
 *
 * Si en el futuro el banco ofrece un API de recaudo con notificación (p. ej. Bancolombia Recaudos),
 * se implementa aquí `verificarWebhook` con su firma y `consultarEstado` con su consulta por referencia.
 */
export class ConvenioBancarioProvider implements PaymentProvider {
  readonly pasarela = "NINGUNA" as const;

  async crearCheckout(): Promise<ResultadoCheckout> {
    throw new AppError("El pago por convenio bancario se hace directamente en el banco con la referencia de pago de tu estado de cuenta.");
  }

  async verificarWebhook(): Promise<EventoPago | null> {
    return null;
  }

  async consultarEstado(): Promise<EventoPago | null> {
    return null;
  }
}
