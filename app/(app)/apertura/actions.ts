"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";

export const activarConjuntoAction = action({ perm: "configuracion.editar", schema: z.object({}) }, async (_i, ctx) => {
  await ctx.db.conjunto.update({ where: { id: ctx.conjuntoId }, data: { estado: "ACTIVO" } });
  await audit(ctx, "activar", "Conjunto", ctx.conjuntoId);
  return true;
});
