import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { crearTicket, listarTickets } from "@/lib/tickets/service";
import { crearTicketSchema } from "@/lib/tickets/schemas";

/** GET /api/v1/tickets?q=&estado=&tipo=&prioridad=&sla=vencidos&take=&skip= — tickets visibles para el usuario. */
export const GET = apiHandler(
  {
    perm: ["tickets.ver", "tickets.ver_todos"],
    schema: z.object({
      q: z.string().optional(),
      estado: z.string().optional(),
      tipo: z.string().optional(),
      prioridad: z.string().optional(),
      sla: z.enum(["vencidos", "por_vencer"]).optional(),
      unidad: z.string().optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => listarTickets(ctx, input),
);

/** POST /api/v1/tickets — radica un ticket. Cuerpo: { tipo, descripcion, titulo?, unidadId?, zonaId?, activoId?, adjuntos?, prioridad?, urgente? }. */
export const POST = apiHandler({ perm: "tickets.crear", schema: crearTicketSchema }, async ({ ctx, input }) => {
  const t = await crearTicket(ctx, input);
  return { id: t.id, radicado: t.radicado, estado: t.estado, prioridad: t.prioridad, fechaLimite: t.fechaLimite };
});
