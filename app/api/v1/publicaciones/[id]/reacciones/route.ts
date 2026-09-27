import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { reaccionar } from "@/lib/muro/service";

/** POST /api/v1/publicaciones/:id/reacciones { tipo } — alterna la reacción del usuario. */
export const POST = apiHandler(
  { perm: ["comunicaciones.comentar", "clasificados.ver"], schema: z.object({ tipo: z.enum(["LIKE", "GRACIAS", "CORAZON", "IMPORTANTE"]).default("LIKE") }) },
  async ({ ctx, params, input }) => reaccionar(ctx, params.id, input.tipo),
);
