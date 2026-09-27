import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { defaultPermsFor } from "@/lib/permisos";
import {
  crearVinculo,
  finalizarVinculo,
  guardarVehiculo,
  indicadoresPoblacion,
  listarPersonas,
  obtenerPersona,
  registrarPersona,
  resolverVinculo,
  retirarPersona,
  vinculosDeUnidad,
} from "@/lib/residentes/service";
import { exportarMisDatos, solicitarSupresion } from "@/lib/perfil/service";
import { makeConjunto, makeUnidades } from "../helpers/db";

/** Contexto de un residente (propietario o arrendatario) con alcance limitado a sus unidades. */
async function ctxResidente(admin: Ctx, rol: "PROPIETARIO" | "RESIDENTE", unidadId: string, opts: { propia: boolean }) {
  const email = `res-${Math.random().toString(36).slice(2, 8)}@prueba.co`;
  const usuario = await prisma.usuario.create({ data: { email, nombre: "Residente Prueba" } });
  const persona = await prisma.persona.create({ data: { conjuntoId: admin.conjuntoId, usuarioId: usuario.id, numeroDocumento: String(Date.now()).slice(-9), nombres: "Residente", apellidos: "Prueba", telefono: "3001112233" } });
  await prisma.vinculoUnidad.create({ data: { conjuntoId: admin.conjuntoId, personaId: persona.id, unidadId, tipo: opts.propia ? "PROPIETARIO" : "ARRENDATARIO", principal: true } });
  const ctx: Ctx = {
    ...admin,
    userId: usuario.id,
    nombre: usuario.nombre,
    email,
    esSuperAdmin: false,
    rolClave: rol,
    rolBase: rol,
    rolNombre: rol,
    permisos: new Set(defaultPermsFor(rol)),
    unidadIds: [unidadId],
    unidadesPropias: opts.propia ? [unidadId] : [],
    personaIds: [persona.id],
  };
  return { ctx, usuario, persona };
}

const base = (doc: string, nombres = "Ana") => ({ tipoDocumento: "CC" as const, numeroDocumento: doc, nombres, apellidos: "Prueba", telefono: "3009998877", email: `${nombres.toLowerCase()}@correo.co` });

