import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { crearCargo, registrarPago } from "@/lib/cartera/core";
import { acusarLlamado, crearLlamado, decidirMulta, notificarMulta, obtenerLlamado, obtenerMulta, presentarDescargos, proponerMulta, responderLlamado } from "@/lib/convivencia/service";
import { decidirMudanza, solicitarMudanza } from "@/lib/obras/service";
import { addDays, parseLocal, isoDate } from "@/lib/format";
import { esDiaHabil } from "@/lib/tickets/dias-habiles";
import { makeConjunto, makeUnidades } from "../helpers/db";
import { makeUsuario } from "../helpers/usuarios";

describe("convivencia: llamados y multas con debido proceso", () => {
  afterAll(() => prisma.$disconnect());

  it("la multa solo se carga a cartera cuando el consejo la ratifica", async () => {
    const { ctx: sys, roles } = await makeConjunto("Multas");
    const [u1, u2] = await makeUnidades(sys.conjuntoId, 2);
    const admin = await makeUsuario(sys.conjuntoId, roles.ADMINISTRADOR);
    const consejo = await makeUsuario(sys.conjuntoId, roles.CONSEJO, u2.id);
    const residente = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u1.id);
    const vecino = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u2.id);
    const infraccion = await prisma.catalogoInfraccion.findFirstOrThrow({ where: { conjuntoId: sys.conjuntoId, codigo: "RUI-01" } });
    const cuotasMulta = () => prisma.cuota.count({ where: { unidadId: u1.id, origen: "MULTA" } });

    // Llamado → acuse → respuesta
    const l = await crearLlamado(admin, { unidadId: u1.id, infraccionId: infraccion.id, descripcion: "Música a alto volumen el sábado a las 2:00 a. m." });
    expect(l.gravedad).toBe("MODERADA");
    await expect(obtenerLlamado(vecino, l.id)).rejects.toThrow(/no existe/);
    await acusarLlamado(residente, l.id);
    await responderLlamado(residente, l.id, "Fue una celebración familiar, no se repetirá.");
    expect((await prisma.llamadoAtencion.findUniqueOrThrow({ where: { id: l.id } })).estado).toBe("RESPONDIDO");

    // Escala a multa: PROPUESTA (el residente aún no la ve) — sin cargo
    const m = await proponerMulta(admin, { unidadId: u1.id, llamadoId: l.id, descripcion: "Reincidencia en ruido nocturno" });
    expect(Number(m.valor)).toBe(150000); // valor sugerido del catálogo
    expect((await prisma.llamadoAtencion.findUniqueOrThrow({ where: { id: l.id } })).estado).toBe("ESCALADO_MULTA");
    await expect(obtenerMulta(residente, m.id)).rejects.toThrow(/no existe/);
    await expect(decidirMulta(consejo, m.id, { decision: "RATIFICADA", resolucion: "Se ratifica sin notificar" })).rejects.toThrow(/notifica/);
    expect(await cuotasMulta()).toBe(0);

    // Notificada: plazo de descargos en días hábiles; el consejo no puede decidir dentro del plazo sin descargos
    const ahora = new Date();
    const n = await notificarMulta(admin, m.id, 5, ahora);
    expect(n.plazoDescargos.getTime()).toBeGreaterThan(ahora.getTime() + 5 * 86_400_000 - 1);
    await expect(decidirMulta(consejo, m.id, { decision: "RATIFICADA", resolucion: "Decisión anticipada" })).rejects.toThrow(/dentro del plazo/);
    expect(await cuotasMulta()).toBe(0);

    // Descargos → EN_DESCARGOS (aún sin cargo); solo el consejo decide
    await presentarDescargos(residente, m.id, "Pido que se tenga en cuenta que fue una única vez y ya ofrecí disculpas.");
    expect(await cuotasMulta()).toBe(0);
    await expect(decidirMulta(residente, m.id, { decision: "RATIFICADA", resolucion: "x".repeat(20) })).rejects.toThrow(/consejo/);

    // Ratificada → cuota MULTA con origen MULTA y cuotaId guardado
    const r = await decidirMulta(consejo, m.id, { decision: "RATIFICADA", resolucion: "Se ratifica con valor reducido por los descargos.", valor: 100000 });
    expect(r.cuotaId).toBeTruthy();
    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id: r.cuotaId! }, include: { concepto: true } });
    expect(cuota.origen).toBe("MULTA");
    expect(cuota.concepto.tipo).toBe("MULTA");
    expect(Number(cuota.saldo)).toBe(100000);
    const multa = await prisma.multa.findUniqueOrThrow({ where: { id: m.id } });
    expect(multa.estado).toBe("RATIFICADA");
    expect(multa.cuotaId).toBe(cuota.id);
    expect(await cuotasMulta()).toBe(1);
    await expect(decidirMulta(consejo, m.id, { decision: "REVOCADA", resolucion: "Cambio de opinión del consejo" })).rejects.toThrow();

    // Notificación con enlace de pago
    const notif = await prisma.notificacion.findFirst({ where: { usuarioId: residente.userId, titulo: { startsWith: "Multa ratificada" } } });
    expect(notif?.enlace).toBe(`/cuenta/pagar?cuotas=${cuota.id}&unidad=${u1.id}`);

    // Al pagar, la multa queda PAGADA (núcleo de cartera)
    await registrarPago(sys, { unidadId: u1.id, valor: 100000, medio: "EFECTIVO", cuotasSeleccionadas: [cuota.id] });
    expect((await prisma.multa.findUniqueOrThrow({ where: { id: m.id } })).estado).toBe("PAGADA");
  });

  it("una multa revocada nunca genera cargo", async () => {
    const { ctx: sys, roles } = await makeConjunto("Revocada");
    const [u1] = await makeUnidades(sys.conjuntoId, 1);
    const admin = await makeUsuario(sys.conjuntoId, roles.ADMINISTRADOR);
    const m = await proponerMulta(admin, { unidadId: u1.id, descripcion: "Mascota sin traílla en la piscina", valor: 80000 });
    await notificarMulta(admin, m.id, 1, new Date(Date.now() - 10 * 86_400_000));
    const r = await decidirMulta(admin, m.id, { decision: "REVOCADA", resolucion: "No hay prueba suficiente de los hechos." });
    expect(r.cuotaId).toBeNull();
    expect(await prisma.cuota.count({ where: { unidadId: u1.id } })).toBe(0);
  });
});

