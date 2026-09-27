"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { eliminarLeidas, marcarLeida, marcarTodasLeidas } from "@/lib/perfil/notificaciones";

export const marcarLeidaAction = action({ schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  const n = await marcarLeida(ctx, id);
  revalidatePath("/notificaciones");
  return n;
});

export const marcarTodasLeidasAction = action({ schema: z.object({}) }, async (_i, ctx) => {
  const n = await marcarTodasLeidas(ctx);
  revalidatePath("/notificaciones");
  return n;
});

export const eliminarLeidasAction = action({ schema: z.object({}) }, async (_i, ctx) => {
  const n = await eliminarLeidas(ctx);
  revalidatePath("/notificaciones");
  return n;
});
