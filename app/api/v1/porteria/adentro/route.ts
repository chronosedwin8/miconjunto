import { apiHandler } from "@/lib/api/handler";
import { adentroAhora } from "@/lib/porteria/service";

/** GET /api/v1/porteria/adentro — visitantes y vehículos que ingresaron y no han salido, con minutos de permanencia. */
export const GET = apiHandler({ perm: "porteria.ver" }, async ({ ctx }) => adentroAhora(ctx));
