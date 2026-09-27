import { afterAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { DEFAULT_ROLE_PERMS, type RolBase } from "@/lib/permisos";
import { crearCargo } from "@/lib/cartera/core";
import { cerrarVotacionesVencidas, crearVotacion, verificarComprobante, votar } from "@/lib/votaciones/service";
import { decidirPoder, guardarAsamblea, iniciarAsamblea, registrarAsistenciaPropia, registrarPoder } from "@/lib/asambleas/service";
import { systemCtx } from "@/lib/auth/system-ctx";
import { makeConjunto, makeUnidades } from "../helpers/db";

let n = 0;
/** Usuario con persona vinculada a unidades y contexto equivalente al de una sesión real. */
async function usuario(base: Ctx, rol: RolBase, vinculos: { unidadId: string; tipo: "PROPIETARIO" | "ARRENDATARIO" }[]): Promise<Ctx> {
  n++;
  const u = await prisma.usuario.create({ data: { email: `gob${Date.now()}${n}@test.co`, nombre: `Usuario ${n}` } });
  const rolRow = await prisma.rol.findFirstOrThrow({ where: { conjuntoId: base.conjuntoId, clave: rol } });
  await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId: base.conjuntoId, rolId: rolRow.id } });
  const p = await prisma.persona.create({ data: { conjuntoId: base.conjuntoId, usuarioId: u.id, numeroDocumento: String(80_000_000 + n + Math.floor(Math.random() * 1e6)), nombres: "Usuario", apellidos: String(n) } });
  for (const v of vinculos) await prisma.vinculoUnidad.create({ data: { conjuntoId: base.conjuntoId, personaId: p.id, unidadId: v.unidadId, tipo: v.tipo } });
  return {
    ...base,
    userId: u.id,
    nombre: u.nombre,
    email: u.email,
    esSuperAdmin: false,
    rolId: rolRow.id,
    rolClave: rol,
    rolBase: rol,
    rolNombre: rol,
    permisos: new Set(DEFAULT_ROLE_PERMS[rol]),
    unidadIds: vinculos.map((v) => v.unidadId),
    unidadesPropias: vinculos.filter((v) => v.tipo === "PROPIETARIO").map((v) => v.unidadId),
    personaIds: [p.id],
    db: withTenant(prisma, base.conjuntoId),
  };
}

const OPCIONES = ["Sí", "No"];
const en = (min: number) => new Date(Date.now() + min * 60_000);

