"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { cancelarCampanaCobro, crearCampanaCobro } from "@/lib/pagos/campana";

const crearSchema = z.object({
  asunto: zs.text(3, 200),
  plantilla: zs.text(10, 5000),
  programadaPara: zs.optDate(),
  montoMinimo: zs.optMoney(),
});

/** Lanza (o programa) la campaña "Cobro de administración". */
export const crearCampanaCobroAction = action({ perm: "cartera.gestionar_cobro", schema: crearSchema }, async (input, ctx) => {
  const r = await crearCampanaCobro(ctx, { ...input, ejecucion: "segundo_plano" });
  revalidatePath("/cartera/campanas-cobro");
  return { id: r.id };
});

export const cancelarCampanaCobroAction = action({ perm: "cartera.gestionar_cobro", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await cancelarCampanaCobro(ctx, id);
  revalidatePath("/cartera/campanas-cobro");
  return true;
});
