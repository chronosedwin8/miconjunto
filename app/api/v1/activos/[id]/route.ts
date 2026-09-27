import { apiHandler } from "@/lib/api/handler";
import { fichaActivo } from "@/lib/activos/service";

/** GET /api/v1/activos/:id — ficha del activo con planes, órdenes, tickets y costos. */
export const GET = apiHandler({ perm: "activos.ver" }, async ({ ctx, params }) => fichaActivo(ctx, params.id));
