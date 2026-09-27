import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TipoVinculo } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { crearCargo } from "@/lib/cartera/core";
import { contarDestinatarios, resolverDestinatariosCorreo, resolverUnidades, resolverUsuarios, usuarioEnSegmento, guardarSegmento, definicionEfectiva, eliminarSegmento } from "@/lib/segmentos";
import { makeConjunto } from "../helpers/db";

/**
 * Motor de segmentación: cada filtro por separado y combinados.
 * Escenario: Torre A (pisos 1-3) y Torre B (piso 1) + 1 casa.
 */
let ctx: Ctx;
const U: Record<string, string> = {};
const usuarios: Record<string, string> = {};
let seq = 0;

async function unidad(torreId: string | null, codigo: string, piso: number | null, extra: object = {}) {
  const u = await prisma.unidad.create({ data: { conjuntoId: ctx.conjuntoId, torreId, codigo, piso, coeficiente: 0.1, cuotaAdministracion: 200000, ...extra } });
  U[codigo] = u.id;
  return u;
}

async function persona(codigo: string, tipo: TipoVinculo, opts: { nacimiento?: Date; movilidad?: boolean; email?: string | null; conCuenta?: string; rol?: string } = {}) {
  seq++;
  let usuarioId: string | undefined;
  if (opts.conCuenta) {
    const u = await prisma.usuario.create({ data: { email: `${opts.conCuenta}-${Math.random().toString(36).slice(2, 7)}@seg.co`, nombre: opts.conCuenta } });
    const rol = await prisma.rol.findFirstOrThrow({ where: { conjuntoId: ctx.conjuntoId, clave: opts.rol ?? "PROPIETARIO" } });
    await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId: ctx.conjuntoId, rolId: rol.id } });
    usuarioId = u.id;
    usuarios[opts.conCuenta] = u.id;
  }
  const p = await prisma.persona.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      numeroDocumento: `SEG${seq}${Date.now() % 100000}`,
      nombres: `Persona${seq}`,
      apellidos: codigo,
      fechaNacimiento: opts.nacimiento ?? new Date(1985, 5, 1),
      movilidadReducida: !!opts.movilidad,
      email: opts.email === undefined ? `p${seq}-${codigo.toLowerCase()}@seg.co` : opts.email,
      usuarioId,
    },
  });
  await prisma.vinculoUnidad.create({ data: { conjuntoId: ctx.conjuntoId, personaId: p.id, unidadId: U[codigo], tipo, principal: tipo === "PROPIETARIO" } });
  return p;
}

const ids = (codigos: string[]) => codigos.map((c) => U[c]).sort();
const sorted = (a: string[]) => [...a].sort();

