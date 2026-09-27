"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { aplicarImportacion } from "@/lib/importacion/service";

export const aplicarImportacionAction = action({ perm: ["conjunto.importar", "configuracion.editar"], schema: z.object({ id: z.string().min(1) }) }, async ({ id }, ctx) => {
  const r = await aplicarImportacion(ctx, id);
  revalidatePath("/", "layout");
  return r;
});
