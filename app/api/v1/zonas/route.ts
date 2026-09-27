import { apiHandler } from "@/lib/api/handler";

/** GET /api/v1/zonas — zonas comunes con tarifas y reglas. */
export const GET = apiHandler({ perm: "zonas.ver" }, async ({ ctx }) => ctx.db.zonaComun.findMany({ orderBy: { nombre: "asc" } }));
