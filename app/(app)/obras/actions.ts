"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import {
  actualizarContratistas,
  cambiarEstadoMudanza,
  cambiarEstadoObra,
  decidirMudanza,
  decidirObra,
  solicitarMudanza,
  solicitarObra,
  verificarPazYSalvo,
} from "@/lib/obras/service";
import { contratistasSchema, decidirMudanzaSchema, decidirObraSchema, estadoMudanzaSchema, estadoObraSchema, mudanzaSchema, obraSchema } from "@/lib/obras/schemas";
import { idSchema } from "@/lib/convivencia/schemas";

const listo = () => {
  revalidatePath("/obras", "layout");
  revalidatePath("/porteria", "layout");
};

export const solicitarObraAction = action({ perm: ["obras.solicitar", "obras.aprobar"], schema: obraSchema }, async (input, ctx) => {
  const o = await solicitarObra(ctx, input);
  listo();
  return { id: o.id };
});

export const contratistasAction = action({ perm: ["obras.solicitar", "obras.aprobar"], schema: contratistasSchema }, async ({ id, contratistas }, ctx) => {
  await actualizarContratistas(ctx, id, contratistas);
  listo();
  return { id };
});

export const decidirObraAction = action({ perm: "obras.aprobar", schema: decidirObraSchema }, async ({ id, ...input }, ctx) => {
  await decidirObra(ctx, id, input);
  listo();
  return { id };
});

export const estadoObraAction = action({ perm: ["obras.solicitar", "obras.aprobar"], schema: estadoObraSchema }, async ({ id, ...input }, ctx) => {
  await cambiarEstadoObra(ctx, id, input);
  listo();
  return { id };
});

export const solicitarMudanzaAction = action({ perm: ["obras.solicitar", "obras.aprobar"], schema: mudanzaSchema }, async (input, ctx) => {
  const m = await solicitarMudanza(ctx, input);
  listo();
  return { id: m.id };
});

export const verificarPazYSalvoAction = action({ perm: ["obras.ver", "obras.ver_todos"], schema: idSchema }, async ({ id }, ctx) => {
  const r = await verificarPazYSalvo(ctx, id);
  listo();
  return r;
});

export const decidirMudanzaAction = action({ perm: "obras.aprobar", schema: decidirMudanzaSchema }, async ({ id, ...input }, ctx) => {
  await decidirMudanza(ctx, id, input);
  listo();
  return { id };
});

export const estadoMudanzaAction = action({ perm: ["obras.solicitar", "obras.aprobar"], schema: estadoMudanzaSchema }, async ({ id, estado }, ctx) => {
  await cambiarEstadoMudanza(ctx, id, estado);
  listo();
  return { id };
});
