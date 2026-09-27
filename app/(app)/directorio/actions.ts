"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { calificarProveedor, eliminarCalificacion, guardarMiFicha } from "@/lib/directorio/service";

export const guardarMiFichaAction = action(
  { perm: ["directorio.ver", "directorio.proveedores"], schema: z.object({ optIn: zs.bool(), campos: zs.list(), servicios: zs.optText(300), telefono: zs.optText(20) }) },
  async (input, ctx) => {
    await guardarMiFicha(ctx, input);
    revalidatePath("/directorio", "layout");
    return true;
  },
);

export const calificarProveedorAction = action(
  { perm: "directorio.calificar", schema: z.object({ id: zs.id(), puntaje: zs.int(1, 5), comentario: zs.optText(500) }) },
  async ({ id, puntaje, comentario }, ctx) => {
    const r = await calificarProveedor(ctx, id, { puntaje, comentario });
    revalidatePath("/directorio/proveedores", "layout");
    return r;
  },
);

export const eliminarCalificacionAction = action({ perm: "directorio.calificar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  const r = await eliminarCalificacion(ctx, id);
  revalidatePath("/directorio/proveedores", "layout");
  return r;
});
