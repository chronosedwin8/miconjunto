"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { zs } from "@/lib/validation";
import { invitarUsuario } from "@/lib/usuarios/service";
import { aceptarPolitica } from "@/lib/perfil/service";
import { actualizarOcupacion, actualizarPersona, assertUnidadAccesible, esPropietarioDe, gestionaResidentes, miPersona } from "@/lib/residentes/service";
import { borrarBorrador, claveBorrador, guardarBorrador, marcarPaso } from "@/lib/residentes/panel";
import { audit } from "@/lib/audit";

const done = <T>(r: T) => {
  revalidatePath("/mi-hogar", "layout");
  return r;
};

const TIPOS_DOC = ["CC", "CE", "TI", "RC", "PA", "NIT", "PEP", "PPT"] as const;

// ── Borradores en el servidor ──
const borradorSchema = z.object({ clave: zs.text(1, 120), datos: z.record(z.string(), z.unknown()) });

export const guardarBorradorAction = action({ perm: "residentes.ver", schema: borradorSchema }, async ({ clave, datos }, ctx) => {
  if (!clave.startsWith("mi-hogar:paso")) throw new AppError("Borrador no válido.");
  if (JSON.stringify(datos).length > 20000) throw new AppError("El borrador es demasiado grande.");
  await guardarBorrador(ctx, clave, datos);
  return true;
});

// ── Avance ──
const pasoSchema = z.object({ unidadId: zs.id(), paso: zs.int(1, 9) });

export const marcarPasoAction = action({ perm: "residentes.ver", schema: pasoSchema }, async ({ unidadId, paso }, ctx) => {
  assertUnidadAccesible(ctx, unidadId);
  await marcarPaso(ctx, unidadId, paso);
  return done(true);
});

// ── Paso 1: datos del titular ──
const paso1Schema = z.object({
  unidadId: zs.id(),
  tipoDocumento: z.enum(TIPOS_DOC),
  numeroDocumento: zs.text(3, 20),
  nombres: zs.text(1, 80),
  apellidos: zs.text(1, 80),
  fechaNacimiento: zs.optDate(),
  genero: zs.optText(30),
  fotoUrl: zs.optText(400),
  telefono: zs.text(7, 30),
  email: zs.optEmail(),
  ocupacion: zs.optText(80),
});

export const guardarPaso1Action = action({ perm: "residentes.ver", schema: paso1Schema }, async ({ unidadId, ...input }, ctx) => {
  assertUnidadAccesible(ctx, unidadId);
  const persona = await miPersona(ctx);
  if (persona) {
    await actualizarPersona(ctx, persona.id, { ...input, numeroDocumento: input.numeroDocumento });
  } else {
    const dup = await ctx.db.persona.findFirst({ where: { tipoDocumento: input.tipoDocumento, numeroDocumento: input.numeroDocumento, anonimizada: false } });
    if (dup) throw new AppError("Ya hay una persona registrada con ese documento. Pide a la administración que la asocie a tu cuenta.", 400, { numeroDocumento: "Documento ya registrado" });
    const p = await ctx.db.persona.create({ data: { ...input, conjuntoId: ctx.conjuntoId, usuarioId: ctx.userId } });
    await audit(ctx, "crear", "Persona", p.id, undefined, p);
  }
  await marcarPaso(ctx, unidadId, 1);
  await borrarBorrador(ctx, claveBorrador(1, unidadId));
  return done(true);
});

// ── Paso 2: ocupación de la unidad (propietario) ──
const ocupacionSchema = z.object({
  unidadId: zs.id(),
  estadoOcupacion: z.enum(["PROPIETARIO_OCUPA", "ARRENDADA", "AIRBNB_O_SIMILAR", "DESOCUPADA", "EN_VENTA"]),
  plataformaRentaCorta: zs.optText(40),
  registroRnt: zs.optText(40),
});

export const guardarOcupacionAction = action({ perm: "residentes.editar", schema: ocupacionSchema }, async ({ unidadId, ...input }, ctx) => {
  assertUnidadAccesible(ctx, unidadId);
  await actualizarOcupacion(ctx, unidadId, input);
  await marcarPaso(ctx, unidadId, 2);
  await borrarBorrador(ctx, claveBorrador(2, unidadId));
  return done(true);
});

// ── Paso 9: política de datos ──
const politicaSchema = z.object({ unidadId: zs.optId(), acepto: zs.bool(), directorioOptIn: zs.bool().optional(), directorioCampos: zs.list().optional() });

export const aceptarPoliticaPasoAction = action({ perm: "residentes.ver", schema: politicaSchema }, async ({ unidadId, acepto, directorioOptIn, directorioCampos }, ctx) => {
  if (!acepto) throw new AppError("Debes aceptar la política de tratamiento de datos.", 400, { acepto: "Obligatorio" });
  const campos = (directorioCampos ?? []).filter((c) => ["nombre", "unidad", "telefono", "whatsapp", "servicios"].includes(c));
  await aceptarPolitica(ctx, { directorioOptIn: directorioOptIn ?? false, directorioCampos: campos });
  if (unidadId) {
    assertUnidadAccesible(ctx, unidadId);
    await marcarPaso(ctx, unidadId, 9);
  }
  revalidatePath("/perfil", "layout");
  return done(true);
});

// ── Invitaciones ──
const invitarSchema = z.object({
  email: zs.email(),
  nombre: zs.optText(120),
  telefono: zs.optText(30),
  unidadId: zs.id(),
  personaId: zs.optId(),
  tipoVinculo: z.enum(["FAMILIAR", "RESIDENTE", "ARRENDATARIO", "COPROPIETARIO"]),
  acceso: z.enum(["RESIDENTE", "CONVIVIENTE"]).optional(),
});

export const invitarAction = action({ perm: "residentes.invitar", schema: invitarSchema }, async (input, ctx) => {
  assertUnidadAccesible(ctx, input.unidadId);
  const propietario = gestionaResidentes(ctx) || esPropietarioDe(ctx, input.unidadId);
  if ((input.tipoVinculo === "ARRENDATARIO" || input.tipoVinculo === "COPROPIETARIO") && !propietario) {
    throw new AppError("Solo el propietario puede invitar arrendatarios o copropietarios.", 403);
  }
  const rolClave = input.tipoVinculo === "ARRENDATARIO" ? "RESIDENTE" : input.tipoVinculo === "COPROPIETARIO" ? "PROPIETARIO" : (input.acceso ?? "CONVIVIENTE");
  const r = await invitarUsuario(ctx, { email: input.email, nombre: input.nombre, telefono: input.telefono, unidadId: input.unidadId, personaId: input.personaId, tipoVinculo: input.tipoVinculo, rolClave });
  revalidatePath("/residentes", "layout");
  return done({ link: r.link, whatsapp: r.whatsapp });
});
