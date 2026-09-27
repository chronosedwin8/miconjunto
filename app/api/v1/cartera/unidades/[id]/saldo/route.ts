import { apiHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { saldoUnidad } from "@/lib/cartera/core";
import { puedeVerCuentaUnidad } from "@/lib/cartera/acceso";

/** GET /api/v1/cartera/unidades/<id>/saldo — saldo total, vencido, por vencer, a favor, aging y cuotas pendientes. */
export const GET = apiHandler({ perm: "cartera.ver" }, async ({ ctx, params }) => {
  if (!(await puedeVerCuentaUnidad(ctx, params.id))) throw new AppError("Sin permiso sobre esta unidad.", 403);
  const u = await ctx.db.unidad.findUnique({ where: { id: params.id }, select: { id: true, codigo: true } });
  if (!u) throw new AppError("La unidad no existe.", 404);
  return { unidad: u, ...(await saldoUnidad(ctx, params.id)) };
});
