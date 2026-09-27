import { apiHandler } from "@/lib/api/handler";
import { obtenerDocumento } from "@/lib/documentos/service";

/** GET /api/v1/documentos/:id — ficha del documento con versiones y estado de acuse del usuario. */
export const GET = apiHandler({ perm: "documentos.ver" }, async ({ ctx, params }) => {
  const d = await obtenerDocumento(ctx, params.id);
  return {
    ...d,
    versiones: d.versiones.map((v) => ({ ...v, url: `/api/v1/documentos/${d.id}/archivo?version=${v.version}` })),
  };
});
