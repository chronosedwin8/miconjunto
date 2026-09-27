"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import {
  asignarTicket,
  calificarTicket,
  cambiarEstado,
  cambiarPrioridad,
  comentarTicket,
  crearOrdenDesdeTicket,
  crearTicket,
  eliminarPlantilla,
  guardarPlantilla,
  reabrirTicket,
} from "@/lib/tickets/service";
import {
  asignarSchema,
  calificarSchema,
  cambiarEstadoSchema,
  comentarSchema,
  crearTicketSchema,
  ordenSchema,
  plantillaSchema,
  prioridadSchema,
  reabrirSchema,
} from "@/lib/tickets/schemas";

const listo = (id?: string) => {
  revalidatePath("/tickets");
  if (id) revalidatePath(`/tickets/${id}`);
};

export const crearTicketAction = action({ perm: "tickets.crear", schema: crearTicketSchema }, async (input, ctx) => {
  const t = await crearTicket(ctx, input);
  listo();
  return { id: t.id, radicado: t.radicado, fechaLimite: t.fechaLimite.toISOString() };
});

export const cambiarEstadoAction = action({ perm: "tickets.gestionar", schema: cambiarEstadoSchema }, async ({ id, ...input }, ctx) => {
  const t = await cambiarEstado(ctx, id, input);
  listo(id);
  return { id: t.id, estado: t.estado };
});

export const asignarAction = action({ perm: "tickets.asignar", schema: asignarSchema }, async ({ id, ...input }, ctx) => {
  await asignarTicket(ctx, id, input);
  listo(id);
  return { id };
});

export const prioridadAction = action({ perm: "tickets.gestionar", schema: prioridadSchema }, async ({ id, prioridad }, ctx) => {
  await cambiarPrioridad(ctx, id, prioridad);
  listo(id);
  return { id };
});

export const comentarAction = action({ perm: ["tickets.ver", "tickets.ver_todos"], schema: comentarSchema }, async ({ id, ...input }, ctx) => {
  await comentarTicket(ctx, id, input);
  listo(id);
  return { id };
});

export const calificarAction = action({ perm: ["tickets.ver", "tickets.crear"], schema: calificarSchema }, async ({ id, ...input }, ctx) => {
  await calificarTicket(ctx, id, input);
  listo(id);
  return { id };
});

export const reabrirAction = action({ perm: ["tickets.ver", "tickets.gestionar"], schema: reabrirSchema }, async ({ id, motivo }, ctx) => {
  await reabrirTicket(ctx, id, motivo);
  listo(id);
  return { id };
});

export const crearOrdenAction = action({ perm: "tickets.gestionar", schema: ordenSchema }, async ({ id, ...input }, ctx) => {
  const o = await crearOrdenDesdeTicket(ctx, id, input);
  listo(id);
  revalidatePath("/mantenimiento");
  return { id, ordenId: o.id, numero: o.numero };
});

export const guardarPlantillaAction = action({ perm: "tickets.gestionar", schema: plantillaSchema }, async (input, ctx) => {
  const p = await guardarPlantilla(ctx, input);
  revalidatePath("/tickets/plantillas");
  return { id: p.id };
});

export const eliminarPlantillaAction = action({ perm: "tickets.gestionar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarPlantilla(ctx, id);
  revalidatePath("/tickets/plantillas");
  return true;
});