describe("motor de segmentación", () => {
  let torreA: string;
  let torreB: string;

  beforeAll(async () => {
    ({ ctx } = await makeConjunto("Segmentos"));
    torreA = (await prisma.torre.create({ data: { conjuntoId: ctx.conjuntoId, nombre: "Torre A", pisos: 3 } })).id;
    torreB = (await prisma.torre.create({ data: { conjuntoId: ctx.conjuntoId, nombre: "Torre B", pisos: 1 } })).id;
    await unidad(torreA, "A-101", 1, { estadoOcupacion: "PROPIETARIO_OCUPA" });
    await unidad(torreA, "A-201", 2, { estadoOcupacion: "ARRENDADA" });
    await unidad(torreA, "A-301", 3, { estadoOcupacion: "DESOCUPADA" });
    await unidad(torreB, "B-101", 1, { estadoOcupacion: "PROPIETARIO_OCUPA", tienePersonaMovilidadReducida: true });
    await unidad(null, "Casa 7", null, { tipo: "CASA" });

    await persona("A-101", "PROPIETARIO", { conCuenta: "ana" });
    await persona("A-101", "FAMILIAR", { nacimiento: new Date(new Date().getFullYear() - 8, 0, 1) }); // menor
    await persona("A-201", "PROPIETARIO", { conCuenta: "beto" });
    await persona("A-201", "ARRENDATARIO", { conCuenta: "carla", rol: "RESIDENTE" });
    await persona("A-201", "EMPLEADO_DOMESTICO", { nacimiento: new Date(1950, 0, 1) }); // mayor pero empleado: no cuenta
    await persona("B-101", "PROPIETARIO", { nacimiento: new Date(1950, 3, 3), conCuenta: "dora" }); // adulto mayor
    await persona("Casa 7", "PROPIETARIO", { email: null }); // sin correo
    await persona("Casa 7", "FAMILIAR", { movilidad: true, conCuenta: "eva" });

    await prisma.mascota.create({ data: { conjuntoId: ctx.conjuntoId, unidadId: U["A-201"], nombre: "Max", especie: "Perro" } });
    await prisma.vehiculo.create({ data: { conjuntoId: ctx.conjuntoId, unidadId: U["B-101"], placa: `SEG${Date.now() % 1000}` } });

    // Mora: A-101 debe una cuota vencida hace 40 días; B-101 tiene una cuota no vencida.
    await crearCargo(ctx, { unidadId: U["A-101"], conceptoTipo: "ADMINISTRACION", valorBase: 200000, fechaVencimiento: new Date(Date.now() - 40 * 86400000), origen: "MANUAL" });
    await crearCargo(ctx, { unidadId: U["B-101"], conceptoTipo: "ADMINISTRACION", valorBase: 200000, fechaVencimiento: new Date(Date.now() + 10 * 86400000), origen: "MANUAL" });

    // Personal sin unidad
    await prisma.usuario.create({ data: { email: `porteria-${Date.now()}@seg.co`, nombre: "portero" } }).then(async (u) => {
      const rol = await prisma.rol.findFirstOrThrow({ where: { conjuntoId: ctx.conjuntoId, clave: "PORTERIA" } });
      await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId: ctx.conjuntoId, rolId: rol.id } });
      usuarios.portero = u.id;
    });
  });

  afterAll(() => prisma.$disconnect());

  it("definición vacía = todas las unidades y todos los usuarios", async () => {
    expect(sorted(await resolverUnidades(ctx, {}))).toEqual(ids(["A-101", "A-201", "A-301", "B-101", "Casa 7"]));
    expect(sorted(await resolverUsuarios(ctx, {}))).toEqual(sorted(Object.values(usuarios)));
  });

  it("torres (con y sin casas)", async () => {
    expect(sorted(await resolverUnidades(ctx, { torres: [torreA] }))).toEqual(ids(["A-101", "A-201", "A-301"]));
    expect(sorted(await resolverUnidades(ctx, { torres: [torreB], incluirSinTorre: true }))).toEqual(ids(["B-101", "Casa 7"]));
  });

  it("rango de pisos", async () => {
    expect(sorted(await resolverUnidades(ctx, { pisoMin: 2 }))).toEqual(ids(["A-201", "A-301"]));
    expect(sorted(await resolverUnidades(ctx, { pisoMin: 1, pisoMax: 1 }))).toEqual(ids(["A-101", "B-101"]));
  });

  it("rango de números de unidad y unidades específicas", async () => {
    expect(sorted(await resolverUnidades(ctx, { numeroDesde: 150, numeroHasta: 301 }))).toEqual(ids(["A-201", "A-301"]));
    expect(sorted(await resolverUnidades(ctx, { numeroHasta: 10 }))).toEqual(ids(["Casa 7"]));
    expect(sorted(await resolverUnidades(ctx, { unidades: [U["A-301"], U["Casa 7"]] }))).toEqual(ids(["A-301", "Casa 7"]));
  });

  it("tipo de ocupación y tipo de unidad", async () => {
    expect(sorted(await resolverUnidades(ctx, { ocupacion: ["ARRENDADA", "DESOCUPADA"] }))).toEqual(ids(["A-201", "A-301"]));
    expect(sorted(await resolverUnidades(ctx, { tiposUnidad: ["CASA"] }))).toEqual(ids(["Casa 7"]));
  });

  it("estado de cartera: en mora / al día", async () => {
    expect(await resolverUnidades(ctx, { cartera: "EN_MORA" })).toEqual([U["A-101"]]);
    expect(sorted(await resolverUnidades(ctx, { cartera: "AL_DIA" }))).toEqual(ids(["A-201", "A-301", "B-101", "Casa 7"]));
  });

  it("con mascotas y con vehículos", async () => {
    expect(await resolverUnidades(ctx, { conMascotas: true })).toEqual([U["A-201"]]);
    expect(await resolverUnidades(ctx, { conVehiculos: true })).toEqual([U["B-101"]]);
  });

  it("con menores, adultos mayores (≥60, sin contar empleados) y movilidad reducida", async () => {
    expect(await resolverUnidades(ctx, { conMenores: true })).toEqual([U["A-101"]]);
    expect(await resolverUnidades(ctx, { adultosMayores: true })).toEqual([U["B-101"]]);
    expect(sorted(await resolverUnidades(ctx, { movilidadReducida: true }))).toEqual(ids(["B-101", "Casa 7"]));
  });

  it("tipo de vínculo: filtra unidades y destinatarios", async () => {
    expect(await resolverUnidades(ctx, { vinculos: ["ARRENDATARIO"] })).toEqual([U["A-201"]]);
    expect(await resolverUsuarios(ctx, { vinculos: ["ARRENDATARIO"] })).toEqual([usuarios.carla]);
    expect(sorted(await resolverUsuarios(ctx, { torres: [torreA], vinculos: ["PROPIETARIO"] }))).toEqual(sorted([usuarios.ana, usuarios.beto]));
  });

  it("rol: solo roles incluye personal sin unidad; con filtros de unidad se intersecta", async () => {
    expect(await resolverUsuarios(ctx, { roles: ["PORTERIA"] })).toEqual([usuarios.portero]);
    expect(await resolverUsuarios(ctx, { roles: ["RESIDENTE"], torres: [torreA] })).toEqual([usuarios.carla]);
    expect(await resolverUsuarios(ctx, { roles: ["PORTERIA"], torres: [torreA] })).toEqual([]);
  });

  it("filtros combinados con Y", async () => {
    expect(await resolverUnidades(ctx, { torres: [torreA], pisoMax: 2, conMascotas: true })).toEqual([U["A-201"]]);
    expect(await resolverUnidades(ctx, { torres: [torreA], cartera: "EN_MORA", conMenores: true })).toEqual([U["A-101"]]);
    expect(await resolverUnidades(ctx, { torres: [torreB], conMascotas: true })).toEqual([]);
  });

  it("destinatarios de correo: usuarios con cuenta + personas con email, sin duplicados, marca acceso financiero", async () => {
    const d = await resolverDestinatariosCorreo(ctx, { torres: [torreA] });
    // A-101: ana + familiar menor (con correo); A-201: beto, carla (empleado no es destinatario por defecto)
    expect(d).toHaveLength(4);
    const carla = d.find((x) => x.usuarioId === usuarios.carla)!;
    expect(carla.unidades).toEqual(["A-201"]);
    expect(carla.unidadesFinancieras).toEqual([]); // arrendataria: no ve saldo
    const beto = d.find((x) => x.usuarioId === usuarios.beto)!;
    expect(beto.unidadesFinancieras).toEqual([U["A-201"]]);
    // Casa 7: el propietario no tiene correo → solo eva
    const casa = await resolverDestinatariosCorreo(ctx, { unidades: [U["Casa 7"]] });
    expect(casa.map((x) => x.usuarioId)).toEqual([usuarios.eva]);
  });

  it("conteo en vivo y pertenencia de un usuario", async () => {
    const c = await contarDestinatarios(ctx, { torres: [torreA] });
    expect(c).toEqual({ unidades: 3, usuarios: 3, correos: 4 });
    const soloRoles = await contarDestinatarios(ctx, { roles: ["PORTERIA"] });
    expect(soloRoles.unidades).toBeNull();
    expect(await usuarioEnSegmento(ctx, { torres: [torreA] }, usuarios.ana)).toBe(true);
    expect(await usuarioEnSegmento(ctx, { torres: [torreB] }, usuarios.ana)).toBe(false);
    expect(await usuarioEnSegmento(ctx, { cartera: "EN_MORA" }, usuarios.dora)).toBe(false);
    expect(await usuarioEnSegmento(ctx, {}, usuarios.portero)).toBe(true);
  });

  it("segmentos guardados: CRUD y definición efectiva", async () => {
    const s = await guardarSegmento(ctx, { nombre: "Torre A en mora", definicion: { torres: [torreA], cartera: "EN_MORA", unidades: [] } });
    expect(s.definicion).toEqual({ torres: [torreA], cartera: "EN_MORA" });
    await expect(guardarSegmento(ctx, { nombre: "torre a EN MORA", definicion: {} })).rejects.toThrow(/Ya existe/);
    expect(await definicionEfectiva(ctx, { segmentoId: s.id })).toEqual({ torres: [torreA], cartera: "EN_MORA" });
    await eliminarSegmento(ctx, s.id);
    await expect(definicionEfectiva(ctx, { segmentoId: s.id })).rejects.toThrow(/no existe/);
  });
});
