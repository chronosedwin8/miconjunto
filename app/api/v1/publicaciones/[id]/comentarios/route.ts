import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { comentar } from "@/lib/muro/service";

/** POST /api/v1/publicaciones/:id/comentarios { contenido } */
export const POST = apiHandler({ perm: "comunicaciones.comentar", schema: z.object({ contenido: z.string().min(1).max(1000) }) }, async ({ ctx, params, input }) => {
  const c = await comentar(ctx, params.id, input.contenido);
  return { id: c.id };
});
