import { apiHandler } from "@/lib/api/handler";
import { consultarPago } from "@/lib/pagos/service";

/** GET /api/v1/pagos/:referencia — estado de un pago (consulta a la pasarela si sigue pendiente). */
export const GET = apiHandler({}, async ({ ctx, params }) => consultarPago(ctx, params.referencia, { sincronizar: true }));
