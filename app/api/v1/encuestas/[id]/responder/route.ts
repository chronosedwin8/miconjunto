import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { responderEncuesta } from "@/lib/encuestas/service";

/** POST /api/v1/encuestas/:id/responder { respuestas: { [preguntaId]: valor | valor[] } } */
export const POST = apiHandler(
  { perm: "encuestas.ver", schema: z.object({ respuestas: z.record(z.string(), z.union([z.string(), z.array(z.string())])) }) },
  async ({ ctx, input, params }) => responderEncuesta(ctx, params.id, input.respuestas),
);
