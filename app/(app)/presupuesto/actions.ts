"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { cambiarEstadoGasto, cambiarEstadoPresupuesto, crearPresupuesto, eliminarGasto, eliminarRubro, guardarGasto, guardarRubro } from "@/lib/presupuesto/service";

const done = <T>(r: T) => {
  revalidatePath("/presupuesto", "layout");
  return r;
};

export const crearPresupuestoAction = action(
  { perm: "presupuesto.editar", schema: z.object({ anio: zs.int(2000, 2100), copiarDe: zs.optInt(), incrementoPct: zs.optNumber(), notas: zs.optText(1000) }) },
  async (input, ctx) => done({ id: (await crearPresupuesto(ctx, input)).id }),
);

export const aprobarPresupuestoAction = action(
  { perm: "presupuesto.aprobar_gastos", schema: z.object({ id: zs.id(), estado: z.enum(["BORRADOR", "APROBADO", "CERRADO"]), notas: zs.optText(1000) }) },
  async ({ id, estado, notas }, ctx) => done({ id: (await cambiarEstadoPresupuesto(ctx, id, estado, notas)).id }),
);

export const guardarRubroAction = action(
  {
    perm: "presupuesto.editar",
    schema: z.object({ id: zs.optId(), presupuestoId: zs.id(), tipo: z.enum(["INGRESO", "GASTO"]), nombre: zs.text(2, 120), cuentaContable: zs.optText(20), valorAnual: zs.money(0) }),
  },
  async (input, ctx) => done({ id: (await guardarRubro(ctx, input)).id }),
);

export const eliminarRubroAction = action({ perm: "presupuesto.editar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarRubro(ctx, id)));

const gastoSchema = z.object({
  id: zs.optId(),
  fecha: zs.date(),
  descripcion: zs.text(3, 200),
  valor: zs.money(1),
  rubroId: zs.optId(),
  proveedorId: zs.optId(),
  cuentaContable: zs.optText(20),
  comprobanteUrl: zs.optText(500),
});

export const guardarGastoAction = action({ perm: "presupuesto.editar", schema: gastoSchema }, async (input, ctx) => done({ id: (await guardarGasto(ctx, input)).id }));

export const aprobarGastoAction = action(
  { perm: "presupuesto.aprobar_gastos", schema: z.object({ id: zs.id(), estado: z.enum(["APROBADO", "RECHAZADO"]), motivo: zs.optText(300), rubroId: zs.optId() }) },
  async (input, ctx) => done({ id: (await cambiarEstadoGasto(ctx, input)).id }),
);

export const pagarGastoAction = action(
  { perm: ["presupuesto.editar", "presupuesto.aprobar_gastos"], schema: z.object({ id: zs.id(), comprobanteUrl: zs.optText(500) }) },
  async ({ id, comprobanteUrl }, ctx) => done({ id: (await cambiarEstadoGasto(ctx, { id, estado: "PAGADO", comprobanteUrl })).id }),
);

export const eliminarGastoAction = action({ perm: "presupuesto.editar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarGasto(ctx, id)));
