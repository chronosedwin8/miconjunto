"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import {
  activarAlerta,
  atenderAlerta,
  eliminarBrigadista,
  eliminarSimulacro,
  guardarBrigadista,
  guardarPlan,
  guardarSimulacro,
  parseLineas,
} from "@/lib/emergencias/service";
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
    revalidatePath("/emergencias", "layout");
    return { id: a.id };
  },
);

export const atenderAlertaAction = action(
  { perm: ["emergencias.gestionar", "porteria.ver"], schema: z.object({ id: zs.id(), falsaAlarma: zs.bool().optional() }) },
  async (input, ctx) => {
    await atenderAlerta(ctx, input.id, input.falsaAlarma);
    revalidatePath("/emergencias", "layout");
    return true;
  },
);

// ── Plan de emergencia, brigadistas y simulacros ──
const planSchema = z.object({ puntos: zs.optText(5000), telefonos: zs.optText(3000), instrucciones: zs.optText(10000) });

export const guardarPlanAction = action({ perm: "emergencias.gestionar", schema: planSchema }, async (input, ctx) => {
  const puntosEncuentro = parseLineas(input.puntos).map((x) => ({ nombre: x.a, ubicacion: x.b }));
  const telefonos = parseLineas(input.telefonos)
    .map((x) => ({ nombre: x.a, numero: x.b }))
    .filter((t) => t.numero);
  await guardarPlan(ctx, { puntosEncuentro, telefonos, instrucciones: input.instrucciones });
  revalidatePath("/emergencias", "layout");
  return true;
});

const brigadistaSchema = z.object({
  id: zs.optId(),
  personaId: zs.optId(),
  nombre: zs.optText(120),
  rol: z.enum(["COORDINADOR", "PRIMEROS_AUXILIOS", "EVACUACION", "CONTRA_INCENDIO"]),
  torreNombre: zs.optText(60),
  telefono: zs.optText(30),
});

export const guardarBrigadistaAction = action({ perm: "emergencias.gestionar", schema: brigadistaSchema }, async (input, ctx) => {
  const b = await guardarBrigadista(ctx, input);
  revalidatePath("/emergencias", "layout");
  return { id: b.id };
});

export const eliminarBrigadistaAction = action({ perm: "emergencias.gestionar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarBrigadista(ctx, id);
  revalidatePath("/emergencias", "layout");
  return true;
});

const simulacroSchema = z.object({
  id: zs.optId(),
  fecha: zs.date(),
  tipo: zs.text(2, 80),
  participantes: zs.int(0, 100000),
  tiempoEvacuacionMin: zs.optInt(),
  observaciones: zs.optText(3000),
});

export const guardarSimulacroAction = action({ perm: "emergencias.gestionar", schema: simulacroSchema }, async (input, ctx) => {
  const s = await guardarSimulacro(ctx, input);
  revalidatePath("/emergencias", "layout");
  return { id: s.id };
});

export const eliminarSimulacroAction = action({ perm: "emergencias.gestionar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarSimulacro(ctx, id);
  revalidatePath("/emergencias", "layout");
  return true;
});
