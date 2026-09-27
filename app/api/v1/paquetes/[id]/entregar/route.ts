import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { entregarPaquetes } from "@/lib/paqueteria/service";

/** POST /api/v1/paquetes/:id/entregar {personaId, firma?|fotoEntregaUrl?} — solo a personas autorizadas de la unidad. */
export const POST = apiHandler(
  {
    perm: "paqueteria.entregar",
    schema: z.object({ personaId: z.string().min(1), firma: z.string().max(400_000).nullish(), fotoEntregaUrl: z.string().max(500).nullish(), observaciones: z.string().max(500).nullish() }),
  },
  async ({ ctx, input, params }) => entregarPaquetes(ctx, { ...input, paqueteIds: [params.id] }),
);
