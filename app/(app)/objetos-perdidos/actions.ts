"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { CATEGORIAS_OBJETO } from "@/lib/objetos-perdidos/reglas";
import {
  devolvioDirecto,
  disponerObjeto,
  entregarObjeto,
  marcarAparecio,
  reclamarObjeto,
  recibirEnCustodia,
  renovarReporte,
  reportarObjeto,
  resolverReclamo,
} from "@/lib/objetos-perdidos/service";

function done<T>(r: T) {
  revalidatePath("/objetos-perdidos", "layout");
  return r;
}

const idSchema = z.object({ id: zs.id() });

const reporteSchema = z.object({
  tipo: z.enum(["PERDIDO", "ENCONTRADO"]),
  categoria: z.enum(CATEGORIAS_OBJETO),
  titulo: zs.text(3, 80),
  descripcion: zs.text(5, 600),
  rasgosPrivados: zs.optText(600),
  color: zs.optText(40),
  marca: zs.optText(60),
  lugar: zs.optText(120),
  zonaId: zs.optId(),
  fecha: zs.optDate(),
  fotos: zs.list(),
  mostrarContacto: zs.bool().optional(),
  contacto: zs.optText(120),
  recompensa: zs.optText(120),
  custodia: zs.optText(120),
});

/** Reporta un objeto perdido o encontrado. Devuelve el id y cuántas coincidencias hay. */
export const reportarObjetoAction = action({ perm: ["objetos.reportar", "objetos.gestionar"], schema: reporteSchema }, async ({ mostrarContacto, ...input }, ctx) => {
  const o = await reportarObjeto(ctx, { ...input, contacto: mostrarContacto ? input.contacto : null });
  return done({ id: o.id, codigo: o.codigo, coincidencias: o.coincidencias });
});

export const recibirCustodiaAction = action({ perm: "objetos.gestionar", schema: z.object({ id: zs.id(), custodia: zs.text(2, 120) }) }, async ({ id, custodia }, ctx) => {
  await recibirEnCustodia(ctx, id, custodia);
  return done(true);
});

export const reclamarObjetoAction = action({ perm: ["objetos.reportar", "objetos.gestionar"], schema: z.object({ id: zs.id(), descripcion: zs.text(10, 800) }) }, async ({ id, descripcion }, ctx) => {
  const r = await reclamarObjeto(ctx, id, descripcion);
  return done({ id: r.id });
});

export const resolverReclamoAction = action(
  { perm: "objetos.gestionar", schema: z.object({ reclamoId: zs.id(), decision: z.enum(["APROBAR", "RECHAZAR"]), respuesta: zs.optText(500) }) },
  async ({ reclamoId, decision, respuesta }, ctx) => done(await resolverReclamo(ctx, reclamoId, decision, respuesta)),
);

export const entregarObjetoAction = action(
  { perm: "objetos.gestionar", schema: z.object({ id: zs.id(), entregadoA: zs.text(2, 120), entregadoDocumento: zs.text(5, 40), firma: zs.text(20, 400_000), perdidoId: zs.optId() }) },
  async ({ id, ...input }, ctx) => done(await entregarObjeto(ctx, id, input)),
);

export const aparecioAction = action({ perm: ["objetos.reportar", "objetos.gestionar"], schema: idSchema }, async ({ id }, ctx) => done(await marcarAparecio(ctx, id)));

export const devolvioDirectoAction = action({ perm: ["objetos.reportar", "objetos.gestionar"], schema: z.object({ id: zs.id(), entregadoA: zs.text(2, 120) }) }, async ({ id, entregadoA }, ctx) =>
  done(await devolvioDirecto(ctx, id, entregadoA)),
);

export const disponerObjetoAction = action(
  { perm: "objetos.gestionar", schema: z.object({ id: zs.id(), disposicion: z.enum(["DONADO", "CERRADO"]), nota: zs.text(5, 500) }) },
  async ({ id, disposicion, nota }, ctx) => done(await disponerObjeto(ctx, id, disposicion, nota)),
);

export const renovarReporteAction = action({ perm: ["objetos.reportar", "objetos.gestionar"], schema: idSchema }, async ({ id }, ctx) => done(await renovarReporte(ctx, id)));
