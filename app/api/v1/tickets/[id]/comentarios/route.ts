import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { comentarTicket } from "@/lib/tickets/service";
import { zs } from "@/lib/validation";

/** POST /api/v1/tickets/:id/comentarios — { contenido, interno?, adjuntos? }. */
export const POST = apiHandler(
  { perm: ["tickets.ver", "tickets.ver_todos"], schema: z.object({ contenido: zs.text(1, 4000), interno: zs.bool().optional(), adjuntos: zs.list().optional() }) },
  async ({ ctx, params, input }) => {
    const c = await comentarTicket(ctx, params.id, input);
    return { id: c.id, createdAt: c.createdAt };
  },
);
