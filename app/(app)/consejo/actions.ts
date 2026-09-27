"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { eliminarReunion, guardarMiembro, guardarReunion, retirarMiembro } from "@/lib/consejo/service";

const miembroSchema = z.object({
  id: zs.optId(),
  personaId: zs.optId(),
  nombre: zs.optText(120),
  cargo: z.enum(["PRESIDENTE", "SECRETARIO", "VOCAL", "SUPLENTE"]),
  periodoInicio: zs.date(),
  periodoFin: zs.date(),
  activo: zs.bool(),
});

export const guardarMiembroAction = action({ perm: "consejo.gestionar", schema: miembroSchema }, async (input, ctx) => {
  const m = await guardarMiembro(ctx, input);
  revalidatePath("/consejo", "layout");
  return { id: m.id };
});

const idSchema = z.object({ id: zs.id() });

export const retirarMiembroAction = action({ perm: "consejo.gestionar", schema: idSchema }, async ({ id }, ctx) => {
  await retirarMiembro(ctx, id);
  revalidatePath("/consejo", "layout");
  return { id };
});

const reunionSchema = z.object({
  id: zs.optId(),
  fecha: zs.date(),
  tema: zs.text(3, 200),
  asistentes: zs.list(),
  actaTexto: zs.optText(50_000),
  decisiones: zs.optText(10_000),
});

export const guardarReunionAction = action({ perm: "consejo.gestionar", schema: reunionSchema }, async (input, ctx) => {
  const r = await guardarReunion(ctx, input);
  revalidatePath("/consejo", "layout");
  return { id: r.id };
});

export const eliminarReunionAction = action({ perm: "consejo.gestionar", schema: idSchema }, async ({ id }, ctx) => {
  await eliminarReunion(ctx, id);
  revalidatePath("/consejo", "layout");
  return { id };
});
