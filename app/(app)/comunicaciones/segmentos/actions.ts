"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { contarDestinatarios, definicionEfectiva, eliminarSegmento, guardarSegmento } from "@/lib/segmentos";

function parseJson(s: string | null | undefined): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    throw new AppError("La definición del segmento no es válida.");
  }
}

const contarSchema = z.object({ segmentoId: zs.optId(), definicion: zs.optText(20000) });

/** Conteo en vivo de destinatarios (constructor de segmentos). */
export const contarSegmentoAction = action(
  { perm: ["comunicaciones.segmentos", "comunicaciones.correo_masivo", "comunicaciones.publicar", "encuestas.crear", "votaciones.crear"], schema: contarSchema },
  async (input, ctx) => contarDestinatarios(ctx, await definicionEfectiva(ctx, { segmentoId: input.segmentoId, definicion: parseJson(input.definicion) })),
);

const guardarSchema = z.object({ id: zs.optId(), nombre: zs.text(2, 80), descripcion: zs.optText(300), definicion: zs.text(2, 20000) });

export const guardarSegmentoAction = action({ perm: "comunicaciones.segmentos", schema: guardarSchema }, async (input, ctx) => {
  const s = await guardarSegmento(ctx, { id: input.id, nombre: input.nombre, descripcion: input.descripcion, definicion: parseJson(input.definicion) });
  revalidatePath("/comunicaciones/segmentos");
  return { id: s.id };
});

export const eliminarSegmentoAction = action({ perm: "comunicaciones.segmentos", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarSegmento(ctx, id);
  revalidatePath("/comunicaciones/segmentos");
  return true;
});
