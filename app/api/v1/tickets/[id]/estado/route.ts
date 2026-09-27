import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { cambiarEstado } from "@/lib/tickets/service";
import { ESTADOS_TICKET } from "@/lib/tickets/reglas";
import { zs } from "@/lib/validation";

/** POST /api/v1/tickets/:id/estado — { estado, nota?, adjuntos? } con validación de transiciones. */
export const POST = apiHandler(
  { perm: "tickets.gestionar", schema: z.object({ estado: z.enum(ESTADOS_TICKET), nota: zs.optText(4000), adjuntos: zs.list().optional() }) },
  async ({ ctx, params, input }) => {
    const t = await cambiarEstado(ctx, params.id, input);
    return { id: t.id, estado: t.estado };
  },
);
