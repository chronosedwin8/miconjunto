import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { disponibilidad } from "@/lib/reservas/service";
import { fechaLocal, sumarDias } from "@/lib/reservas/reglas";

const schema = z.object({ desde: z.string().optional(), hasta: z.string().optional() });

/**
 * GET /api/v1/zonas/:id/disponibilidad?desde=AAAA-MM-DD&hasta=AAAA-MM-DD (máx. 62 días; por defecto 14).
 * Horario por día, festivos, bloqueos y reservas. Las reservas ajenas llegan solo como `{inicio, fin, propia:false}`.
 */
export const GET = apiHandler({ perm: ["reservas.ver", "reservas.ver_todos", "reservas.checkin"], schema }, async ({ ctx, input, params }) => {
  const desde = input.desde ?? fechaLocal(new Date());
  return disponibilidad(ctx, params.id, desde, input.hasta ?? sumarDias(desde, 13));
});
