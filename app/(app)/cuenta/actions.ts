"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { iniciarPagoEnLinea } from "@/lib/pagos/service";
import { assertVerCuenta } from "@/lib/pagos/acceso";
import { pedirPazYSalvo } from "@/lib/pagos/cartera-bridge";
import { MEDIOS_EN_LINEA } from "@/lib/pagos/types";

const iniciarSchema = z.object({
  unidadId: zs.id(),
  cuotaIds: z.array(z.string()).optional(),
  modo: z.enum(["CUOTAS", "ABONO"]).default("CUOTAS"),
  valor: zs.optMoney(),
  medio: z.enum(MEDIOS_EN_LINEA).default("PSE"),
  origen: zs.optText(60),
  returnPath: zs.optText(300),
});

/** Crea el pago PENDIENTE y devuelve la URL del checkout (el permiso por unidad lo valida el servicio). */
export const iniciarPagoAction = action({ schema: iniciarSchema }, async (input, ctx) => {
  const r = await iniciarPagoEnLinea(ctx, {
    unidadId: input.unidadId,
    cuotaIds: input.modo === "CUOTAS" ? input.cuotaIds : null,
    valor: input.modo === "ABONO" ? input.valor : null,
    medio: input.medio,
    origen: input.origen,
    returnPath: input.returnPath,
  });
  return { url: r.url, referencia: r.referencia };
});

/** Paz y salvo: si la unidad está al día se emite; si no, se informa el saldo. */
export const solicitarPazYSalvoAction = action({ schema: z.object({ unidadId: zs.id() }) }, async ({ unidadId }, ctx) => {
  await assertVerCuenta(ctx, unidadId);
  const r = await pedirPazYSalvo(ctx, unidadId);
  revalidatePath("/cuenta");
  return r;
});
