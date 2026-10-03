"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { cerrarEncuesta, crearEncuesta, eliminarEncuesta, responderEncuesta } from "@/lib/encuestas/service";
import { MAX_OPCIONES, MAX_PREGUNTAS } from "@/lib/encuestas/limites";

const preguntaSchema = z.object({
  tipo: z.enum(["UNICA", "MULTIPLE", "ESCALA", "TEXTO"]),
  texto: z.string().trim().min(3, "Escribe la pregunta").max(300),
  opciones: z.array(z.string().max(200)).max(MAX_OPCIONES).optional(),
  requerida: z.boolean().optional(),
});

const crearSchema = z.object({
  titulo: zs.text(3, 150),
  descripcion: zs.optText(2000),
  anonima: zs.bool(),
  fin: zs.date(),
  audiencia: z.enum(["TODOS", "PROPIETARIOS", "TORRE", "SEGMENTO"]),
  torreId: zs.optId(),
  segmentoId: zs.optId(),
  preguntas: z.array(preguntaSchema).min(1, "Agrega al menos una pregunta").max(MAX_PREGUNTAS, `Máximo ${MAX_PREGUNTAS} preguntas`),
});

export const crearEncuestaAction = action({ perm: "encuestas.crear", schema: crearSchema }, async (input, ctx) => {
  const e = await crearEncuesta(ctx, input);
  revalidatePath("/encuestas");
  return { id: e.id };
});

const responderSchema = z.object({ encuestaId: zs.id(), r: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}) });

export const responderEncuestaAction = action({ perm: "encuestas.ver", schema: responderSchema }, async ({ encuestaId, r }, ctx) => {
  const out = await responderEncuesta(ctx, encuestaId, r);
  revalidatePath(`/encuestas/${encuestaId}`);
  revalidatePath("/encuestas");
  return out;
});

const idSchema = z.object({ id: zs.id() });

export const cerrarEncuestaAction = action({ perm: "encuestas.crear", schema: idSchema }, async ({ id }, ctx) => {
  await cerrarEncuesta(ctx, id);
  revalidatePath(`/encuestas/${id}`);
  return { id };
});

export const eliminarEncuestaAction = action({ perm: "encuestas.crear", schema: idSchema }, async ({ id }, ctx) => {
  await eliminarEncuesta(ctx, id);
  revalidatePath("/encuestas");
  return { id };
});
