import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { crearAutorizacion } from "@/lib/porteria/autorizaciones";
import { adentroAhora, anularRegistro, ingresoPorAutorizacion, registrarSalida } from "@/lib/porteria/service";
import { crearSolicitud, resolverSolicitudPorteria, responderSolicitud } from "@/lib/porteria/solicitudes";
import { sincronizar } from "@/lib/porteria/sync";
import { autorizadosRecoger, entregarPaquetes, recibirPaquete } from "@/lib/paqueteria/service";
import { makeConjunto, makeUnidades } from "../helpers/db";
import { makeUsuario } from "../helpers/usuarios";

const FIRMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

async function persona(conjuntoId: string, unidadId: string, nombres: string, tipo: "PROPIETARIO" | "FAMILIAR" | "AUTORIZADO_RECOGER_PAQUETES" | "EMPLEADO_DOMESTICO", usuarioId?: string, edad = 40) {
  const nac = new Date();
  nac.setFullYear(nac.getFullYear() - edad);
  const p = await prisma.persona.create({ data: { conjuntoId, numeroDocumento: String(Math.floor(Math.random() * 1e9)), nombres, apellidos: "Prueba", usuarioId, fechaNacimiento: nac } });
  await prisma.vinculoUnidad.create({ data: { conjuntoId, personaId: p.id, unidadId, tipo } });
  return p;
}

