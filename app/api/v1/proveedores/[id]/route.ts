import { apiHandler } from "@/lib/api/handler";
import { fichaProveedor } from "@/lib/proveedores/service";

/** GET /api/v1/proveedores/:id — ficha con documentos, contratos, calificaciones, órdenes y desempeño. */
export const GET = apiHandler({ perm: "proveedores.ver" }, async ({ ctx, params }) => fichaProveedor(ctx, params.id));