describe("mudanzas", () => {
  it("no aprueba una salida sin paz y salvo y evita cruces de horario", async () => {
    const { ctx: sys, roles } = await makeConjunto("Mudanzas");
    const [u1, u2] = await makeUnidades(sys.conjuntoId, 2);
    const admin = await makeUsuario(sys.conjuntoId, roles.ADMINISTRADOR);
    const residente = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u1.id);
    let dia = addDays(new Date(), 3);
    while (!esDiaHabil(dia)) dia = addDays(dia, 1);
    const fecha = parseLocal(isoDate(dia));

    await crearCargo(sys, { unidadId: u1.id, conceptoTipo: "ADMINISTRACION", valorBase: 300000, fechaVencimiento: addDays(new Date(), -40), origen: "MANUAL" });
    const m = await solicitarMudanza(residente, { unidadId: u1.id, tipo: "SALIDA", fecha, horaInicio: "08:00", horaFin: "11:00", recurso: "Zona de cargue", enseres: [{ descripcion: "Nevera", cantidad: 1 }] });
    expect(m.pazYSalvoVerificado).toBe(false);
    await expect(decidirMudanza(admin, m.id, { aprobar: true })).rejects.toThrow(/paz y salvo/);

    await expect(solicitarMudanza(admin, { unidadId: u2.id, tipo: "INGRESO", fecha, horaInicio: "10:00", horaFin: "12:00", recurso: "Zona de cargue" })).rejects.toThrow(/ya está reservado/);
    const otra = await solicitarMudanza(admin, { unidadId: u2.id, tipo: "INGRESO", fecha, horaInicio: "11:00", horaFin: "13:00", recurso: "Zona de cargue" });
    expect(otra.estado).toBe("SOLICITADA");

    await registrarPago(sys, { unidadId: u1.id, valor: 300000, medio: "TRANSFERENCIA" });
    const ok = await decidirMudanza(admin, m.id, { aprobar: true });
    expect(ok.estado).toBe("APROBADA");
    expect(ok.pazYSalvoVerificado).toBe(true);
  });
});
