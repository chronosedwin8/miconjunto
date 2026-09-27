import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { crearEncuesta, listarEncuestas } from "@/lib/encuestas/service";

/** GET /api/v1/encuestas?estado= — encuestas visibles para quien consulta (con `respondida`). */
export const GET = apiHandler({ perm: "encuestas.ver", schema: z.object({ estado: z.enum(["BORRADOR", "ABIERTA", "CERRADA"]).optional() }) }, async ({ ctx, input }) => listarEncuestas(ctx, input));

/** POST /api/v1/encuestas — crea y publica una encuesta. */
export const POST = apiHandler(
  {
    perm: "encuestas.crear",
    schema: z.object({
      titulo: z.string().min(3).max(150),
      descripcion: z.string().max(2000).nullish(),
      anonima: z.boolean().default(false),
      inicio: z.coerce.date().nullish(),
      fin: z.coerce.date(),
      audiencia: z.enum(["TODOS", "PROPIETARIOS", "TORRE", "SEGMENTO"]).default("TODOS"),
      torreId: z.string().nullish(),
      segmentoId: z.string().nullish(),
      preguntas: z
        .array(z.object({ tipo: z.enum(["UNICA", "MULTIPLE", "ESCALA", "TEXTO"]), texto: z.string().min(3).max(300), opciones: z.array(z.string()).optional(), requerida: z.boolean().optional() }))
        .min(1)
        .max(30),
      notificar: z.boolean().optional(),
    }),
  },
  async ({ ctx, input }) => crearEncuesta(ctx, input),
);
