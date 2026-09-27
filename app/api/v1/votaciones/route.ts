import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { crearVotacion, listarVotaciones } from "@/lib/votaciones/service";

/** GET /api/v1/votaciones?estado=&asambleaId=&take=&skip= — votaciones del conjunto. */
export const GET = apiHandler(
  {
    perm: "votaciones.ver",
    schema: z.object({
      estado: z.enum(["BORRADOR", "ABIERTA", "CERRADA", "ANULADA"]).optional(),
      asambleaId: z.string().optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => listarVotaciones(ctx, input),
);

/** POST /api/v1/votaciones — crea y abre una votación. */
export const POST = apiHandler(
  {
    perm: "votaciones.crear",
    schema: z.object({
      pregunta: z.string().min(5).max(300),
      descripcion: z.string().max(3000).nullish(),
      opciones: z.array(z.string().min(1).max(200)).min(2).max(12),
      tipoMayoria: z.enum(["SIMPLE", "CALIFICADA_70", "UNANIME"]).default("SIMPLE"),
      ponderacion: z.enum(["COEFICIENTE", "UNIDAD"]).default("COEFICIENTE"),
      quienVota: z.enum(["PROPIETARIOS_AL_DIA", "PROPIETARIOS", "TODOS"]).default("PROPIETARIOS"),
      secreto: z.boolean().default(false),
      inicio: z.coerce.date().nullish(),
      fin: z.coerce.date(),
    }),
  },
  async ({ ctx, input }) => crearVotacion(ctx, input),
);