describe("residentes: aislamiento, aprobaciones y anonimización", () => {
  afterAll(() => prisma.$disconnect());

  it("un residente no puede leer ni gestionar personas de otra unidad", async () => {
    const { ctx: admin } = await makeConjunto("Res A");
    const [u1, u2] = await makeUnidades(admin.conjuntoId, 2);
    const vecino = await registrarPersona(admin, base("900001", "Vecino"), { unidadId: u2.id, tipo: "PROPIETARIO" });
    const { ctx: laura } = await ctxResidente(admin, "PROPIETARIO", u1.id, { propia: true });
    const hijo = await registrarPersona(laura, { ...base("900002", "Hijo"), fechaNacimiento: new Date(2016, 0, 1) }, { unidadId: u1.id, tipo: "FAMILIAR" });
    expect(hijo.vinculo.estado).toBe("ACTIVO");

    // Lecturas: solo su unidad
    await expect(obtenerPersona(laura, vecino.persona.id)).rejects.toThrow(/no existe/);
    await expect(vinculosDeUnidad(laura, u2.id)).rejects.toThrow(/tus unidades/);
    const { rows } = await listarPersonas(laura, {}, { skip: 0, take: 100 });
    expect(rows.map((r) => r.id)).not.toContain(vecino.persona.id);
    expect(rows.map((r) => r.id)).toContain(hijo.persona.id);
    // Aunque filtre por la otra unidad, no ve nada ajeno
    const filtrado = await listarPersonas(laura, { unidad: u2.id }, { skip: 0, take: 100 });
    expect(filtrado.rows.map((r) => r.id)).not.toContain(vecino.persona.id);

    // Escrituras en la otra unidad
    await expect(registrarPersona(laura, base("900003"), { unidadId: u2.id, tipo: "FAMILIAR" })).rejects.toThrow(/tus unidades/);
    await expect(guardarVehiculo(laura, { unidadId: u2.id, placa: "ABC123", tipo: "CARRO" })).rejects.toThrow(/tus unidades/);
    await expect(crearVinculo(laura, vecino.persona.id, { unidadId: u2.id, tipo: "FAMILIAR" })).rejects.toThrow(/tus unidades/);
    const vVecino = await prisma.vinculoUnidad.findFirstOrThrow({ where: { personaId: vecino.persona.id } });
    await expect(finalizarVinculo(laura, vVecino.id)).rejects.toThrow(/no existe|tus unidades/);
  });

  it("el arrendatario registrado por el propietario queda pendiente y el admin lo aprueba", async () => {
    const { ctx: admin } = await makeConjunto("Res B");
    const [u1] = await makeUnidades(admin.conjuntoId, 1);
    const { ctx: dueno } = await ctxResidente(admin, "PROPIETARIO", u1.id, { propia: true });
    const r = await registrarPersona(dueno, base("910001", "Inquilino"), { unidadId: u1.id, tipo: "ARRENDATARIO" });
    expect(r.vinculo.estado).toBe("PENDIENTE_APROBACION");

    // Un arrendatario no puede registrar otro arrendatario ni propietarios
    const { ctx: inquilino } = await ctxResidente(admin, "RESIDENTE", u1.id, { propia: false });
    await expect(registrarPersona(inquilino, base("910002"), { unidadId: u1.id, tipo: "ARRENDATARIO" })).rejects.toThrow(/Solo el propietario/);
    await expect(registrarPersona(dueno, base("910003"), { unidadId: u1.id, tipo: "PROPIETARIO" })).rejects.toThrow(/administración/);

    await resolverVinculo(admin, r.vinculo.id, true);
    const v = await prisma.vinculoUnidad.findUniqueOrThrow({ where: { id: r.vinculo.id } });
    expect(v.estado).toBe("ACTIVO");
    const u = await prisma.unidad.findUniqueOrThrow({ where: { id: u1.id } });
    expect(u.estadoOcupacion).toBe("ARRENDADA");
    await expect(resolverVinculo(admin, r.vinculo.id, true)).rejects.toThrow(/ya fue resuelto/);
  });

  it("placa única por conjunto, normalizada", async () => {
    const { ctx: admin } = await makeConjunto("Res C");
    const [u1, u2] = await makeUnidades(admin.conjuntoId, 2);
    const v = await guardarVehiculo(admin, { unidadId: u1.id, placa: "jkl 482", tipo: "CARRO" });
    expect(v.placa).toBe("JKL482");
    await expect(guardarVehiculo(admin, { unidadId: u2.id, placa: "JKL-482", tipo: "CARRO" })).rejects.toThrow(/ya está registrada/);
    await expect(guardarVehiculo(admin, { unidadId: u2.id, placa: "12", tipo: "CARRO" })).rejects.toThrow(/formato/);
  });

  it("retirar a una persona anonimiza sus datos y finaliza sus vínculos", async () => {
    const { ctx: admin } = await makeConjunto("Res D");
    const [u1] = await makeUnidades(admin.conjuntoId, 1);
    const r = await registrarPersona(admin, { ...base("920001", "Marta"), movilidadReducida: true, tipoSangre: "O+" }, { unidadId: u1.id, tipo: "FAMILIAR" });
    let u = await prisma.unidad.findUniqueOrThrow({ where: { id: u1.id } });
    expect(u.tienePersonaMovilidadReducida).toBe(true);

    await retirarPersona(admin, r.persona.id, "Se mudó");
    const p = await prisma.persona.findUniqueOrThrow({ where: { id: r.persona.id }, include: { vinculos: true } });
    expect(p.nombres).toBe("Titular retirado");
    expect(p.numeroDocumento).toMatch(/^ANON-/);
    expect(p.telefono).toBeNull();
    expect(p.email).toBeNull();
    expect(p.tipoSangre).toBeNull();
    expect(p.anonimizada).toBe(true);
    expect(p.vinculos.every((v) => v.estado === "INACTIVO" && v.fechaFin)).toBe(true);
    u = await prisma.unidad.findUniqueOrThrow({ where: { id: u1.id } });
    expect(u.tienePersonaMovilidadReducida).toBe(false);

    // El mismo documento puede volver a registrarse como persona nueva
    const otra = await registrarPersona(admin, base("920001", "Marta"), { unidadId: u1.id, tipo: "FAMILIAR" });
    expect(otra.persona.id).not.toBe(r.persona.id);
    expect(otra.reutilizada).toBe(false);
  });

  it("el titular exporta sus datos y puede solicitar la supresión", async () => {
    const { ctx: admin } = await makeConjunto("Res E");
    const [u1] = await makeUnidades(admin.conjuntoId, 1);
    const { ctx: inquilino, persona } = await ctxResidente(admin, "RESIDENTE", u1.id, { propia: false });
    const datos = await exportarMisDatos(inquilino);
    expect(datos.personas[0].numeroDocumento).toBe(persona.numeroDocumento);
    expect(JSON.stringify(datos)).not.toMatch(/passwordHash|mfaSecret/);

    await expect(solicitarSupresion(inquilino, { cerrarCuenta: false, confirmacion: "no" })).rejects.toThrow(/SUPRIMIR/);
    await solicitarSupresion(inquilino, { cerrarCuenta: false, confirmacion: "suprimir" });
    const p = await prisma.persona.findUniqueOrThrow({ where: { id: persona.id }, include: { vinculos: true } });
    expect(p.anonimizada).toBe(true);
    expect(p.nombres).toBe("Titular retirado");
    expect(p.vinculos.every((v) => v.estado === "INACTIVO")).toBe(true); // arrendatario: no es vínculo de propiedad
  });

  it("indicadores cuentan menores y adultos mayores activos", async () => {
    const { ctx: admin } = await makeConjunto("Res F");
    const [u1] = await makeUnidades(admin.conjuntoId, 1);
    const hoy = new Date();
    await registrarPersona(admin, { ...base("930001", "Nino"), fechaNacimiento: new Date(hoy.getFullYear() - 8, 0, 1) }, { unidadId: u1.id, tipo: "FAMILIAR" });
    await registrarPersona(admin, { ...base("930002", "Abuela"), fechaNacimiento: new Date(hoy.getFullYear() - 75, 0, 1), movilidadReducida: true }, { unidadId: u1.id, tipo: "FAMILIAR" });
    await registrarPersona(admin, { ...base("930003", "Rosa"), fechaNacimiento: new Date(hoy.getFullYear() - 40, 0, 1) }, { unidadId: u1.id, tipo: "EMPLEADO_DOMESTICO", horario: { dias: [1, 2], desde: "08:00", hasta: "12:00" } });
    const ind = await indicadoresPoblacion(admin);
    expect(ind.totalPersonas).toBe(2); // el empleado no habita la unidad
    expect(ind.menores).toBe(1);
    expect(ind.adultosMayores).toBe(1);
    expect(ind.movilidadReducida).toBe(1);
    const emp = await prisma.vinculoUnidad.findFirstOrThrow({ where: { unidadId: u1.id, tipo: "EMPLEADO_DOMESTICO" } });
    expect(emp.horarioPermitido).toEqual({ dias: [1, 2], desde: "08:00", hasta: "12:00" });
  });
});
