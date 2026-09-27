import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { can } from "@/lib/permisos";
import { listarPoderes, registrarPoder } from "@/lib/asambleas/service";

/** GET /api/v1/asambleas/:id/poderes — todos (gestión) o los propios (otorgados o recibidos). */
export const GET = apiHandler({ perm: "asambleas.ver" }, async ({ ctx, params }) => {
  const todos = await listarPoderes(ctx, params.id);
  if (can(ctx, ["asambleas.poderes", "asambleas.gestionar"])) return todos;
  return todos.filter((p) => ctx.unidadesPropias.includes(p.unidadId) || p.apoderadoUsuarioId === ctx.userId);
});

/** POST /api/v1/asambleas/:id/poderes — registra un poder (queda PENDIENTE). */
export const POST = apiHandler(
  {
    perm: "asambleas.ver",
    schema: z.object({
      unidadId: z.string().min(1),
      apoderadoNombre: z.string().min(3).max(120),
      apoderadoDocumento: z.string().max(20).nullish(),
      apoderadoEmail: z.email().nullish(),
      documentoUrl: z.string().max(500).nullish(),
    }),
  },
  async ({ ctx, input, params }) => registrarPoder(ctx, { ...input, asambleaId: params.id }, { esAdmin: can(ctx, "asambleas.poderes") }),
);
