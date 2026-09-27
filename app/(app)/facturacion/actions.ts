"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { emitirNotaCredito, procesarFactura, reenviarCorreo, reintentarFactura } from "@/lib/facturacion/service";

const done = <T>(r: T) => {
  revalidatePath("/facturacion", "layout");
  return r;
};

export const reintentarFacturaAction = action({ perm: "facturacion.emitir", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  const f = await reintentarFactura(ctx, id);
  return done({ id, estado: f?.estado ?? "ERROR" });
});

export const reenviarCorreoAction = action({ perm: "facturacion.emitir", schema: z.object({ id: zs.id(), email: zs.optEmail() }) }, async ({ id, email }, ctx) => done(await reenviarCorreo(ctx, id, email)));

export const notaCreditoAction = action({ perm: "facturacion.anular", schema: z.object({ id: zs.id(), motivo: zs.text(5, 240) }) }, async ({ id, motivo }, ctx) => {
  const nc = await emitirNotaCredito(ctx.conjuntoId, id, motivo, ctx);
  const r = nc.estado === "PENDIENTE" ? await procesarFactura(nc.id) : nc;
  return done({ id: nc.id, estado: r?.estado ?? nc.estado });
});
