import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { verificarComprobante } from "@/lib/votaciones/service";

/** GET /api/v1/votaciones/comprobante?hash= — verifica un comprobante de voto. */
export const GET = apiHandler({ perm: "votaciones.ver", schema: z.object({ hash: z.string().min(1) }) }, async ({ ctx, input }) => verificarComprobante(ctx, input.hash));
