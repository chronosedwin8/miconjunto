import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { guardarEvento, itemsCalendario, TIPOS_EVENTO } from "@/lib/calendario/service";

/** GET /api/v1/eventos?desde=&hasta=&tipos=EVENTO,RESERVA,BLOQUEO — calendario (eventos + reservas + bloqueos). */
export const GET = apiHandler(
  { perm: "calendario.ver", schema: z.object({ desde: z.coerce.date().optional(), hasta: z.coerce.date().optional(), tipos: z.string().optional() }) },
  async ({ ctx, input }) => {
    const desde = input.desde ?? new Date();
    const hasta = input.hasta ?? new Date(desde.getTime() + 31 * 86_400_000);
    if (hasta.getTime() - desde.getTime() > 400 * 86_400_000) throw Object.assign(new Error("Rango máximo: 400 días"), { status: 400 });
    return itemsCalendario(ctx, desde, hasta, { tipos: input.tipos?.split(",").filter(Boolean) });
  },
);

/** POST /api/v1/eventos — crea un evento del conjunto. */
export const POST = apiHandler(
  {
    perm: "calendario.crear",
    schema: z.object({
      titulo: z.string().min(3).max(150),
      descripcion: z.string().max(2000).nullish(),
      tipo: z.enum(TIPOS_EVENTO).default("COMUNITARIO"),
      inicio: z.coerce.date(),
      fin: z.coerce.date(),
      todoElDia: z.boolean().default(false),
      lugar: z.string().max(150).nullish(),
      zonaId: z.string().nullish(),
      visibleResidentes: z.boolean().default(true),
      notificar: z.boolean().default(false),
    }),
  },
  async ({ ctx, input }) => ({ id: (await guardarEvento(ctx, input)).id }),
);