describe("votaciones con validez", () => {
  afterAll(() => prisma.$disconnect());

  it("un voto por unidad; un propietario con varias unidades vota por cada una y recibe comprobante", async () => {
    const { ctx } = await makeConjunto("Votos");
    const [u1, u2, u3] = await makeUnidades(ctx.conjuntoId, 4);
    const laura = await usuario(ctx, "PROPIETARIO", [
      { unidadId: u1.id, tipo: "PROPIETARIO" },
      { unidadId: u2.id, tipo: "PROPIETARIO" },
    ]);
    const v = await crearVotacion(ctx, { pregunta: "¿Aprueba pintar?", opciones: OPCIONES, tipoMayoria: "SIMPLE", ponderacion: "COEFICIENTE", quienVota: "PROPIETARIOS", secreto: true, fin: en(60), notificar: false });
    const r1 = await votar(laura, { votacionId: v.id, unidadId: u1.id, opcionId: "o1" });
    expect(r1.comprobante).toMatch(/^[a-f0-9]{64}$/);
    await expect(votar(laura, { votacionId: v.id, unidadId: u1.id, opcionId: "o2" })).rejects.toThrow(/ya votó/);
    await votar(laura, { votacionId: v.id, unidadId: u2.id, opcionId: "o2" });
    await expect(votar(laura, { votacionId: v.id, unidadId: u3.id, opcionId: "o1" })).rejects.toThrow(/No puedes votar/);

    const votos = await prisma.voto.findMany({ where: { votacionId: v.id } });
    expect(votos).toHaveLength(2);
    // Voto secreto: no se guarda quién votó
    expect(votos.every((x) => x.usuarioId === null && x.votanteNombre === null)).toBe(true);
    // Verificación del comprobante: el dueño ve su opción; otro usuario solo la validez
    const propio = await verificarComprobante(laura, r1.comprobante);
    expect(propio).toMatchObject({ valido: true, opcion: "Sí" });
    const otro = await usuario(ctx, "PROPIETARIO", [{ unidadId: u3.id, tipo: "PROPIETARIO" }]);
    const ajeno = await verificarComprobante(otro, r1.comprobante);
    expect(ajeno).toMatchObject({ valido: true, opcion: null, unidad: null });
  });

  it("el apoderado vota por la unidad del poderdante (poder aprobado) y el poderdante ya no puede", async () => {
    const { ctx } = await makeConjunto("Poderes");
    const [uA, uB] = await makeUnidades(ctx.conjuntoId, 3);
    const duena = await usuario(ctx, "PROPIETARIO", [{ unidadId: uA.id, tipo: "PROPIETARIO" }]);
    // El apoderado es un arrendatario (sin permiso de voto propio)
    const apoderado = await usuario(ctx, "RESIDENTE", [{ unidadId: uB.id, tipo: "ARRENDATARIO" }]);
    const a = await guardarAsamblea(ctx, { titulo: "Asamblea de prueba", tipo: "EXTRAORDINARIA", modalidad: "VIRTUAL", fecha: en(30), enlace: "https://meet.google.com/x" });
    await prisma.asamblea.update({ where: { id: a.id }, data: { estado: "CONVOCADA" } });
    const poder = await registrarPoder(duena, { asambleaId: a.id, unidadId: uA.id, apoderadoNombre: apoderado.nombre, apoderadoEmail: apoderado.email, documentoUrl: "/api/files/x/poder.pdf" }, { esAdmin: false });
    expect(poder.apoderadoUsuarioId).toBe(apoderado.userId);
    await decidirPoder(ctx, poder.id, "APROBADO");
    await iniciarAsamblea(ctx, a.id);
    const asis = await registrarAsistenciaPropia(apoderado, a.id, { tipo: "VIRTUAL" });
    expect(asis.unidades).toEqual([uA.codigo]);

    const v = await crearVotacion(ctx, { pregunta: "Punto 1", opciones: OPCIONES, tipoMayoria: "SIMPLE", ponderacion: "COEFICIENTE", quienVota: "PROPIETARIOS", secreto: false, fin: en(15), asambleaId: a.id, notificar: false });
    await expect(votar(duena, { votacionId: v.id, unidadId: uA.id, opcionId: "o1" })).rejects.toThrow(/No puedes votar/);
    await votar(apoderado, { votacionId: v.id, unidadId: uA.id, opcionId: "o1" });
    const voto = await prisma.voto.findFirstOrThrow({ where: { votacionId: v.id } });
    expect(voto.porPoder).toBe(true);
    expect(voto.usuarioId).toBe(apoderado.userId);
    // El apoderado no puede votar por su propia unidad arrendada (no es propietario)
    await expect(votar(apoderado, { votacionId: v.id, unidadId: uB.id, opcionId: "o1" })).rejects.toThrow(/No puedes votar/);
  });

  it("respeta el límite de poderes por apoderado", async () => {
    const { ctx } = await makeConjunto("Limite");
    const us = await makeUnidades(ctx.conjuntoId, 3);
    const a = await guardarAsamblea(ctx, { titulo: "Asamblea límite", tipo: "ORDINARIA", modalidad: "PRESENCIAL", fecha: en(60 * 24 * 20), lugar: "Salón", limitePoderes: 1 });
    await registrarPoder(ctx, { asambleaId: a.id, unidadId: us[0].id, apoderadoNombre: "Pedro Pérez", apoderadoDocumento: "123" }, { esAdmin: true });
    await expect(registrarPoder(ctx, { asambleaId: a.id, unidadId: us[1].id, apoderadoNombre: "Pedro Pérez", apoderadoDocumento: "123" }, { esAdmin: true })).rejects.toThrow(/límite/);
  });

  it("bloquea a unidades en mora cuando la votación exige estar al día", async () => {
    const { ctx } = await makeConjunto("Mora");
    const [u1, u2] = await makeUnidades(ctx.conjuntoId, 2);
    const moroso = await usuario(ctx, "PROPIETARIO", [{ unidadId: u1.id, tipo: "PROPIETARIO" }]);
    const alDia = await usuario(ctx, "PROPIETARIO", [{ unidadId: u2.id, tipo: "PROPIETARIO" }]);
    await crearCargo(ctx, { unidadId: u1.id, conceptoTipo: "ADMINISTRACION", valorBase: 300000, fechaVencimiento: new Date(Date.now() - 40 * 86400000), origen: "MANUAL" });
    const v = await crearVotacion(ctx, { pregunta: "¿Al día?", opciones: OPCIONES, tipoMayoria: "SIMPLE", ponderacion: "UNIDAD", quienVota: "PROPIETARIOS_AL_DIA", secreto: false, fin: en(60), notificar: false });
    await expect(votar(moroso, { votacionId: v.id, unidadId: u1.id, opcionId: "o1" })).rejects.toThrow(/saldo vencido/);
    await votar(alDia, { votacionId: v.id, unidadId: u2.id, opcionId: "o1" });
    // Con quienVota PROPIETARIOS no se bloquea…
    const v2 = await crearVotacion(ctx, { pregunta: "¿Todos?", opciones: OPCIONES, tipoMayoria: "SIMPLE", ponderacion: "UNIDAD", quienVota: "PROPIETARIOS", secreto: false, fin: en(60), notificar: false });
    await votar(moroso, { votacionId: v2.id, unidadId: u1.id, opcionId: "o1" });
    // …salvo que el conjunto active el bloqueo de voto por mora
    const cfg = (await prisma.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } })).config as Record<string, unknown>;
    const conBloqueo = { ...moroso, conjunto: { ...moroso.conjunto, config: { ...cfg, bloqueoMora: { votacion: true } } } };
    const v3 = await crearVotacion(ctx, { pregunta: "¿Bloqueo?", opciones: OPCIONES, tipoMayoria: "SIMPLE", ponderacion: "UNIDAD", quienVota: "PROPIETARIOS", secreto: false, fin: en(60), notificar: false });
    await expect(votar(conBloqueo, { votacionId: v3.id, unidadId: u1.id, opcionId: "o1" })).rejects.toThrow(/saldo vencido/);
  });

  it("el cierre automático calcula el resultado por coeficiente y asigna el código del acta", async () => {
    const { ctx } = await makeConjunto("Cierre");
    const us = await makeUnidades(ctx.conjuntoId, 4); // 25 % cada una
    const votantes = await Promise.all(us.slice(0, 3).map((u) => usuario(ctx, "PROPIETARIO", [{ unidadId: u.id, tipo: "PROPIETARIO" }])));
    const v = await crearVotacion(ctx, { pregunta: "¿Cuota extraordinaria?", opciones: OPCIONES, tipoMayoria: "CALIFICADA_70", ponderacion: "COEFICIENTE", quienVota: "PROPIETARIOS", secreto: false, fin: en(5), notificar: false });
    await votar(votantes[0], { votacionId: v.id, unidadId: us[0].id, opcionId: "o1" });
    await votar(votantes[1], { votacionId: v.id, unidadId: us[1].id, opcionId: "o1" });
    await votar(votantes[2], { votacionId: v.id, unidadId: us[2].id, opcionId: "o2" });
    await prisma.votacion.update({ where: { id: v.id }, data: { fin: new Date(Date.now() - 1000) } });
    const cerradas = await cerrarVotacionesVencidas((id) => systemCtx(id));
    expect(cerradas).toBeGreaterThanOrEqual(1);
    const fin = await prisma.votacion.findUniqueOrThrow({ where: { id: v.id } });
    expect(fin.estado).toBe("CERRADA");
    expect(fin.codigoActa).toMatch(/^VOT-/);
    const r = fin.resultado as { aprobada: boolean; participacionCoeficiente: number; opciones: { id: string; pctCoeficiente: number }[] };
    expect(r.participacionCoeficiente).toBe(75);
    expect(r.opciones.find((o) => o.id === "o1")!.pctCoeficiente).toBe(50);
    expect(r.aprobada).toBe(false); // 50 % < 70 % del total (art. 46)
    await expect(votar(votantes[0], { votacionId: v.id, unidadId: us[3].id, opcionId: "o1" })).rejects.toThrow();
  });
});
