import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { CATEGORIAS_MURO, feedMuro, guardarPublicacion } from "@/lib/muro/service";

/** GET /api/v1/publicaciones?categoria=&q=&page= — feed del muro visible para el usuario (respeta audiencia). */
export const GET = apiHandler(
  { perm: "comunicaciones.ver", schema: z.object({ categoria: z.string().optional(), q: z.string().optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(15) }) },
  async ({ ctx, input }) => feedMuro(ctx, input),
);

/**
 * POST /api/v1/publicaciones — crea una publicación. `contenido` es un arreglo de bloques
 * ({tipo:"texto",html}|{tipo:"imagen",url}|{tipo:"video",url}|{tipo:"adjunto",url,nombre}|{tipo:"encuesta",encuestaId}).
 * `audiencia` es una definición de segmento (ver lib/segmentos) o usa `segmentoId`.
 */
export const POST = apiHandler(
  {
    perm: ["comunicaciones.publicar", "clasificados.publicar"],
    schema: z.object({
      titulo: z.string().min(3).max(150),
      categoria: z.enum(CATEGORIAS_MURO),
      contenido: z.array(z.record(z.string(), z.unknown())).max(40),
      fijada: z.boolean().default(false),
      permiteComentarios: z.boolean().default(true),
      venceEn: z.coerce.date().nullish(),
      segmentoId: z.string().nullish(),
      audiencia: z.record(z.string(), z.unknown()).nullish(),
      precio: z.number().min(0).nullish(),
      imagenes: z.array(z.string()).max(8).default([]),
      notificar: z.boolean().default(false),
    }),
  },
  async ({ ctx, input }) => {
    const p = await guardarPublicacion(ctx, { ...input, venceEn: input.venceEn ?? null });
    return { id: p.id, estado: p.estado };
  },
);
