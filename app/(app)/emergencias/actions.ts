"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { activarAlerta, atenderAlerta } from "@/lib/emergencias/service";
import { zs } from "@/lib/validation";
import { can } from "@/lib/permisos";

export const panicAction = action(
  { perm: "emergencias.panico", schema: z.object({ mensaje: zs.optText(300) }) },
  async (input, ctx) => {
    const a = await activarAlerta(ctx, { tipo: "PANICO", mensaje: input.mensaje, origen: "RESIDENTE" });
    return { id: a.id };
  },
);

export const activarAlertaAction = action(
  {
    perm: ["emergencias.gestionar", "porteria.ver"],
    schema: z.object({
      tipo: z.enum(["PANICO", "EMERGENCIA_GENERAL", "INCENDIO", "SISMO", "MEDICA", "SEGURIDAD"]),
      mensaje: zs.optText(500),
      unidadId: zs.optId(),
      aTodos: zs.bool().optional(),
    }),
  },
  async (input, ctx) => {
    const a = await activarAlerta(ctx, { ...input, origen: can(ctx, "porteria.ver") && !can(ctx, "emergencias.gestionar") ? "PORTERIA" : "ADMIN" });
    revalidatePath("/emergencias");
    return { id: a.id };
  },
);

export const atenderAlertaAction = action(
  { perm: ["emergencias.gestionar", "porteria.ver"], schema: z.object({ id: zs.id(), falsaAlarma: zs.bool().optional() }) },
  async (input, ctx) => {
    await atenderAlerta(ctx, input.id, input.falsaAlarma);
    revalidatePath("/emergencias");
    return true;
  },
);
