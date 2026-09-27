"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { guardarEmpleado, retirarEmpleado } from "@/lib/empleados/service";

const schema = z.object({
  id: zs.optId(),
  nombre: zs.text(3, 120),
  documento: zs.optText(20),
  cargo: zs.text(2, 60),
  turno: zs.optText(60),
  telefono: zs.optText(20),
  fotoUrl: zs.optText(500),
  epsVence: zs.optDate(),
  arlVence: zs.optDate(),
  fechaIngreso: zs.optDate(),
  documentos: zs.list().optional(),
  activo: zs.bool(),
});

export const guardarEmpleadoAction = action({ perm: ["empleados.crear", "empleados.editar"], schema }, async (input, ctx) => {
  const e = await guardarEmpleado(ctx, { ...input, documentos: input.documentos ?? [] });
  revalidatePath("/empleados");
  return { id: e.id };
});

export const retirarEmpleadoAction = action({ perm: "empleados.editar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await retirarEmpleado(ctx, id);
  revalidatePath("/empleados");
  return true;
});
