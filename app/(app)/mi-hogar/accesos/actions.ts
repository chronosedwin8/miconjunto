"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import { cancelarInvitacion, editarCapacidades, invitarMiembro, pausarAcceso, quitarAcceso, reenviarInvitacion } from "@/lib/hogar/service";

// La autorización (titular de la unidad o administración) la hace el servicio: el arrendatario con acceso derivado
// también es titular de su hogar aunque su rol no tenga `residentes.invitar`.

function done<T>(r: T): T {
  revalidatePath("/mi-hogar", "layout");
  revalidatePath("/residentes", "layout");
  return r;
}

const capacidades = zs.list();

const invitarSchema = z.object({
  unidadId: zs.id(),
  email: zs.email(),
  nombre: zs.text(2, 120),
  telefono: zs.optText(30),
  tipoVinculo: z.enum(["FAMILIAR", "RESIDENTE", "EMPLEADO_DOMESTICO", "CUIDADOR", "ARRENDATARIO"], { error: "Elige quién es" }),
  capacidades,
  derivadoDeId: zs.optId(),
});

export const invitarAccesoAction = action({ schema: invitarSchema }, async (input, ctx) => {
  const r = await invitarMiembro(ctx, input);
  return done({ link: r.link, whatsapp: r.whatsapp });
});

const editarSchema = z.object({ vinculoId: zs.id(), capacidades, derivadoDeId: zs.optId() });

export const editarAccesoAction = action({ schema: editarSchema }, async (input, ctx) => done(await editarCapacidades(ctx, input)));

const pausarSchema = z.object({ vinculoId: zs.id(), pausar: zs.bool() });

export const pausarAccesoAction = action({ schema: pausarSchema }, async (input, ctx) => done(await pausarAcceso(ctx, input)));

const idSchema = z.object({ vinculoId: zs.id() });

export const quitarAccesoAction = action({ schema: idSchema }, async (input, ctx) => done(await quitarAcceso(ctx, input)));

const invSchema = z.object({ invitacionId: zs.id() });

export const reenviarInvitacionAccesoAction = action({ schema: invSchema }, async ({ invitacionId }, ctx) => {
  const r = await reenviarInvitacion(ctx, invitacionId);
  return done({ link: r.link, whatsapp: r.whatsapp });
});

export const cancelarInvitacionAccesoAction = action({ schema: invSchema }, async ({ invitacionId }, ctx) => done(await cancelarInvitacion(ctx, invitacionId)));
