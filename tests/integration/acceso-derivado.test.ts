import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { buildCtx } from "@/lib/auth/build-ctx";
import { aceptarInvitacion } from "@/lib/usuarios/service";
import { finalizarVinculo, resolverVinculo } from "@/lib/residentes/service";
import { cuentasAccesibles } from "@/lib/pagos/acceso";
import { editarCapacidades, invitarMiembro, panelAccesos, pausarAcceso, quitarAcceso } from "@/lib/hogar/service";
import { makeConjunto, makeUnidades } from "../helpers/db";

const tag = () => Math.random().toString(36).slice(2, 9);

/** Titular real (usuario + membresía + persona + vínculo) y su contexto construido con `buildCtx`. */
async function titular(conjuntoId: string, rolId: string, unidadId: string, tipo: "PROPIETARIO" | "ARRENDATARIO") {
  const t = tag();
  const u = await prisma.usuario.create({ data: { email: `tit-${t}@prueba.co`, nombre: `Titular ${t}` } });
  await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId, rolId } });
  const p = await prisma.persona.create({ data: { conjuntoId, usuarioId: u.id, numeroDocumento: `T${t}`, nombres: "Titular", apellidos: t } });
  const v = await prisma.vinculoUnidad.create({ data: { conjuntoId, personaId: p.id, unidadId, tipo, principal: true } });
  const ctx = (await buildCtx(u.id, conjuntoId))!;
  return { ctx, vinculo: v, usuario: u };
}

/** Invita y acepta; devuelve el usuario creado y su vínculo. */
async function invitarYAceptar(ctx: Ctx, unidadId: string, tipoVinculo: "FAMILIAR" | "EMPLEADO_DOMESTICO" | "ARRENDATARIO", capacidades: string[]) {
  const email = `m-${tag()}@prueba.co`;
  const r = await invitarMiembro(ctx, { unidadId, email, nombre: "Miembro Prueba", tipoVinculo, capacidades });
  const token = r.link.split("/invitacion/")[1];
  const a = await aceptarInvitacion(token, { nombre: "Miembro Prueba", password: "Clave1234", aceptaPolitica: true, politicaVersion: "1.0" });
  const vinculo = await prisma.vinculoUnidad.findFirstOrThrow({ where: { unidadId, persona: { usuarioId: a.usuarioId } } });
  return { usuarioId: a.usuarioId, vinculo, email };
}

