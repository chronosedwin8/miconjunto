import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { asignarTicket, calificarTicket, cambiarEstado, comentarTicket, crearOrdenDesdeTicket, crearTicket, listarTickets, obtenerTicket } from "@/lib/tickets/service";
import { radicarPqrsPublica } from "@/lib/tickets/publico";
import { nowBogota } from "@/lib/format";
import { makeConjunto, makeUnidades } from "../helpers/db";
import { makeUsuario } from "../helpers/usuarios";

describe("mesa de ayuda (tickets)", () => {
  afterAll(() => prisma.$disconnect());

  it("crear → radicado consecutivo → asignar → resolver → calificar", async () => {
    const { ctx: sys, roles } = await makeConjunto("Tickets");
    const [u1, u2] = await makeUnidades(sys.conjuntoId, 2);
    const admin = await makeUsuario(sys.conjuntoId, roles.ADMINISTRADOR);
    const residente = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u1.id);
    const mant = await makeUsuario(sys.conjuntoId, roles.MANTENIMIENTO);
    const anio = nowBogota().year;

    const t1 = await crearTicket(residente, { tipo: "DANO_UNIDAD", descripcion: "Filtración en el techo del baño", urgente: true });
    const t2 = await crearTicket(residente, { tipo: "PETICION", descripcion: "Solicito copia del reglamento" });
    expect(t1.radicado).toBe(`${anio}-0001`);
    expect(t2.radicado).toBe(`${anio}-0002`);
    expect(t1.unidadId).toBe(u1.id);
    expect(t1.prioridad).toBe("URGENTE");
    expect(t1.fechaLimite.getTime()).toBeLessThan(t2.fechaLimite.getTime());

    // El residente no puede fijar prioridad ni radicar a nombre de otra unidad
    await expect(crearTicket(residente, { tipo: "QUEJA", descripcion: "Ruido", unidadId: u2.id })).rejects.toThrow(/tus propias unidades/);

    await asignarTicket(admin, t1.id, { asignadoAId: mant.userId });
    // Mantenimiento ve el ticket asignado; un comentario interno no lo ve el residente
    const vistoMant = await obtenerTicket(mant, t1.id);
    expect(vistoMant.estado).toBe("ASIGNADO");
    await comentarTicket(mant, t1.id, { contenido: "Revisar tubería del apto de arriba", interno: true });
    await cambiarEstado(mant, t1.id, { estado: "EN_PROCESO" });
    await expect(cambiarEstado(mant, t1.id, { estado: "CERRADO" })).rejects.toThrow(/No se puede pasar/);
    await cambiarEstado(mant, t1.id, { estado: "RESUELTO", nota: "Se cambió el tubo", adjuntos: ["/api/files/x/tickets/foto.jpg"] });
    await expect(cambiarEstado(residente, t1.id, { estado: "CERRADO" })).rejects.toThrow(/permiso/);

    const visto = await obtenerTicket(residente, t1.id);
    expect(visto.comentarios.some((c) => c.interno)).toBe(false);
    expect(visto.comentarios.some((c) => c.tipo === "ASIGNACION")).toBe(true);
    expect(visto.comentarios.filter((c) => c.tipo === "CAMBIO_ESTADO").length).toBeGreaterThanOrEqual(2);
    expect(visto.resueltoEn).not.toBeNull();

    await calificarTicket(residente, t1.id, { calificacion: 5, comentario: "Muy rápido" });
    const final = await prisma.ticket.findUniqueOrThrow({ where: { id: t1.id } });
    expect(final.estado).toBe("CERRADO");
    expect(final.calificacion).toBe(5);
    await expect(calificarTicket(residente, t1.id, { calificacion: 3 })).rejects.toThrow(/ya fue calificada/);

    const eventosAudit = await prisma.auditoria.count({ where: { conjuntoId: sys.conjuntoId, entidad: "Ticket", entidadId: t1.id } });
    expect(eventosAudit).toBeGreaterThan(0);
  });

  it("un residente no ve tickets de otras unidades", async () => {
    const { ctx: sys, roles } = await makeConjunto("Privacidad");
    const [u1, u2] = await makeUnidades(sys.conjuntoId, 2);
    const laura = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u1.id);
    const andres = await makeUsuario(sys.conjuntoId, roles.RESIDENTE, u2.id, "ARRENDATARIO");
    const t = await crearTicket(laura, { tipo: "QUEJA", descripcion: "Queja privada de Laura" });
    await expect(obtenerTicket(andres, t.id)).rejects.toThrow(/no existe o no tienes acceso/);
    await expect(comentarTicket(andres, t.id, { contenido: "hola" })).rejects.toThrow(/no existe/);
    const lista = await listarTickets(andres);
    expect(lista.items.map((x) => x.id)).not.toContain(t.id);
    expect((await listarTickets(laura)).items.map((x) => x.id)).toContain(t.id);
  });

  it("un daño en zona común genera orden de trabajo enlazada", async () => {
    const { ctx: sys, roles } = await makeConjunto("Orden");
    const admin = await makeUsuario(sys.conjuntoId, roles.ADMINISTRADOR);
    const zona = await prisma.zonaComun.create({ data: { conjuntoId: sys.conjuntoId, nombre: "Piscina" } });
    const t = await crearTicket(admin, { tipo: "DANO_ZONA_COMUN", descripcion: "Bomba de la piscina no funciona", zonaId: zona.id, prioridad: "ALTA" });
    const o = await crearOrdenDesdeTicket(admin, t.id, { fechaProgramada: new Date() });
    expect(o.origen).toBe("TICKET");
    expect(o.ticketId).toBe(t.id);
    expect(o.zonaId).toBe(zona.id);
    expect(o.numero).toBeGreaterThan(0);
    await expect(crearOrdenDesdeTicket(admin, t.id, { fechaProgramada: new Date() })).rejects.toThrow(/ya tiene la orden/);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).estado).toBe("EN_PROCESO");
  });

  it("el formulario público crea un ticket PUBLICO y descarta robots", async () => {
    const { conjunto } = await makeConjunto("Publico");
    await prisma.conjunto.update({ where: { id: conjunto.id }, data: { paginaPublica: true } });
    const base = { slug: conjunto.slug, nombre: "Marta Díaz", correo: "marta@correo.co", tipo: "PETICION", descripcion: "Quisiera saber si hay apartamentos en arriendo.", acepta: "true", ts: Date.now() - 60_000 };
    const r = await radicarPqrsPublica(base, "10.0.0.1");
    expect(r.radicado).toMatch(/^\d{4}-0001$/);
    const t = await prisma.ticket.findFirstOrThrow({ where: { conjuntoId: conjunto.id, radicado: r.radicado! } });
    expect(t.origen).toBe("PUBLICO");
    expect(t.solicitanteId).toBeNull();
    expect(t.solicitanteEmail).toBe("marta@correo.co");
    expect(await prisma.correoSaliente.count({ where: { conjuntoId: conjunto.id, para: "marta@correo.co" } })).toBeGreaterThan(0);

    // Robots: campo trampa lleno o envío instantáneo → sin ticket
    expect((await radicarPqrsPublica({ ...base, sitio_web: "http://spam.example" }, "10.0.0.2")).radicado).toBeNull();
    expect((await radicarPqrsPublica({ ...base, ts: Date.now() }, "10.0.0.3")).radicado).toBeNull();
    expect(await prisma.ticket.count({ where: { conjuntoId: conjunto.id } })).toBe(1);

    // Validación y conjunto sin página pública
    await expect(radicarPqrsPublica({ ...base, acepta: "false" }, "10.0.0.4")).rejects.toThrow();
    await prisma.conjunto.update({ where: { id: conjunto.id }, data: { paginaPublica: false } });
    await expect(radicarPqrsPublica({ ...base, correo: "otro@correo.co" }, "10.0.0.5")).rejects.toThrow(/no recibe solicitudes/);
  });
});
