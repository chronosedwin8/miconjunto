import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { bitacora } from "@/lib/porteria/service";
import { addDays, parseLocal } from "@/lib/format";

/** GET /api/v1/porteria/bitacora?tipo=&sujeto=&desde=AAAA-MM-DD&hasta=&unidad=&q=&take=&skip= — bitácora inmutable con marca de anulados. */
export const GET = apiHandler(
  {
    perm: ["porteria.bitacora", "porteria.ver"],
    schema: z.object({
      tipo: z.string().optional(),
      sujeto: z.string().optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      unidad: z.string().optional(),
      q: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) =>
    bitacora(
      ctx,
      { ...input, desde: input.desde ? parseLocal(input.desde) : null, hasta: input.hasta ? addDays(parseLocal(input.hasta), 1) : null },
      { skip: input.skip, take: input.take },
    ),
);
