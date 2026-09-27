import { apiHandler } from "@/lib/api/handler";
import { obtenerTicket } from "@/lib/tickets/service";

/** GET /api/v1/tickets/:id — detalle con historial (los comentarios internos solo con tickets.comentario_interno). */
export const GET = apiHandler({ perm: ["tickets.ver", "tickets.ver_todos"] }, async ({ ctx, params }) => {
  const t = await obtenerTicket(ctx, params.id);
  return { ...t, solicitante: t.solicitante ? { id: t.solicitante.id, nombre: t.solicitante.nombre } : null };
});
