import { apiHandler } from "@/lib/api/handler";
import { acusesDocumento, confirmarLectura } from "@/lib/documentos/service";

/** POST /api/v1/documentos/:id/acuse — el usuario confirma "Leí el documento" (versión vigente). */
export const POST = apiHandler({ perm: "documentos.ver" }, async ({ ctx, params }) => confirmarLectura(ctx, params.id));

/** GET /api/v1/documentos/:id/acuse — quién leyó y quién falta (administración). */
export const GET = apiHandler({ perm: "documentos.editar" }, async ({ ctx, params }) => acusesDocumento(ctx, params.id));
