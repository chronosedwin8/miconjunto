import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { votar } from "@/lib/votaciones/service";

/** POST /api/v1/votaciones/:id/votar { unidadId, opcionId } — un voto por unidad; devuelve el comprobante (sha256). */
export const POST = apiHandler(
  { perm: ["votaciones.votar", "votaciones.ver"], schema: z.object({ unidadId: z.string().min(1), opcionId: z.string().min(1) }) },
  async ({ ctx, input, params }) => votar(ctx, { votacionId: params.id, ...input }),
);
