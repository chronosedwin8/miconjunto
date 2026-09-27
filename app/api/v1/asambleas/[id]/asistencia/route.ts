import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { can } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { listarAsistencia, registrarAsistenciaManual, registrarAsistenciaPropia } from "@/lib/asambleas/service";

/** GET /api/v1/asambleas/:id/asistencia — registro de asistencia (gestión). */
export const GET = apiHandler({ perm: ["asambleas.asistencia", "asambleas.gestionar"] }, async ({ ctx, params }) => listarAsistencia(ctx, params.id));

/**
 * POST /api/v1/asambleas/:id/asistencia
 * - Propia: { tipo: "PRESENCIAL" | "VIRTUAL", codigo? } registra las unidades de quien llama (y sus poderes).
 * - Manual (gestión): { unidadId, tipo: "PRESENCIAL" | "VIRTUAL" | "PODER", personaNombre? }.
 */
export const POST = apiHandler(
  {
    perm: "asambleas.ver",
    schema: z.object({ unidadId: z.string().optional(), tipo: z.enum(["PRESENCIAL", "VIRTUAL", "PODER"]), codigo: z.string().nullish(), personaNombre: z.string().max(120).nullish() }),
  },
  async ({ ctx, input, params }) => {
    if (input.unidadId) {
      if (!can(ctx, ["asambleas.asistencia", "asambleas.gestionar"])) throw new AppError("No tienes permiso para registrar asistencia de otras unidades.", 403);
      return registrarAsistenciaManual(ctx, { asambleaId: params.id, unidadId: input.unidadId, tipo: input.tipo, personaNombre: input.personaNombre });
    }
    if (input.tipo === "PODER") throw new AppError("Tipo no válido para registro propio.");
    return registrarAsistenciaPropia(ctx, params.id, { tipo: input.tipo, codigo: input.codigo });
  },
);
