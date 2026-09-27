"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { CATEGORIAS_DOCUMENTO, confirmarLectura, eliminarCarpeta, eliminarDocumento, guardarCarpeta, guardarDocumento, nuevaVersion } from "@/lib/documentos/service";

const done = <T>(r: T) => {
  revalidatePath("/documentos", "layout");
  return r;
};

const documentoSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(3, 150),
  descripcion: zs.optText(1000),
  categoria: z.enum(CATEGORIAS_DOCUMENTO),
  carpetaId: zs.optId(),
  rolesVisibles: zs.list(),
  requiereAcuse: zs.bool(),
  vence: zs.optDate(),
  publicado: zs.bool(),
  generarCodigo: zs.bool(),
  archivoUrl: zs.optText(500),
  notas: zs.optText(500),
  notificar: zs.bool(),
});

export const guardarDocumentoAction = action({ perm: ["documentos.crear", "documentos.editar"], schema: documentoSchema }, async (input, ctx) => {
  const d = await guardarDocumento(ctx, { ...input, vence: input.vence ?? null });
  return done({ id: d.id });
});

export const nuevaVersionAction = action(
  { perm: ["documentos.crear", "documentos.editar"], schema: z.object({ id: zs.id(), archivoUrl: zs.text(5, 500), notas: zs.optText(500), notificar: zs.bool() }) },
  async ({ id, archivoUrl, notas, notificar }, ctx) => done(await nuevaVersion(ctx, id, { archivoUrl, notas, notificar })),
);

export const eliminarDocumentoAction = action({ perm: "documentos.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarDocumento(ctx, id)));

export const confirmarLecturaAction = action({ perm: "documentos.ver", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await confirmarLectura(ctx, id)));

export const guardarCarpetaAction = action(
  { perm: ["documentos.crear", "documentos.editar"], schema: z.object({ id: zs.optId(), nombre: zs.text(2, 80), padreId: zs.optId(), rolesVisibles: zs.list() }) },
  async (input, ctx) => done({ id: (await guardarCarpeta(ctx, input)).id }),
);

export const eliminarCarpetaAction = action({ perm: "documentos.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarCarpeta(ctx, id)));
