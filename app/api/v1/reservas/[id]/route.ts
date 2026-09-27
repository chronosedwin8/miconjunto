import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { assertCan } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { aprobarReserva, calificarReserva, cancelarReserva, checkIn, checkOut, marcarNoShow, rechazarReserva, reservaVisible } from "@/lib/reservas/service";
import { checklistActa } from "@/lib/reservas/reglas";

/** GET /api/v1/reservas/:id — detalle (solo propias salvo `reservas.ver_todos`). */
export const GET = apiHandler({ perm: ["reservas.ver", "reservas.ver_todos", "reservas.checkin"] }, async ({ ctx, params }) => reservaVisible(ctx, params.id));

const accion = z.object({
  accion: z.enum(["cancelar", "aprobar", "rechazar", "checkin", "checkout", "no_show", "calificar"]),
  motivo: z.string().max(300).optional(),
  checklist: z.array(z.string()).optional(),
  observaciones: z.string().max(1000).optional(),
  fotos: z.array(z.string()).optional(),
  danos: z.boolean().optional(),
  descripcionDano: z.string().max(1000).optional(),
  proponerMulta: z.boolean().optional(),
  valorMulta: z.number().min(0).optional(),
  calificacion: z.number().int().min(1).max(5).optional(),
  comentario: z.string().max(500).optional(),
});

/** PATCH /api/v1/reservas/:id — { accion: cancelar | aprobar | rechazar | checkin | checkout | no_show | calificar, ... } */
export const PATCH = apiHandler({ perm: ["reservas.ver", "reservas.ver_todos", "reservas.checkin"], schema: accion }, async ({ ctx, input, params }) => {
  const id = params.id;
  switch (input.accion) {
    case "cancelar":
      return (await cancelarReserva(ctx, id, input.motivo)).politica;
    case "aprobar":
      assertCan(ctx, "reservas.aprobar");
      return aprobarReserva(ctx, id);
    case "rechazar":
      assertCan(ctx, "reservas.aprobar");
      if (!input.motivo) throw new AppError("Indica el motivo del rechazo.");
      return (await rechazarReserva(ctx, id, input.motivo)).reserva;
    case "checkin":
    case "checkout": {
      assertCan(ctx, "reservas.checkin");
      const r = await reservaVisible(ctx, id);
      const items = checklistActa(r.zona.categoria);
      const base = { items, checklist: input.checklist ?? [], observaciones: input.observaciones, fotos: input.fotos };
      return input.accion === "checkin" ? checkIn(ctx, id, base) : checkOut(ctx, id, { ...base, danos: !!input.danos, descripcionDano: input.descripcionDano, proponerMulta: input.proponerMulta, valorMulta: input.valorMulta });
    }
    case "no_show":
      assertCan(ctx, "reservas.checkin");
      return marcarNoShow(ctx, id);
    case "calificar":
      if (!input.calificacion) throw new AppError("Indica la calificación (1 a 5).");
      return calificarReserva(ctx, id, input.calificacion, input.comentario);
  }
});
