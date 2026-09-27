"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { reportarFallaActivo } from "@/lib/activos/service";

const schema = z.object({
  codigoQr: zs.id(),
  prioridad: z.enum(["MEDIA", "ALTA", "URGENTE"], { error: "Cuéntanos qué tan grave es" }),
  descripcion: zs.text(5, 2000),
  fotos: zs.list().optional(),
});

/** Crea el ticket de daño desde la etiqueta QR. Devuelve el radicado como `id` para mostrarlo al terminar. */
export const reportarFallaAction = action({ perm: ["tickets.crear", "mantenimiento.gestionar"], schema }, async (input, ctx) => {
  const r = await reportarFallaActivo(ctx, { codigoQr: input.codigoQr, prioridad: input.prioridad, descripcion: input.descripcion, fotos: input.fotos ?? [] });
  return { id: r.radicado, ticketId: r.id };
});
