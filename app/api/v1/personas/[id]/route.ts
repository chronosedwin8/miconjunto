import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { actualizarPersona, gestionaResidentes, obtenerPersona, retirarPersona } from "@/lib/residentes/service";
import { personaDto } from "@/lib/residentes/api";

/** GET /api/v1/personas/:id — detalle con vínculos (aislado: un residente solo ve personas de sus unidades). */
export const GET = apiHandler({ perm: ["residentes.ver", "residentes.ver_todos"] }, async ({ ctx, params }) => personaDto(ctx, await obtenerPersona(ctx, params.id)));

/** PATCH /api/v1/personas/:id — actualiza datos de la persona. */
export const PATCH = apiHandler(
  {
    perm: "residentes.editar",
    schema: z.object({
      nombres: z.string().trim().min(1).max(80).optional(),
      apellidos: z.string().trim().min(1).max(80).optional(),
      fechaNacimiento: z.coerce.date().nullable().optional(),
      telefono: z.string().max(30).nullable().optional(),
      email: z.email().nullable().optional(),
      eps: z.string().max(80).nullable().optional(),
      tipoSangre: z.string().max(5).nullable().optional(),
      contactoEmergenciaNombre: z.string().max(120).nullable().optional(),
      contactoEmergenciaTelefono: z.string().max(30).nullable().optional(),
      movilidadReducida: z.boolean().optional(),
      movilidadDescripcion: z.string().max(500).nullable().optional(),
      requiereAsistenciaEvacuacion: z.boolean().optional(),
    }),
  },
  async ({ ctx, params, input }) => {
    await actualizarPersona(ctx, params.id, input);
    return personaDto(ctx, await obtenerPersona(ctx, params.id));
  },
);

/** DELETE /api/v1/personas/:id — retira a la persona del conjunto y anonimiza sus datos (solo administración). */
export const DELETE = apiHandler({ perm: "residentes.eliminar" }, async ({ ctx, params }) => {
  if (!gestionaResidentes(ctx)) throw new AppError("Solo la administración puede retirar personas.", 403);
  await retirarPersona(ctx, params.id, "Retiro vía API");
  return { ok: true };
});
