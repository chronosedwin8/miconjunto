import { apiHandler } from "@/lib/api/handler";
import { obtenerVotacion, resultadosVotacion, unidadesHabilitadas } from "@/lib/votaciones/service";
import { parseOpciones } from "@/lib/votaciones/calculos";

/** GET /api/v1/votaciones/:id — detalle, resultado en vivo (o final) y unidades por las que puede votar quien consulta. */
export const GET = apiHandler({ perm: "votaciones.ver" }, async ({ ctx, params }) => {
  const v = await obtenerVotacion(ctx, params.id);
  const [resultado, misUnidades] = await Promise.all([resultadosVotacion(ctx, v), unidadesHabilitadas(ctx, v)]);
  return { ...v, opciones: parseOpciones(v.opciones), resultado, misUnidades };
});