describe("portería (integración)", () => {
  let portero: Ctx;
  let residente: Ctx;
  let otro: Ctx;
  let unidadId: string;
  let otraUnidadId: string;

  beforeAll(async () => {
    const { conjunto, roles } = await makeConjunto("Porteria");
    const [u1, u2] = await makeUnidades(conjunto.id, 2);
    unidadId = u1.id;
    otraUnidadId = u2.id;
    portero = await makeUsuario(conjunto.id, roles.PORTERIA);
    residente = await makeUsuario(conjunto.id, roles.PROPIETARIO, u1.id);
    otro = await makeUsuario(conjunto.id, roles.PROPIETARIO, u2.id);
  });
  afterAll(() => prisma.$disconnect());

  it("autorización → ingreso por código → salida (una sola vez)", async () => {
    const a = await crearAutorizacion(residente, {
      unidadId,
      nombreVisitante: "Carlos Visita",
      tipo: "VISITA",
      fechaInicio: new Date(Date.now() - 60_000),
      fechaFin: new Date(Date.now() + 3_600_000),
      usosPermitidos: 1,
    });
    expect(a.codigo).toMatch(/^\d{6}$/);
    await expect(crearAutorizacion(otro, { unidadId, nombreVisitante: "X", tipo: "VISITA", fechaInicio: new Date(), fechaFin: new Date(Date.now() + 60_000) })).rejects.toThrow(/tu unidad/);

    const ing = await ingresoPorAutorizacion(portero, { codigo: a.codigo });
    expect(ing.medio).toBe("CODIGO");
    expect(ing.unidadId).toBe(unidadId);
    const usada = await prisma.autorizacionIngreso.findUniqueOrThrow({ where: { id: a.id } });
    expect(usada.usos).toBe(1);
    expect(usada.estado).toBe("USADA");
    await expect(ingresoPorAutorizacion(portero, { codigo: a.codigo })).rejects.toThrow();
    // El residente fue notificado
    expect(await prisma.notificacion.count({ where: { usuarioId: residente.userId, tipo: "VISITANTE_INGRESO" } })).toBe(1);

    expect((await adentroAhora(portero)).some((x) => x.id === ing.id)).toBe(true);
    const sal = await registrarSalida(portero, { ingresoId: ing.id });
    expect(sal.registro.ingresoId).toBe(ing.id);
    expect((await adentroAhora(portero)).some((x) => x.id === ing.id)).toBe(false);
    await expect(registrarSalida(portero, { ingresoId: ing.id })).rejects.toThrow(/salida registrada/);
  });

  it("la bitácora es inmutable: se anula con un registro ANULACION", async () => {
    const [r] = await sincronizar(portero, [{ clienteId: "anul-" + Date.now(), tipo: "INGRESO_MANUAL", payload: { sujeto: "VISITANTE", nombre: "Error de digitación", unidadId } }]);
    expect(r.ok).toBe(true);
    const an = await anularRegistro(portero, { id: r.id!, motivo: "Unidad equivocada" });
    expect(an.tipo).toBe("ANULACION");
    expect(an.anulaId).toBe(r.id);
    const original = await prisma.registroAcceso.findUniqueOrThrow({ where: { id: r.id! } });
    expect(original.deletedAt).toBeNull();
    expect(original.nombre).toBe("Error de digitación");
    await expect(anularRegistro(portero, { id: r.id!, motivo: "otra vez" })).rejects.toThrow(/ya fue anulado/);
    await expect(anularRegistro(portero, { id: an.id, motivo: "anular la anulación" })).rejects.toThrow(/no se puede anular/);
  });

  it("solicitud en tiempo real: el residente responde y portería registra el ingreso", async () => {
    const s = await crearSolicitud(portero, { unidadId, visitanteNombre: "Domiciliario Rappi", tipo: "DOMICILIO" });
    expect(s.destinatarios).toBe(1);
    const n = await prisma.notificacion.findFirst({ where: { usuarioId: residente.userId, tipo: "SOLICITUD_INGRESO" }, orderBy: { createdAt: "desc" } });
    expect((n?.data as { solicitudId?: string })?.solicitudId).toBe(s.id);
    await expect(responderSolicitud(otro, s.id, "AUTORIZADA")).rejects.toThrow(/residentes de la unidad/);
    await expect(resolverSolicitudPorteria(portero, { id: s.id })).rejects.toThrow(/aún no autoriza/);
    const r = await responderSolicitud(residente, s.id, "AUTORIZADA");
    expect(r.estado).toBe("AUTORIZADA");
    await expect(responderSolicitud(residente, s.id, "RECHAZADA")).rejects.toThrow(/ya fue respondida/);
    const res = await resolverSolicitudPorteria(portero, { id: s.id });
    const reg = await prisma.registroAcceso.findUniqueOrThrow({ where: { id: res.registroId! } });
    expect(reg.medio).toBe("LLAMADA_RESIDENTE");
    expect(reg.sujeto).toBe("DOMICILIARIO");
  });

  it("decisión telefónica cuando el residente no responde", async () => {
    const s = await crearSolicitud(portero, { unidadId: otraUnidadId, visitanteNombre: "Técnico gas" });
    const r = await resolverSolicitudPorteria(portero, { id: s.id, telefonica: "RECHAZADA" });
    expect(r.autoriza).toBe(false);
    expect(r.solicitud.estado).toBe("DECISION_TELEFONICA");
    expect(r.registroId).toBeNull();
  });

  it("sync offline idempotente por clienteId", async () => {
    const clienteId = "cli-" + Math.random().toString(36).slice(2);
    const op = { clienteId, tipo: "INGRESO_MANUAL", creadoEn: new Date(Date.now() - 10 * 60_000).toISOString(), payload: { sujeto: "PROVEEDOR", nombre: "Proveedor offline", unidadId } };
    const [a] = await sincronizar(portero, [op]);
    const [b] = await sincronizar(portero, [op]);
    expect(a.ok && b.ok).toBe(true);
    expect(b.id).toBe(a.id);
    expect(await prisma.registroAcceso.count({ where: { clienteId } })).toBe(1);
    const reg = await prisma.registroAcceso.findUniqueOrThrow({ where: { id: a.id! } });
    expect(Math.abs(reg.hora.getTime() - (Date.now() - 10 * 60_000))).toBeLessThan(60_000);

    const pq = { clienteId: clienteId + "-p", tipo: "PAQUETE", payload: { unidadId, tipo: "CAJA", transportadora: "TCC" } };
    const [p1, p2] = await sincronizar(portero, [pq, pq]);
    expect(p1.id).toBe(p2.id);
    const nv = { clienteId: clienteId + "-n", tipo: "NOVEDAD", payload: { tipo: "RUIDO", severidad: "BAJA", descripcion: "Música alta", crearTicket: "false" } };
    const [n1] = await sincronizar(portero, [nv]);
    const [n2] = await sincronizar(portero, [nv]);
    expect(n1.id).toBe(n2.id);
    // Errores de negocio se reportan como definitivos
    const [bad] = await sincronizar(portero, [{ clienteId: clienteId + "-x", tipo: "INGRESO_CODIGO", payload: { codigo: "000001" } }]);
    expect(bad.ok).toBe(false);
    expect(bad.definitivo).toBe(true);
  });

  it("entrega de paquete solo a personas autorizadas de la unidad", async () => {
    const autorizado = await persona(portero.conjuntoId, unidadId, "Mensajera", "AUTORIZADO_RECOGER_PAQUETES");
    const nino = await persona(portero.conjuntoId, unidadId, "Tomasito", "FAMILIAR", undefined, 9);
    const empleada = await persona(portero.conjuntoId, unidadId, "Rosa", "EMPLEADO_DOMESTICO");
    const vecino = { id: otro.personaIds[0] };
    const p = await recibirPaquete(portero, { unidadId, tipo: "CAJA", transportadora: "Servientrega" });
    expect(p.notificadoEn).not.toBeNull();
    const ids = (await autorizadosRecoger(portero, unidadId)).map((a) => a.personaId);
    expect(ids).toContain(autorizado.id);
    expect(ids).not.toContain(nino.id);
    expect(ids).not.toContain(empleada.id);
    for (const pid of [vecino.id, nino.id, empleada.id]) {
      await expect(entregarPaquetes(portero, { paqueteIds: [p.id], personaId: pid, firma: FIRMA })).rejects.toThrow(/no está autorizada/);
    }
    await expect(entregarPaquetes(portero, { paqueteIds: [p.id], personaId: autorizado.id })).rejects.toThrow(/firma/);
    const r = await entregarPaquetes(portero, { paqueteIds: [p.id], personaId: autorizado.id, firma: FIRMA });
    expect(r.entregados).toBe(1);
    const e = await prisma.paquete.findUniqueOrThrow({ where: { id: p.id } });
    expect(e.estado).toBe("ENTREGADO");
    expect(e.recogidoPorPersonaId).toBe(autorizado.id);
    await expect(entregarPaquetes(portero, { paqueteIds: [p.id], personaId: autorizado.id, firma: FIRMA })).rejects.toThrow(/ya fue entregado/);
  });
});
