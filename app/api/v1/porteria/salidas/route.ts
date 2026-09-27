import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { registrarSalida } from "@/lib/porteria/service";

const opt = z.string().trim().max(500).nullish();

/** POST /api/v1/porteria/salidas — registra una salida vinculada al ingreso (`ingresoId`) o libre (`nombre`/`placa`). */
export const POST = apiHandler(
  {
    perm: "porteria.registrar",
    schema: z.object({ ingresoId: opt, nombre: opt, placa: opt, unidadId: opt, cobro: z.enum(["UNIDAD", "VISITANTE", "NINGUNO"]).nullish(), observaciones: opt, clienteId: opt, hora: opt }),
  },
  async ({ ctx, input }) => {
    const r = await registrarSalida(ctx, { ...input, nombre: input.nombre ?? input.placa });
    return { ...r.registro, permanenciaMin: r.permanenciaMin, cobro: r.cobro };
  },
);
