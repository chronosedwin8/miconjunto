import { on } from "@/lib/events";
import { systemCtx } from "@/lib/auth/system-ctx";
import { evaluarAcuerdo } from "./acuerdos";

/** Al aprobarse un pago, si la unidad tiene un acuerdo vigente se evalúa (puede quedar cumplido). */
on("pago.aprobado", async (evt) => {
  const unidadId = evt.data.unidadId as string | undefined;
  if (!unidadId) return;
  const ctx = await systemCtx(evt.conjuntoId);
  const acuerdos = await ctx.db.acuerdoPago.findMany({ where: { unidadId, estado: "VIGENTE" }, select: { id: true } });
  for (const a of acuerdos) await evaluarAcuerdo(ctx, a.id);
});
