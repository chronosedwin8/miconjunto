import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { insensitive } from "@/lib/pagination";

/** GET /api/v1/unidades?q=&torreId=&take=&skip= — lista de unidades del conjunto. */
export const GET = apiHandler(
  { perm: "conjunto.ver", schema: z.object({ q: z.string().optional(), torreId: z.string().optional(), take: z.coerce.number().int().min(1).max(500).default(100), skip: z.coerce.number().int().min(0).default(0) }) },
  async ({ ctx, input }) => {
    const where = { ...(input.q ? { codigo: insensitive(input.q) } : {}), ...(input.torreId ? { torreId: input.torreId } : {}) };
    const [items, total] = await Promise.all([
      ctx.db.unidad.findMany({ where, orderBy: { codigo: "asc" }, take: input.take, skip: input.skip, include: { torre: { select: { nombre: true } } } }),
      ctx.db.unidad.count({ where }),
    ]);
    return { total, items };
  },
);
