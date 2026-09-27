"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import {
  archivarPublicacion,
  comentar,
  eliminarComentario,
  eliminarPublicacion,
  fijarPublicacion,
  guardarPublicacion,
  moderarComentario,
  moderarPublicacion,
  reaccionar,
} from "@/lib/muro/service";

function parseJson(s: string | null | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    throw new AppError("El formulario no tiene un formato válido.");
  }
}

const done = <T>(r: T) => {
  revalidatePath("/muro", "layout");
  revalidatePath("/clasificados", "layout");
  return r;
};

const CATEGORIAS = ["AVISO", "NOTICIA", "EVENTO", "EMERGENCIA", "CLASIFICADO", "PERDIDO_ENCONTRADO"] as const;

const publicacionSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(3, 150),
  categoria: z.enum(CATEGORIAS),
  contenido: zs.text(1, 200000),
  fijada: zs.bool(),
  permiteComentarios: zs.bool(),
  notificar: zs.bool(),
  venceEn: zs.optDate(),
  segmentoId: zs.optId(),
  audiencia: zs.optText(20000),
  precio: zs.optMoney(),
  imagenes: zs.list(),
  subcategoria: zs.optText(40),
  contacto: zs.optText(200),
});

/** Crear/editar publicación. El permiso se valida por categoría dentro del servicio. */
export const guardarPublicacionAction = action(
  { perm: ["comunicaciones.publicar", "clasificados.publicar", "clasificados.moderar"], schema: publicacionSchema },
  async (input, ctx) => {
    const bloques = (parseJson(input.contenido) as unknown[] | null) ?? [];
    const contenido = input.categoria === "CLASIFICADO" ? [...bloques, { tipo: "meta", subcategoria: input.subcategoria ?? undefined, contacto: input.contacto ?? undefined }] : bloques;
    const p = await guardarPublicacion(ctx, {
      id: input.id,
      titulo: input.titulo,
      categoria: input.categoria,
      contenido,
      fijada: input.fijada,
      permiteComentarios: input.permiteComentarios,
      notificar: input.notificar,
      venceEn: input.venceEn ?? null,
      segmentoId: input.segmentoId,
      audiencia: parseJson(input.audiencia),
      precio: input.precio ?? null,
      imagenes: input.imagenes,
    });
    return done({ id: p.id, estado: p.estado });
  },
);

const idSchema = z.object({ id: zs.id() });

export const eliminarPublicacionAction = action({ perm: ["comunicaciones.ver", "clasificados.ver"], schema: idSchema }, async ({ id }, ctx) => done(await eliminarPublicacion(ctx, id)));
export const archivarPublicacionAction = action({ perm: ["comunicaciones.ver", "clasificados.ver"], schema: idSchema }, async ({ id }, ctx) => done(await archivarPublicacion(ctx, id)));
export const fijarPublicacionAction = action({ perm: "comunicaciones.publicar", schema: z.object({ id: zs.id(), fijada: zs.bool() }) }, async ({ id, fijada }, ctx) => done(await fijarPublicacion(ctx, id, fijada)));

export const moderarPublicacionAction = action(
  { perm: ["clasificados.moderar", "comunicaciones.moderar"], schema: z.object({ id: zs.id(), decision: z.enum(["APROBAR", "RECHAZAR"]), motivo: zs.optText(300) }) },
  async ({ id, decision, motivo }, ctx) => done(await moderarPublicacion(ctx, id, decision, motivo)),
);

export const reaccionarAction = action(
  { perm: ["comunicaciones.comentar", "clasificados.ver"], schema: z.object({ id: zs.id(), tipo: z.enum(["LIKE", "GRACIAS", "CORAZON", "IMPORTANTE"]) }) },
  async ({ id, tipo }, ctx) => reaccionar(ctx, id, tipo),
);

export const comentarAction = action({ perm: "comunicaciones.comentar", schema: z.object({ id: zs.id(), contenido: zs.text(1, 1000) }) }, async ({ id, contenido }, ctx) => {
  await comentar(ctx, id, contenido);
  revalidatePath(`/muro/${id}`);
  return true;
});

export const moderarComentarioAction = action(
  { perm: ["comunicaciones.moderar", "clasificados.moderar"], schema: z.object({ id: zs.id(), oculto: zs.bool(), publicacionId: zs.id() }) },
  async ({ id, oculto, publicacionId }, ctx) => {
    await moderarComentario(ctx, id, oculto);
    revalidatePath(`/muro/${publicacionId}`);
    return true;
  },
);

export const eliminarComentarioAction = action({ perm: "comunicaciones.ver", schema: z.object({ id: zs.id(), publicacionId: zs.id() }) }, async ({ id, publicacionId }, ctx) => {
  await eliminarComentario(ctx, id);
  revalidatePath(`/muro/${publicacionId}`);
  return true;
});
