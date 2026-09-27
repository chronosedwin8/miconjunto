"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import {
  acusarLlamado,
  actualizarIncidente,
  agregarSesion,
  cerrarLlamado,
  crearIncidente,
  crearLlamado,
  decidirMulta,
  guardarInfraccion,
  notificarMulta,
  presentarDescargos,
  proponerMulta,
  responderLlamado,
} from "@/lib/convivencia/service";
import {
  cerrarLlamadoSchema,
  decidirSchema,
  descargosSchema,
  estadoIncidenteSchema,
  idSchema,
  incidenteSchema,
  infraccionSchema,
  llamadoSchema,
  multaSchema,
  notificarSchema,
  respuestaSchema,
  sesionSchema,
} from "@/lib/convivencia/schemas";

const listo = () => revalidatePath("/convivencia", "layout");

export const guardarInfraccionAction = action({ perm: "convivencia.infracciones", schema: infraccionSchema }, async (input, ctx) => {
  const r = await guardarInfraccion(ctx, input);
  listo();
  return { id: r.id };
});

export const crearLlamadoAction = action({ perm: "convivencia.crear", schema: llamadoSchema }, async (input, ctx) => {
  const l = await crearLlamado(ctx, input);
  listo();
  return { id: l.id };
});

export const acusarLlamadoAction = action({ perm: "convivencia.ver", schema: idSchema }, async ({ id }, ctx) => {
  await acusarLlamado(ctx, id);
  listo();
  return { id };
});

export const responderLlamadoAction = action({ perm: "convivencia.ver", schema: respuestaSchema }, async ({ id, respuesta }, ctx) => {
  await responderLlamado(ctx, id, respuesta);
  listo();
  return { id };
});

export const cerrarLlamadoAction = action({ perm: "convivencia.crear", schema: cerrarLlamadoSchema }, async ({ id, nota }, ctx) => {
  await cerrarLlamado(ctx, id, nota);
  listo();
  return { id };
});

export const proponerMultaAction = action({ perm: "convivencia.crear", schema: multaSchema }, async (input, ctx) => {
  const m = await proponerMulta(ctx, input);
  listo();
  return { id: m.id };
});

export const notificarMultaAction = action({ perm: "convivencia.crear", schema: notificarSchema }, async ({ id, dias }, ctx) => {
  await notificarMulta(ctx, id, dias);
  listo();
  return { id };
});

export const descargosAction = action({ perm: ["convivencia.ver", "convivencia.crear"], schema: descargosSchema }, async ({ id, descargos }, ctx) => {
  await presentarDescargos(ctx, id, descargos);
  listo();
  return { id };
});

export const decidirMultaAction = action({ perm: "convivencia.decidir", schema: decidirSchema }, async ({ id, ...input }, ctx) => {
  const r = await decidirMulta(ctx, id, input);
  listo();
  revalidatePath("/cartera", "layout");
  return r;
});

export const crearIncidenteAction = action({ perm: "convivencia.incidentes", schema: incidenteSchema }, async (input, ctx) => {
  const i = await crearIncidente(ctx, input);
  listo();
  return { id: i.id };
});

export const sesionAction = action({ perm: "convivencia.incidentes", schema: sesionSchema }, async ({ id, ...input }, ctx) => {
  await agregarSesion(ctx, id, input);
  listo();
  return { id };
});

export const estadoIncidenteAction = action({ perm: "convivencia.incidentes", schema: estadoIncidenteSchema }, async ({ id, estado, acuerdos }, ctx) => {
  await actualizarIncidente(ctx, id, { estado, ...(acuerdos ? { acuerdos } : {}) });
  listo();
  return { id };
});
