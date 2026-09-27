"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { cancelarCampana, duplicarCampana, eliminarCampana, enviarCampana, guardarCampana, renderCorreo } from "@/lib/comunicaciones/correo-masivo";
import { definicionEfectiva, resolverDestinatariosCorreo } from "@/lib/segmentos";

function parseJson(s: string | null | undefined): unknown {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    throw new AppError("La definición del segmento no es válida.");
  }
}

const done = <T>(r: T) => {
  revalidatePath("/comunicaciones", "layout");
  return r;
};

const campanaSchema = z.object({
  id: zs.optId(),
  asunto: zs.text(3, 200),
  plantilla: zs.text(1, 100000),
  segmentoId: zs.optId(),
  definicion: zs.optText(20000),
  adjuntos: zs.list(),
  programadaPara: zs.optDate(),
  accion: z.enum(["BORRADOR", "PROGRAMAR", "ENVIAR"]),
});

export const guardarCampanaAction = action({ perm: "comunicaciones.correo_masivo", schema: campanaSchema }, async (input, ctx) => {
  const r = await guardarCampana(ctx, { ...input, definicion: parseJson(input.definicion), programadaPara: input.programadaPara ?? null });
  return done(r);
});

const previaSchema = z.object({ asunto: zs.text(1, 200), plantilla: zs.text(1, 100000), segmentoId: zs.optId(), definicion: zs.optText(20000) });

/** Vista previa con los datos del primer destinatario del segmento (o un ejemplo). */
export const vistaPreviaCorreoAction = action({ perm: "comunicaciones.correo_masivo", schema: previaSchema }, async (input, ctx) => {
  const def = await definicionEfectiva(ctx, { segmentoId: input.segmentoId, definicion: parseJson(input.definicion) });
  const dest = await resolverDestinatariosCorreo(ctx, def);
  const ejemplo = dest.find((d) => d.unidadesFinancieras.length) ?? dest[0] ?? { email: "vecino@ejemplo.co", nombre: "Vecino de ejemplo", usuarioId: null, personaId: null, unidadIds: [], unidades: ["T1-101"], unidadesFinancieras: [] };
  const r = await renderCorreo(ctx, { asunto: input.asunto, plantilla: input.plantilla }, ejemplo);
  return { para: ejemplo.email, nombre: ejemplo.nombre, asunto: r.asunto, html: r.html, total: dest.length };
});

export const enviarCampanaAction = action({ perm: "comunicaciones.correo_masivo", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await enviarCampana(ctx, id)));
export const cancelarCampanaAction = action({ perm: "comunicaciones.correo_masivo", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await cancelarCampana(ctx, id)));
export const duplicarCampanaAction = action({ perm: "comunicaciones.correo_masivo", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await duplicarCampana(ctx, id)));
export const eliminarCampanaAction = action({ perm: "comunicaciones.correo_masivo", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarCampana(ctx, id)));
