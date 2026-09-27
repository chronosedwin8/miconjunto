import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { can } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { assertVerCuenta } from "@/lib/pagos/acceso";
import { iniciarPagoEnLinea, pagosDeUnidad } from "@/lib/pagos/service";
import { MEDIOS_EN_LINEA } from "@/lib/pagos/types";

/** GET /api/v1/pagos?unidadId= — pagos de una unidad (propia/autorizada, o cualquiera con pagos.ver_todos). */
export const GET = apiHandler(
  { schema: z.object({ unidadId: z.string().min(1), take: z.coerce.number().int().min(1).max(200).default(50) }) },
  async ({ ctx, input }) => {
    if (!can(ctx, "pagos.ver_todos")) await assertVerCuenta(ctx, input.unidadId);
    return { items: await pagosDeUnidad(ctx, input.unidadId, input.take) };
  },
);

/**
 * POST /api/v1/pagos — inicia un pago en línea.
 * Body: { unidadId, cuotaIds?: string[], valor?: number, medio?: "PSE"|"TARJETA"|"NEQUI"|"BANCOLOMBIA_QR", origen?, returnPath? }
 * Respuesta: { pagoId, referencia, url, valor, pasarela, reutilizado } — redirige al pagador a `url`.
 */
export const POST = apiHandler(
  {
    schema: z.object({
      unidadId: z.string().min(1),
      cuotaIds: z.array(z.string()).optional(),
      valor: z.number().int().positive().optional(),
      medio: z.enum(MEDIOS_EN_LINEA).optional(),
      origen: z.string().max(60).optional(),
      returnPath: z.string().max(300).optional(),
    }),
  },
  async ({ ctx, input }) => {
    if (ctx.userId.startsWith("api:")) throw new AppError("Los pagos en línea los inicia el residente con su sesión.", 403);
    return iniciarPagoEnLinea(ctx, input);
  },
);
