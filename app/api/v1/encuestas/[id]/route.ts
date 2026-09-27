import { apiHandler } from "@/lib/api/handler";
import { can } from "@/lib/permisos";
import { obtenerEncuesta, resultadosEncuesta } from "@/lib/encuestas/service";

/** GET /api/v1/encuestas/:id — preguntas y, si ya respondió / está cerrada / es gestor, resultados. */
export const GET = apiHandler({ perm: "encuestas.ver" }, async ({ ctx, params }) => {
  const e = await obtenerEncuesta(ctx, params.id);
  const gestor = can(ctx, ["encuestas.crear", "encuestas.resultados"]);
  const ver = gestor || e.respondida || e.estado === "CERRADA";
  return { ...e, resultados: ver ? await resultadosEncuesta(ctx, e, { incluirTextos: gestor }) : null };
});
