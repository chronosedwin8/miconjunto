"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { lineas } from "@/lib/mantenimiento/calculos";
import {
  agregarEvidencias,
  cancelarOrden,
  cerrarOrden,
  eliminarPlan,
  generarOrdenAhora,
  guardarOrden,
  guardarPlan,
  iniciarOrden,
  marcarItemChecklist,
  quitarEvidencia,
} from "@/lib/mantenimiento/service";

const done = <T>(r: T) => {
  revalidatePath("/mantenimiento", "layout");
  revalidatePath("/activos", "layout");
  return r;
};

const ordenSchema = z.object({
  id: zs.optId(),
  titulo: zs.text(3, 150),
  descripcion: zs.optText(3000),
  activoId: zs.optId(),
  zonaId: zs.optId(),
  proveedorId: zs.optId(),
  asignadoAId: zs.optId(),
  fechaProgramada: zs.date(),
  checklistTexto: zs.optText(4000),
  costo: zs.optMoney(),
});

export const guardarOrdenAction = action({ perm: ["mantenimiento.crear", "mantenimiento.gestionar"], schema: ordenSchema }, async ({ checklistTexto, ...input }, ctx) => {
  const o = await guardarOrden(ctx, { ...input, checklist: checklistTexto !== undefined ? lineas(checklistTexto) : undefined });
  return done({ id: o.id });
});

const idSchema = z.object({ id: zs.id() });

export const iniciarOrdenAction = action({ perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"], schema: idSchema }, async ({ id }, ctx) => {
  await iniciarOrden(ctx, id);
  return done(true);
});

export const marcarItemAction = action(
  { perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"], schema: z.object({ id: zs.id(), index: z.number().int().min(0), ok: z.boolean() }) },
  async ({ id, index, ok }, ctx) => done(await marcarItemChecklist(ctx, id, index, ok)),
);

export const agregarEvidenciasAction = action(
  { perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"], schema: z.object({ id: zs.id(), urls: z.array(z.string().min(1)).min(1).max(10), momento: z.enum(["antes", "despues", "otra"]) }) },
  async ({ id, urls, momento }, ctx) => done({ evidencias: await agregarEvidencias(ctx, id, urls, momento) }),
);

export const quitarEvidenciaAction = action(
  { perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"], schema: z.object({ id: zs.id(), url: z.string().min(1) }) },
  async ({ id, url }, ctx) => done(await quitarEvidencia(ctx, id, url)),
);

const cierreSchema = z.object({
  id: zs.id(),
  notasCierre: zs.optText(3000),
  costo: zs.optMoney(),
  evidencias: zs.list().optional(),
  checklistCompleto: zs.bool().optional(),
});

export const cerrarOrdenAction = action({ perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"], schema: cierreSchema }, async (input, ctx) => {
  const o = await cerrarOrden(ctx, input);
  revalidatePath("/presupuesto", "layout");
  return done({ id: o.id });
});

export const cancelarOrdenAction = action(
  { perm: "mantenimiento.gestionar", schema: z.object({ id: zs.id(), motivo: zs.text(3, 300) }) },
  async ({ id, motivo }, ctx) => {
    await cancelarOrden(ctx, id, motivo);
    return done(true);
  },
);

const planSchema = z.object({
  id: zs.optId(),
  nombre: zs.text(3, 150),
  activoId: zs.optId(),
  zonaId: zs.optId(),
  tipo: z.enum(["PREVENTIVO", "CORRECTIVO", "LEGAL"]),
  frecuenciaDias: zs.int(1, 3650),
  proximaFecha: zs.date(),
  responsableId: zs.optId(),
  proveedorId: zs.optId(),
  checklistTexto: zs.optText(4000),
  costoEstimado: zs.optMoney(),
  diasAnticipacion: zs.int(0, 180),
  activoPlan: zs.bool(),
});

export const guardarPlanAction = action({ perm: "mantenimiento.crear", schema: planSchema }, async ({ checklistTexto, ...input }, ctx) => {
  const p = await guardarPlan(ctx, { ...input, checklist: lineas(checklistTexto) });
  return done({ id: p.id });
});

export const eliminarPlanAction = action({ perm: "mantenimiento.crear", schema: idSchema }, async ({ id }, ctx) => done(await eliminarPlan(ctx, id)));

export const generarOrdenAhoraAction = action({ perm: ["mantenimiento.crear", "mantenimiento.gestionar"], schema: idSchema }, async ({ id }, ctx) => {
  const o = await generarOrdenAhora(ctx, id);
  return done({ id: o.id });
});
