"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { cambiarEstadoActivo, eliminarActivo, guardarActivo } from "@/lib/activos/service";

const ESTADOS = ["OPERATIVO", "EN_MANTENIMIENTO", "FUERA_SERVICIO", "DADO_DE_BAJA"] as const;

const activoSchema = z.object({
  id: zs.optId(),
  nombre: zs.text(1, 120),
  categoria: zs.text(1, 60),
  ubicacion: zs.optText(120),
  zonaId: zs.optId(),
  marca: zs.optText(60),
  modelo: zs.optText(60),
  serie: zs.optText(80),
  fechaCompra: zs.optDate(),
  valor: zs.optMoney(),
  vidaUtilAnios: zs.optInt(),
  proveedorId: zs.optId(),
  garantiaVence: zs.optDate(),
  fotos: zs.list().optional(),
  manuales: zs.list().optional(),
  estado: z.enum(ESTADOS),
  notas: zs.optText(2000),
});

export const guardarActivoAction = action({ perm: ["activos.crear", "activos.editar"], schema: activoSchema }, async (input, ctx) => {
  const a = await guardarActivo(ctx, {
    ...input,
    fotos: input.fotos ?? [],
    manuales: input.manuales ?? [],
  });
  revalidatePath("/activos", "layout");
  return { id: a.id };
});

export const cambiarEstadoActivoAction = action(
  { perm: "activos.editar", schema: z.object({ id: zs.id(), estado: z.enum(ESTADOS) }) },
  async ({ id, estado }, ctx) => {
    await cambiarEstadoActivo(ctx, id, estado);
    revalidatePath("/activos", "layout");
    return true;
  },
);

export const eliminarActivoAction = action({ perm: "activos.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarActivo(ctx, id);
  revalidatePath("/activos", "layout");
  return true;
});
