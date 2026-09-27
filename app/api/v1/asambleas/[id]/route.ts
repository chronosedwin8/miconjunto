import { apiHandler } from "@/lib/api/handler";
import { can } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { misUnidadesAsamblea, obtenerAsamblea, quorumAsamblea } from "@/lib/asambleas/service";
import { parseCompromisos, parseOrdenDelDia } from "@/lib/votaciones/calculos";

/** GET /api/v1/asambleas/:id — detalle con orden del día, quórum en vivo, votaciones y mis unidades. */
export const GET = apiHandler({ perm: "asambleas.ver" }, async ({ ctx, params }) => {
  const a = await obtenerAsamblea(ctx, params.id);
  const gestor = can(ctx, ["asambleas.crear", "asambleas.gestionar"]);
  if (a.estado === "BORRADOR" && !gestor) throw new AppError("La asamblea no existe o no tienes acceso.", 404);
  const [quorum, votaciones, misUnidades] = await Promise.all([
    quorumAsamblea(ctx, a),
    ctx.db.votacion.findMany({ where: { asambleaId: a.id }, orderBy: { puntoOrden: "asc" }, select: { id: true, pregunta: true, estado: true, puntoOrden: true, fin: true, codigoActa: true, resultado: true } }),
    misUnidadesAsamblea(ctx, a.id),
  ]);
  const { firmaPresidente, firmaSecretario, codigoAsistencia, ...rest } = a;
  return {
    ...rest,
    ...(gestor ? { codigoAsistencia } : {}),
    firmada: !!(firmaPresidente && firmaSecretario),
    ordenDelDia: parseOrdenDelDia(a.ordenDelDia),
    compromisos: parseCompromisos(a.compromisos),
    quorum,
    votaciones,
    misUnidades,
  };
});
