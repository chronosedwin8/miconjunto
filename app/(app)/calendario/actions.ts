"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { eliminarEvento, guardarEvento, TIPOS_EVENTO } from "@/lib/calendario/service";

const eventoSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(3, 150),
  descripcion: zs.optText(2000),
  tipo: z.enum(TIPOS_EVENTO),
  inicio: zs.date(),
  fin: zs.date(),
  todoElDia: zs.bool(),
  lugar: zs.optText(150),
  zonaId: zs.optId(),
  visibleResidentes: zs.bool(),
  notificar: zs.bool(),
  bloquearZona: zs.bool(),
});

export const guardarEventoAction = action({ perm: ["calendario.crear", "calendario.editar"], schema: eventoSchema }, async (input, ctx) => {
  if (input.id && !ctx.esSuperAdmin && !ctx.permisos.has("calendario.editar")) throw new AppError("No tienes permiso para editar eventos.", 403);
  const e = await guardarEvento(ctx, input);
  revalidatePath("/calendario");
  return { id: e.id };
});

export const eliminarEventoAction = action({ perm: "calendario.editar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarEvento(ctx, id);
  revalidatePath("/calendario");
  return true;
});
