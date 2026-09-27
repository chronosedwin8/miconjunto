import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { listarPaquetes, recibirPaquete } from "@/lib/paqueteria/service";

const opt = z.string().trim().max(500).nullish();

/** GET /api/v1/paquetes?estado=EN_PORTERIA&q=&take=&skip= — paquetes (propios o todos según permiso). */
export const GET = apiHandler(
  {
    perm: ["paqueteria.ver", "paqueteria.ver_todos"],
    schema: z.object({ estado: z.string().optional(), q: z.string().optional(), take: z.coerce.number().int().min(1).max(500).default(100), skip: z.coerce.number().int().min(0).default(0) }),
  },
  async ({ ctx, input }) => listarPaquetes(ctx, input, { skip: input.skip, take: input.take }),
);

/** POST /api/v1/paquetes — recibe un paquete en portería y notifica a la unidad. */
export const POST = apiHandler(
  {
    perm: "paqueteria.recibir",
    schema: z.object({
      unidadId: z.string().min(1),
      tipo: z.enum(["SOBRE", "CAJA", "MERCADO", "DOMICILIO", "OTRO"]).default("CAJA"),
      destinatario: opt,
      transportadora: opt,
      guia: opt,
      fotoUrl: opt,
      fotoGuiaUrl: opt,
      observaciones: opt,
      clienteId: opt,
    }),
  },
  async ({ ctx, input }) => recibirPaquete(ctx, input),
);