describe("acceso derivado del titular", () => {
  afterAll(() => prisma.$disconnect());

  it("invitar → aceptar crea un vínculo derivado con capacidades, y buildCtx restringe los permisos", async () => {
    const { conjunto, roles } = await makeConjunto("Acc A");
    const [u1] = await makeUnidades(conjunto.id, 1);
    const { ctx: laura, vinculo: vTit } = await titular(conjunto.id, roles.PROPIETARIO, u1.id, "PROPIETARIO");

    const rosa = await invitarYAceptar(laura, u1.id, "EMPLEADO_DOMESTICO", ["visitantes", "paquetes"]);
    expect(rosa.vinculo.derivadoDeId).toBe(vTit.id);
    expect(rosa.vinculo.capacidadesHogar).toEqual(["visitantes", "paquetes"]);
    expect(rosa.vinculo.puedeVerCuenta).toBe(false);
    expect(rosa.vinculo.tipo).toBe("EMPLEADO_DOMESTICO");
    expect(rosa.vinculo.estado).toBe("ACTIVO");

    const ctx = (await buildCtx(rosa.usuarioId, conjunto.id))!;
    expect(ctx.accesoDerivado).toBe(true);
    expect(ctx.unidadIds).toEqual([u1.id]);
    expect([...ctx.permisos].sort()).toEqual(["emergencias.panico", "emergencias.ver", "paqueteria.ver", "visitantes.autorizar"]);
    expect(ctx.permisos.has("reservas.crear")).toBe(false);
    expect(ctx.permisos.has("votaciones.votar")).toBe(false);

    // El titular sigue con todos los permisos de su rol
    const titCtx = (await buildCtx(laura.userId, conjunto.id))!;
    expect(titCtx.accesoDerivado).toBe(false);
    expect(titCtx.permisos.has("votaciones.votar")).toBe(true);

    // La capacidad "cuenta" mantiene sincronizado puedeVerCuenta y da acceso a la cuenta
    const camilo = await invitarYAceptar(laura, u1.id, "FAMILIAR", ["comunidad", "cuenta"]);
    expect(camilo.vinculo.puedeVerCuenta).toBe(true);
    const cCtx = (await buildCtx(camilo.usuarioId, conjunto.id))!;
    expect(cCtx.permisos.has("pagos.pagar")).toBe(true);
    expect((await cuentasAccesibles(cCtx)).map((c) => c.unidadId)).toEqual([u1.id]);

    const panel = await panelAccesos(laura, u1.id);
    expect(panel.miembros.map((m) => m.id).sort()).toEqual([rosa.vinculo.id, camilo.vinculo.id].sort());
    expect(panel.miembros.every((m) => m.puedeGestionar && m.otorgadoPor === "ti")).toBe(true);
  });

  it("pausar quita el acceso (unidad, permisos y cuenta) y reanudar lo devuelve", async () => {
    const { conjunto, roles } = await makeConjunto("Acc B");
    const [u1] = await makeUnidades(conjunto.id, 1);
    const { ctx: laura } = await titular(conjunto.id, roles.PROPIETARIO, u1.id, "PROPIETARIO");
    const m = await invitarYAceptar(laura, u1.id, "FAMILIAR", ["visitantes", "cuenta"]);

    await pausarAcceso(laura, { vinculoId: m.vinculo.id, pausar: true });
    const pausado = (await buildCtx(m.usuarioId, conjunto.id))!;
    expect(pausado.unidadIds).toEqual([]);
    expect(pausado.permisos.size).toBe(0);
    expect(await cuentasAccesibles(pausado)).toEqual([]);

    await pausarAcceso(laura, { vinculoId: m.vinculo.id, pausar: false });
    const activo = (await buildCtx(m.usuarioId, conjunto.id))!;
    expect(activo.unidadIds).toEqual([u1.id]);
    expect(activo.permisos.has("visitantes.autorizar")).toBe(true);

    // Quitar el acceso: vínculo inactivo, membresía suspendida, sesión revocada
    const antes = await prisma.usuario.findUniqueOrThrow({ where: { id: m.usuarioId } });
    await quitarAcceso(laura, { vinculoId: m.vinculo.id });
    expect((await prisma.vinculoUnidad.findUniqueOrThrow({ where: { id: m.vinculo.id } })).estado).toBe("INACTIVO");
    const mem = await prisma.membresiaConjunto.findFirstOrThrow({ where: { usuarioId: m.usuarioId, conjuntoId: conjunto.id } });
    expect(mem.estado).toBe("SUSPENDIDA");
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: m.usuarioId } })).sessionVersion).toBe(antes.sessionVersion + 1);
    expect(await buildCtx(m.usuarioId, conjunto.id)).toBeNull();
  });

  it("cuando el titular sale, sus accesos derivados terminan en cascada (y sus invitaciones se revocan)", async () => {
    const { conjunto, roles, ctx: admin } = await makeConjunto("Acc C");
    const [u1] = await makeUnidades(conjunto.id, 1);
    const { ctx: dueno, vinculo: vDueno } = await titular(conjunto.id, roles.PROPIETARIO, u1.id, "PROPIETARIO");

    // Propietario → arrendatario derivado (aprobado por la administración) → familia del arrendatario
    const arr = await invitarYAceptar(dueno, u1.id, "ARRENDATARIO", ["comunidad", "visitantes", "paquetes", "hogar"]);
    expect(arr.vinculo.estado).toBe("PENDIENTE_APROBACION");
    await resolverVinculo(admin, arr.vinculo.id, true);
    const arrCtx = (await buildCtx(arr.usuarioId, conjunto.id))!;
    const hijo = await invitarYAceptar(arrCtx, u1.id, "FAMILIAR", ["visitantes"]);
    expect(hijo.vinculo.derivadoDeId).toBe(arr.vinculo.id);
    await invitarMiembro(dueno, { unidadId: u1.id, email: `pend-${tag()}@prueba.co`, nombre: "Pendiente", tipoVinculo: "EMPLEADO_DOMESTICO", capacidades: ["paquetes"] });

    await finalizarVinculo(admin, vDueno.id);

    const estados = await prisma.vinculoUnidad.findMany({ where: { id: { in: [arr.vinculo.id, hijo.vinculo.id] } }, select: { estado: true } });
    expect(estados.map((e) => e.estado)).toEqual(["INACTIVO", "INACTIVO"]);
    expect(await prisma.invitacion.count({ where: { derivadoDeId: vDueno.id, estado: "PENDIENTE" } })).toBe(0);
    expect(await buildCtx(hijo.usuarioId, conjunto.id)).toBeNull();
    const avisos = await prisma.notificacion.count({ where: { usuarioId: { in: [arr.usuarioId, hijo.usuarioId] }, titulo: "Tu acceso al hogar terminó" } });
    expect(avisos).toBe(2);
    const auditoria = await prisma.auditoria.count({ where: { conjuntoId: conjunto.id, accion: "terminar_acceso_derivado" } });
    expect(auditoria).toBe(2);
  });

  it("nadie otorga más de lo que tiene quien da el acceso, y un miembro derivado no gestiona accesos", async () => {
    const { conjunto, roles, ctx: admin } = await makeConjunto("Acc D");
    const [u1, u2] = await makeUnidades(conjunto.id, 2);

    // Arrendatario titular (no derivado) sin autorización de cuenta: no puede dar "cuenta"
    const { ctx: inquilino } = await titular(conjunto.id, roles.RESIDENTE, u2.id, "ARRENDATARIO");
    await expect(invitarMiembro(inquilino, { unidadId: u2.id, email: `x-${tag()}@prueba.co`, nombre: "X", tipoVinculo: "FAMILIAR", capacidades: ["cuenta"] })).rejects.toThrow(/más acceso/);
    await expect(invitarMiembro(inquilino, { unidadId: u2.id, email: `x-${tag()}@prueba.co`, nombre: "X", tipoVinculo: "ARRENDATARIO", capacidades: ["visitantes"] })).rejects.toThrow(/propietario/);

    // Arrendatario derivado del propietario con capacidades acotadas: es titular de su hogar pero con techo
    const { ctx: dueno } = await titular(conjunto.id, roles.PROPIETARIO, u1.id, "PROPIETARIO");
    const arr = await invitarYAceptar(dueno, u1.id, "ARRENDATARIO", ["comunidad", "visitantes", "reservas"]);
    await resolverVinculo(admin, arr.vinculo.id, true);
    const arrCtx = (await buildCtx(arr.usuarioId, conjunto.id))!;
    expect(arrCtx.permisos.has("tickets.crear")).toBe(false);
    await expect(invitarMiembro(arrCtx, { unidadId: u1.id, email: `x-${tag()}@prueba.co`, nombre: "X", tipoVinculo: "FAMILIAR", capacidades: ["visitantes", "pqrs"] })).rejects.toThrow(/más acceso/);
    const hijo = await invitarYAceptar(arrCtx, u1.id, "FAMILIAR", ["visitantes", "reservas"]);

    // Si el propietario le quita "reservas" al arrendatario, su familia también la pierde
    await editarCapacidades(dueno, { vinculoId: arr.vinculo.id, capacidades: ["comunidad", "visitantes"] });
    expect((await prisma.vinculoUnidad.findUniqueOrThrow({ where: { id: hijo.vinculo.id } })).capacidadesHogar).toEqual(["visitantes"]);

    // Un miembro derivado (no titular) no puede invitar ni gestionar accesos
    const hijoCtx = (await buildCtx(hijo.usuarioId, conjunto.id))!;
    await expect(invitarMiembro(hijoCtx, { unidadId: u1.id, email: `x-${tag()}@prueba.co`, nombre: "X", tipoVinculo: "FAMILIAR", capacidades: ["visitantes"] })).rejects.toThrow(/titular/);
    await expect(pausarAcceso(hijoCtx, { vinculoId: arr.vinculo.id, pausar: true })).rejects.toThrow(/titular/);
    // El propietario no gestiona la familia del arrendatario (es su hogar); la administración sí
    await expect(quitarAcceso(dueno, { vinculoId: hijo.vinculo.id })).rejects.toThrow(/otro titular/);
    await pausarAcceso(admin, { vinculoId: hijo.vinculo.id, pausar: true });
    expect((await prisma.vinculoUnidad.findUniqueOrThrow({ where: { id: hijo.vinculo.id } })).accesoPausado).toBe(true);
  });
});
