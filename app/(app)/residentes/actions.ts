"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { zs } from "@/lib/validation";
import {
  actualizarPersona,
  actualizarVinculo,
  crearVinculo,
  eliminarMascota,
  eliminarVehiculo,
  finalizarVinculo,
  gestionaResidentes,
  guardarMascota,
  guardarVehiculo,
  registrarPersona,
  resolverVinculo,
  retirarPersona,
} from "@/lib/residentes/service";

const TIPOS_DOC = ["CC", "CE", "TI", "RC", "PA", "NIT", "PEP", "PPT"] as const;
const TIPOS_VINCULO = [
  "PROPIETARIO",
  "COPROPIETARIO",
  "ARRENDATARIO",
  "RESIDENTE",
  "FAMILIAR",
  "EMPLEADO_DOMESTICO",
  "CUIDADOR",
  "VISITANTE_FRECUENTE",
  "AUTORIZADO_RECOGER_PAQUETES",
  "AUTORIZADO_MENORES",
] as const;

const done = <T>(r: T) => {
  revalidatePath("/residentes", "layout");
  revalidatePath("/mi-hogar", "layout");
  return r;
};

const horarioSchema = z.object({ dias: zs.list().optional(), desde: zs.optText(5), hasta: zs.optText(5) }).optional();

const personaCampos = {
  tipoDocumento: z.enum(TIPOS_DOC),
  numeroDocumento: zs.text(3, 20),
  nombres: zs.text(1, 80),
  apellidos: zs.text(1, 80),
  fechaNacimiento: zs.optDate(),
  genero: zs.optText(30),
  fotoUrl: zs.optText(400),
  telefono: zs.optText(30),
  email: zs.optEmail(),
  eps: zs.optText(80),
  contactoEmergenciaNombre: zs.optText(120),
  contactoEmergenciaTelefono: zs.optText(30),
  ocupacion: zs.optText(80),
  movilidadReducida: zs.bool().optional(),
  movilidadDescripcion: zs.optText(500),
  requiereAsistenciaEvacuacion: zs.bool().optional(),
  tipoSangre: zs.optText(5),
  observaciones: zs.optText(1000),
};

const vinculoCampos = {
  unidadId: zs.id(),
  tipo: z.enum(TIPOS_VINCULO),
  principal: zs.bool().optional(),
  porcentajePropiedad: zs.optNumber(),
  horario: horarioSchema,
  puedeVerCuenta: zs.bool().optional(),
  fechaInicio: zs.optDate(),
  fechaFin: zs.optDate(),
};

const registrarSchema = z.object({ ...personaCampos, ...vinculoCampos });

export const registrarPersonaAction = action({ perm: "residentes.crear", schema: registrarSchema }, async (input, ctx) => {
  const { unidadId, tipo, principal, porcentajePropiedad, horario, puedeVerCuenta, fechaInicio, fechaFin, ...persona } = input;
  const r = await registrarPersona(ctx, persona, { unidadId, tipo, principal, porcentajePropiedad, horario, puedeVerCuenta, fechaInicio, fechaFin });
  return done({ id: r.persona.id, vinculoId: r.vinculo.id, pendiente: r.vinculo.estado === "PENDIENTE_APROBACION", reutilizada: r.reutilizada });
});

const actualizarSchema = z.object({ id: zs.id(), ...personaCampos });

export const actualizarPersonaAction = action({ perm: "residentes.editar", schema: actualizarSchema }, async ({ id, ...input }, ctx) => {
  await actualizarPersona(ctx, id, input);
  return done({ id });
});

const emergenciaSchema = z.object({
  id: zs.id(),
  movilidadReducida: zs.bool(),
  movilidadDescripcion: zs.optText(500),
  requiereAsistenciaEvacuacion: zs.bool(),
  tipoSangre: zs.optText(5),
  eps: zs.optText(80),
  contactoEmergenciaNombre: zs.optText(120),
  contactoEmergenciaTelefono: zs.optText(30),
});

