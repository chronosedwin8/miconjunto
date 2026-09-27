import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { puedeVerCuentaUnidad } from "@/lib/cartera/acceso";
import { can } from "@/lib/permisos";

/** GET /api/v1/cartera/movimientos?unidad=&desde=AAAA-MM-DD&take=&skip= — libro auxiliar (débitos/créditos). */
export const GET = apiHandler(
  {
    perm: "cartera.ver",
    schema: z.object({ unidad: z.string().optional(), desde: z.string().optional(), take: z.coerce.number().int().min(1).max(1000).default(200), skip: z.coerce.number().int().min(0).default(0) }),
  },
  async ({ ctx, input }) => {
    if (input.unidad) {
      if (!(await puedeVerCuentaUnidad(ctx, input.unidad))) throw new AppError("Sin permiso sobre esta unidad.", 403);
    } else if (!can(ctx, "cartera.ver_todos")) throw new AppError("Indica la unidad (parámetro unidad).", 403);
    const where = { ...(input.unidad ? { unidadId: input.unidad } : {}), ...(input.desde ? { fecha: { gte: new Date(input.desde) } } : {}) };
    const [items, total] = await Promise.all([
      ctx.db.movimientoCartera.findMany({ where, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], take: input.take, skip: input.skip }),
      ctx.db.movimientoCartera.count({ where }),
    ]);
    return { total, items };
  },
);
