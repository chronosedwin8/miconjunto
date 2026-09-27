import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { zs } from "@/lib/validation";
import { cerrarOrden } from "@/lib/mantenimiento/service";

/**
 * POST /api/v1/ordenes/:id/cerrar — { notasCierre?, costo?, evidencias?: string[], checklistCompleto?: boolean }
 * Actualiza el plan (próxima fecha), resuelve el ticket de origen y crea el gasto si hay costo.
 */
export const POST = apiHandler(
  {
    perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"],
    schema: z.object({ notasCierre: zs.optText(3000), costo: zs.optMoney(), evidencias: z.array(z.string()).optional(), checklistCompleto: z.boolean().optional() }),
  },
  async ({ ctx, input, params }) => cerrarOrden(ctx, { ...input, id: params.id }),
);
