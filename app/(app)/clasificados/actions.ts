"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { guardarPublicacion } from "@/lib/muro/service";
import { SUBCATEGORIAS_CLASIFICADO } from "@/lib/muro/contenido";
import { cerrarObjeto, marcarDevuelto, reportarObjeto } from "@/lib/clasificados/service";

const done = <T>(r: T) => {
  revalidatePath("/clasificados", "layout");
  revalidatePath("/muro");
  return r;
};

const clasificadoSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(3, 120),
  subcategoria: z.enum(SUBCATEGORIAS_CLASIFICADO),
  descripcion: zs.text(10, 3000),
  precio: zs.optMoney(),
  contacto: zs.optText(120),
  imagenes: zs.list(),
  permiteComentarios: zs.bool(),
});

/** Publica (o edita) un clasificado. Queda en moderación salvo que quien publica sea moderador. */
export const guardarClasificadoAction = action({ perm: ["clasificados.publicar", "clasificados.moderar"], schema: clasificadoSchema }, async (input, ctx) => {
  const p = await guardarPublicacion(ctx, {
    id: input.id,
    titulo: input.titulo,
    categoria: "CLASIFICADO",
    contenido: [
      { tipo: "texto", texto: input.descripcion },
      { tipo: "meta", subcategoria: input.subcategoria, contacto: input.contacto ?? undefined },
    ],
    precio: input.precio ?? null,
    imagenes: input.imagenes,
    permiteComentarios: input.permiteComentarios,
    venceEn: new Date(Date.now() + 60 * 86_400_000),
  });
  return done({ id: p.id, estado: p.estado });
});

const objetoSchema = z.object({
  tipo: z.enum(["PERDIDO", "ENCONTRADO"]),
  descripcion: zs.text(5, 500),
  lugar: zs.optText(120),
  fecha: zs.optDate(),
  fotoUrl: zs.optText(500),
  contacto: zs.optText(120),
});

export const reportarObjetoAction = action({ perm: "clasificados.publicar", schema: objetoSchema }, async (input, ctx) => {
  const o = await reportarObjeto(ctx, input);
  return done({ id: o.id });
});

export const devolverObjetoAction = action({ perm: "clasificados.ver", schema: z.object({ id: zs.id(), entregadoA: zs.text(2, 120) }) }, async ({ id, entregadoA }, ctx) =>
  done(await marcarDevuelto(ctx, id, entregadoA)),
);

export const cerrarObjetoAction = action({ perm: "clasificados.ver", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await cerrarObjeto(ctx, id)));
