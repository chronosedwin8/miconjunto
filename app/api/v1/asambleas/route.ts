import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { can } from "@/lib/permisos";
import { guardarAsamblea, listarAsambleas } from "@/lib/asambleas/service";

/** GET /api/v1/asambleas — asambleas del conjunto (los borradores solo para quien gestiona). */
export const GET = apiHandler({ perm: "asambleas.ver" }, async ({ ctx }) => {
  const items = await listarAsambleas(ctx);
  return can(ctx, ["asambleas.crear", "asambleas.gestionar"]) ? items : items.filter((a) => a.estado !== "BORRADOR");
});

/** POST /api/v1/asambleas — crea una asamblea en borrador. */
export const POST = apiHandler(
  {
    perm: "asambleas.crear",
    schema: z.object({
      titulo: z.string().min(5).max(150),
      tipo: z.enum(["ORDINARIA", "EXTRAORDINARIA"]),
      modalidad: z.enum(["PRESENCIAL", "VIRTUAL", "MIXTA"]),
      fecha: z.coerce.date(),
      lugar: z.string().max(200).nullish(),
      enlace: z.string().max(500).nullish(),
      quorumRequerido: z.number().min(0.000001).max(100).nullish(),
      limitePoderes: z.number().int().min(0).max(50).nullish(),
    }),
  },
  async ({ ctx, input }) => guardarAsamblea(ctx, input),
);