/** Información de emergencia de una persona (paso 7 del panel y ficha del administrador). */
export const guardarEmergenciaPersonaAction = action({ perm: "residentes.editar", schema: emergenciaSchema }, async ({ id, ...input }, ctx) => {
  await actualizarPersona(ctx, id, input);
  return done({ id });
});

const crearVinculoSchema = z.object({ personaId: zs.id(), ...vinculoCampos });

export const crearVinculoAction = action({ perm: "residentes.crear", schema: crearVinculoSchema }, async ({ personaId, ...input }, ctx) => {
  const v = await crearVinculo(ctx, personaId, input);
  return done({ id: v.id, pendiente: v.estado === "PENDIENTE_APROBACION" });
});

const actualizarVinculoSchema = z.object({
  id: zs.id(),
  tipo: z.enum(TIPOS_VINCULO).optional(),
  principal: zs.bool().optional(),
  porcentajePropiedad: zs.optNumber(),
  horario: horarioSchema,
  puedeVerCuenta: zs.bool().optional(),
  fechaFin: zs.optDate(),
});

export const actualizarVinculoAction = action({ perm: "residentes.editar", schema: actualizarVinculoSchema }, async ({ id, ...input }, ctx) => {
  await actualizarVinculo(ctx, id, input);
  return done({ id });
});

export const finalizarVinculoAction = action({ perm: ["residentes.editar", "residentes.eliminar"], schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await finalizarVinculo(ctx, id)));

export const resolverVinculoAction = action(
  { perm: "residentes.aprobar", schema: z.object({ id: zs.id(), aprobar: zs.bool(), motivo: zs.optText(300) }) },
  async ({ id, aprobar, motivo }, ctx) => {
    await resolverVinculo(ctx, id, aprobar, motivo);
    return done(true);
  },
);

export const retirarPersonaAction = action({ perm: "residentes.eliminar", schema: z.object({ id: zs.id(), motivo: zs.optText(300) }) }, async ({ id, motivo }, ctx) => {
  if (!gestionaResidentes(ctx)) throw new AppError("Solo la administración puede retirar personas del conjunto.", 403);
  return done(await retirarPersona(ctx, id, motivo));
});

// ── Vehículos ──
const vehiculoSchema = z.object({
  id: zs.optId(),
  unidadId: zs.id(),
  placa: zs.text(2, 12),
  tipo: z.enum(["CARRO", "MOTO", "BICICLETA", "OTRO"]),
  marca: zs.optText(40),
  modelo: zs.optText(20),
  color: zs.optText(30),
  fotoUrl: zs.optText(400),
  tarjetaPropiedadUrl: zs.optText(400),
  soatVence: zs.optDate(),
  tecnomecanicaVence: zs.optDate(),
  parqueaderoId: zs.optId(),
});

export const guardarVehiculoAction = action({ perm: ["vehiculos.crear", "vehiculos.editar"], schema: vehiculoSchema }, async (input, ctx) => {
  const v = await guardarVehiculo(ctx, input);
  return done({ id: v.id, placa: v.placa });
});

export const eliminarVehiculoAction = action({ perm: "vehiculos.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarVehiculo(ctx, id)));

// ── Mascotas ──
const mascotaSchema = z.object({
  id: zs.optId(),
  unidadId: zs.id(),
  nombre: zs.text(1, 40),
  especie: zs.text(1, 30),
  raza: zs.optText(40),
  color: zs.optText(30),
  fotoUrl: zs.optText(400),
  carneVacunasUrl: zs.optText(400),
  antirrabicaVence: zs.optDate(),
  potencialmentePeligrosa: zs.bool(),
  polizaUrl: zs.optText(400),
  microchip: zs.optText(30),
});

export const guardarMascotaAction = action({ perm: ["vehiculos.crear", "vehiculos.editar"], schema: mascotaSchema }, async (input, ctx) => {
  const m = await guardarMascota(ctx, input);
  return done({ id: m.id });
});

export const eliminarMascotaAction = action({ perm: "vehiculos.eliminar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarMascota(ctx, id)));
