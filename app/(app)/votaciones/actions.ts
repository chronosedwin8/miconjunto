"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { abrirVotacion, anularVotacion, cerrarVotacion, crearVotacion, votar } from "@/lib/votaciones/service";

const MAYORIAS = ["SIMPLE", "CALIFICADA_70", "UNANIME"] as const;
const PONDERACIONES = ["COEFICIENTE", "UNIDAD"] as const;
const QUIEN = ["PROPIETARIOS_AL_DIA", "PROPIETARIOS", "TODOS"] as const;

const crearSchema = z.object({
  pregunta: zs.text(5, 300),
  descripcion: zs.optText(3000),
  opciones: zs.list(),
  tipoMayoria: z.enum(MAYORIAS),
  ponderacion: z.enum(PONDERACIONES),
  quienVota: z.enum(QUIEN),
  secreto: zs.bool(),
  inicio: zs.optDate(),
  fin: zs.date(),
});

export const crearVotacionAction = action({ perm: "votaciones.crear", schema: crearSchema }, async (input, ctx) => {
  const v = await crearVotacion(ctx, { ...input, estado: "ABIERTA" });
  revalidatePath("/votaciones");
  return { id: v.id };
});

const votarSchema = z.object({ votacionId: zs.id(), unidadId: zs.id(), opcionId: zs.id() });

/** Votar: la elegibilidad por unidad (propia, poder, al día, asistencia) se valida en el servicio. */
export const votarAction = action({ perm: ["votaciones.votar", "votaciones.ver"], schema: votarSchema }, async (input, ctx) => {
  const r = await votar(ctx, input);
  revalidatePath(`/votaciones/${input.votacionId}`);
  return { comprobante: r.comprobante, unidad: r.unidad, emitidoEn: r.emitidoEn.toISOString() };
});

const idSchema = z.object({ id: zs.id() });

export const cerrarVotacionAction = action({ perm: ["votaciones.cerrar", "asambleas.gestionar"], schema: idSchema }, async ({ id }, ctx) => {
  const v = await cerrarVotacion(ctx, id);
  revalidatePath(`/votaciones/${id}`);
  if (v.asambleaId) revalidatePath(`/asambleas/${v.asambleaId}`, "layout");
  return { id };
});

const abrirSchema = z.object({ id: zs.id(), minutos: zs.int(1, 1440) });

export const abrirVotacionAction = action({ perm: ["votaciones.crear", "asambleas.gestionar"], schema: abrirSchema }, async ({ id, minutos }, ctx) => {
  const v = await abrirVotacion(ctx, id, minutos);
  revalidatePath(`/votaciones/${id}`);
  if (v.asambleaId) revalidatePath(`/asambleas/${v.asambleaId}`, "layout");
  return { id };
});

const anularSchema = z.object({ id: zs.id(), motivo: zs.text(5, 500) });

export const anularVotacionAction = action({ perm: "votaciones.cerrar", schema: anularSchema }, async ({ id, motivo }, ctx) => {
  await anularVotacion(ctx, id, motivo);
  revalidatePath(`/votaciones/${id}`);
  return { id };
});
