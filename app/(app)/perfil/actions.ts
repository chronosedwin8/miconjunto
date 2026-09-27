"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";
import { action } from "@/lib/action";
import { zs } from "@/lib/validation";
import {
  aceptarPolitica,
  actualizarMisDatos,
  cambiarContrasena,
  confirmarMfa,
  desactivarMfa,
  guardarPreferencias,
  iniciarMfa,
  solicitarSupresion,
} from "@/lib/perfil/service";

const done = <T>(r: T) => {
  revalidatePath("/perfil", "layout");
  return r;
};

const TIPOS_DOC = ["CC", "CE", "TI", "RC", "PA", "NIT", "PEP", "PPT"] as const;

const datosSchema = z.object({
  nombre: zs.text(2, 120),
  telefono: zs.optText(30),
  fotoUrl: zs.optText(400),
  persona: z
    .object({
      nombres: zs.text(1, 80),
      apellidos: zs.text(1, 80),
      tipoDocumento: z.enum(TIPOS_DOC),
      numeroDocumento: zs.text(3, 20),
      fechaNacimiento: zs.optDate(),
      genero: zs.optText(30),
      ocupacion: zs.optText(80),
      eps: zs.optText(80),
      tipoSangre: zs.optText(5),
      contactoEmergenciaNombre: zs.optText(120),
      contactoEmergenciaTelefono: zs.optText(30),
      movilidadReducida: zs.bool().optional(),
      movilidadDescripcion: zs.optText(500),
      requiereAsistenciaEvacuacion: zs.bool().optional(),
    })
    .optional(),
});

/** Derecho de actualización y rectificación: el titular corrige sus datos. */
export const actualizarMisDatosAction = action({ schema: datosSchema }, async (input, ctx) => done(await actualizarMisDatos(ctx, input)));

const prefSchema = z.object({ push: zs.bool(), email: zs.bool(), whatsapp: zs.bool() });

export const guardarPreferenciasAction = action({ schema: prefSchema }, async (input, ctx) => done(await guardarPreferencias(ctx, input)));

const claveSchema = z.object({ actual: zs.optText(200), nueva: zs.text(1, 200), confirmar: zs.text(1, 200), cerrarOtras: zs.bool() });

export const cambiarContrasenaAction = action({ schema: claveSchema }, async (input, ctx) => {
  const r = await cambiarContrasena(ctx, input);
  if (r.cerrarSesion) await signOut({ redirectTo: "/login?clave=1" });
  return done(true);
});

export const iniciarMfaAction = action({ schema: z.object({}) }, async (_input, ctx) => done(await iniciarMfa(ctx)));

const codigoSchema = z.object({ codigo: zs.text(6, 10) });

export const confirmarMfaAction = action({ schema: codigoSchema }, async ({ codigo }, ctx) => done(await confirmarMfa(ctx, codigo)));

export const desactivarMfaAction = action({ schema: codigoSchema }, async ({ codigo }, ctx) => done(await desactivarMfa(ctx, codigo)));

export const aceptarPoliticaAction = action({ schema: z.object({}) }, async (_input, ctx) => {
  const r = await aceptarPolitica(ctx);
  revalidatePath("/mi-hogar", "layout");
  return done(r);
});

const supresionSchema = z.object({ motivo: zs.optText(500), cerrarCuenta: zs.bool(), confirmacion: zs.text(1, 20) });

/** Derecho de supresión (Ley 1581 de 2012). Si se cierra la cuenta, termina la sesión. */
export const solicitarSupresionAction = action({ schema: supresionSchema }, async (input, ctx) => {
  const r = await solicitarSupresion(ctx, input);
  if (r.cuentaCerrada) await signOut({ redirectTo: "/login?cuenta=cerrada" });
  revalidatePath("/mi-hogar", "layout");
  return done(r);
});
