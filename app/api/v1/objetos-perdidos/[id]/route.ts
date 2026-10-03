import { apiHandler } from "@/lib/api/handler";
import { obtenerObjeto } from "@/lib/objetos-perdidos/service";

/** GET /api/v1/objetos-perdidos/{id} — detalle público de un reporte, con coincidencias sugeridas. */
export const GET = apiHandler({ perm: "objetos.ver" }, async ({ ctx, params }) => {
  const d = await obtenerObjeto(ctx, params.id);
  return { ...d.objeto, coincidencias: d.coincidencias, miReclamo: d.miReclamo, historial: d.linea };
});
