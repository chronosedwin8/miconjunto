import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { eliminarEvento, guardarEvento, TIPOS_EVENTO } from "@/lib/calendario/service";
import { AppError } from "@/lib/errors";

/** GET /api/v1/eventos/:id */
export const GET = apiHandler({ perm: "calendario.ver" }, async ({ ctx, params }) => {
  const e = await ctx.db.eventoCalendario.findUnique({ where: { id: params.id } });
  if (!e || (!e.visibleResidentes && !ctx.permisos.has("calendario.crear") && !ctx.esSuperAdmin)) throw new AppError("El evento no existe.", 404);
  return e;
});

/** PUT /api/v1/eventos/:id — actualiza el evento. */
export const PUT = apiHandler(
  {
    perm: "calendario.editar",
    schema: z.object({
      titulo: z.string().min(3).max(150),
      descripcion: z.string().max(2000).nullish(),
      tipo: z.enum(TIPOS_EVENTO),
      inicio: z.coerce.date(),
      fin: z.coerce.date(),
      todoElDia: z.boolean().default(false),
      lugar: z.string().max(150).nullish(),
      zonaId: z.string().nullish(),
      visibleResidentes: z.boolean().default(true),
      notificar: z.boolean().default(false),
    }),
  },
  async ({ ctx, params, input }) => ({ id: (await guardarEvento(ctx, { ...input, id: params.id })).id }),
);

/** DELETE /api/v1/eventos/:id */
export const DELETE = apiHandler({ perm: "calendario.editar" }, async ({ ctx, params }) => eliminarEvento(ctx, params.id));
