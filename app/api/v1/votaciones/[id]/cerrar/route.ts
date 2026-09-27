import { apiHandler } from "@/lib/api/handler";
import { cerrarVotacion } from "@/lib/votaciones/service";

/** POST /api/v1/votaciones/:id/cerrar — cierra, calcula el resultado y asigna el código del acta. */
export const POST = apiHandler({ perm: ["votaciones.cerrar", "asambleas.gestionar"] }, async ({ ctx, params }) => cerrarVotacion(ctx, params.id));
