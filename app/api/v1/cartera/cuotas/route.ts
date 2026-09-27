import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permisos";
import { filtroCuotas } from "@/lib/cartera/filtros";
import { crearCargoManual } from "@/lib/cartera/operaciones";

/**
 * GET /api/v1/cartera/cuotas?unidad=&estado=&periodo=&concepto=&torre=&q=&take=&skip=
 * Con `cartera.ver_todos` lista todas; si no, exige `unidad` propia.
 */
export const GET = apiHandler(
  {
    perm: "cartera.ver",
    schema: z.object({
      unidad: z.string().optional(),
      estado: z.string().optional(),
      periodo: z.string().optional(),
      concepto: z.string().optional(),
      torre: z.string().optional(),
      q: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => {
    const { take, skip, ...f } = input;
    if (!can(ctx, "cartera.ver_todos")) {
      if (!f.unidad || !ctx.unidadesPropias.includes(f.unidad)) throw new AppError("Indica una unidad propia (parámetro unidad).", 403);
    }
    const where = filtroCuotas(f);
    const [items, total] = await Promise.all([
      ctx.db.cuota.findMany({ where, include: { concepto: { select: { nombre: true, tipo: true } }, unidad: { select: { codigo: true } } }, orderBy: [{ fechaVencimiento: "desc" }], take, skip }),
      ctx.db.cuota.count({ where }),
    ]);
    return { total, items };
  },
);

/** POST /api/v1/cartera/cuotas — cargo manual { unidadId, conceptoId, valorBase, fechaVencimiento (ISO), descripcion?, periodo? } */
export const POST = apiHandler(
  {
    perm: "cartera.crear",
    schema: z.object({ unidadId: z.string().min(1), conceptoId: z.string().min(1), valorBase: z.number().positive(), fechaVencimiento: z.coerce.date(), descripcion: z.string().max(200).optional(), periodo: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  },
  async ({ ctx, input }) => crearCargoManual(ctx, input),
);
