import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { withTenant } from "@/lib/db";
import { DEFAULT_ROLE_PERMS, type RolBase } from "@/lib/permisos";
import { reportarFallaActivo } from "@/lib/activos/service";
import { cerrarOrden, fichaOrden, generarOrdenesProgramadas, guardarOrden, listarOrdenes } from "@/lib/mantenimiento/service";
import { proximaFechaPlan } from "@/lib/mantenimiento/calculos";
import { toNumber } from "@/lib/format";
import { makeConjunto } from "../helpers/db";

const DIA = 86_400_000;

async function activoConPlan(conjuntoId: string, opts: { proximaEnDias: number; anticipacion?: number; frecuencia?: number; proveedorId?: string | null }) {
  const activo = await prisma.activo.create({ data: { conjuntoId, nombre: "Ascensor Torre 1", categoria: "Ascensor", ubicacion: "Torre 1" } });
  const plan = await prisma.planMantenimiento.create({
    data: {
      conjuntoId,
      activoId: activo.id,
      nombre: "Preventivo mensual ascensor",
      tipo: "PREVENTIVO",
      frecuenciaDias: opts.frecuencia ?? 30,
      proximaFecha: new Date(Date.now() + opts.proximaEnDias * DIA),
      diasAnticipacion: opts.anticipacion ?? 7,
      checklist: ["Revisar frenos", "Lubricar guías"],
      costoEstimado: 500000,
      proveedorId: opts.proveedorId ?? null,
    },
  });
  return { activo, plan };
}

async function usuarioConRol(conjuntoId: string, rolId: string, nombre: string) {
  const u = await prisma.usuario.create({ data: { email: `${nombre.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@prueba.co`, nombre } });
  await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId, rolId } });
  return u;
}

/** Contexto de un usuario con un rol base (sin next-auth): permisos por defecto del rol. */
function ctxDe(base: Ctx, userId: string, rol: RolBase): Ctx {
  return { ...base, userId, nombre: rol, esSuperAdmin: false, rolBase: rol, rolClave: rol, permisos: new Set(DEFAULT_ROLE_PERMS[rol]), db: withTenant(prisma, base.conjuntoId) };
}

describe("mantenimiento (integración)", () => {
  afterAll(() => prisma.$disconnect());

  it("el job genera la orden del plan una sola vez (no duplica)", async () => {
    const { ctx } = await makeConjunto("Mant job");
    const { plan } = await activoConPlan(ctx.conjuntoId, { proximaEnDias: 3, anticipacion: 7 });
    await activoConPlan(ctx.conjuntoId, { proximaEnDias: 30, anticipacion: 7 }); // aún no toca
    const primera = await generarOrdenesProgramadas(ctx);
    expect(primera).toHaveLength(1);
    const segunda = await generarOrdenesProgramadas(ctx);
    expect(segunda).toHaveLength(0);
    const ordenes = await prisma.ordenTrabajo.findMany({ where: { conjuntoId: ctx.conjuntoId } });
    expect(ordenes).toHaveLength(1);
    expect(ordenes[0]).toMatchObject({ planId: plan.id, origen: "PLAN", estado: "PENDIENTE", numero: 1 });
    expect(ordenes[0].checklist).toEqual([
      { item: "Revisar frenos", ok: false },
      { item: "Lubricar guías", ok: false },
    ]);
  });

  it("cerrar la orden de un plan actualiza última ejecución y próxima fecha, y crea el gasto por aprobar", async () => {
    const { ctx } = await makeConjunto("Mant cierre");
    const { plan, activo } = await activoConPlan(ctx.conjuntoId, { proximaEnDias: -2, frecuencia: 30 });
    const [orden] = await generarOrdenesProgramadas(ctx);
    const fechaCierre = new Date();
    const cerrada = await cerrarOrden(ctx, { id: orden.id, notasCierre: "Listo", costo: 650000, checklistCompleto: true, fechaCierre, evidencias: [`/api/files/${ctx.conjuntoId}/ordenes/a.jpg`, "/api/files/otro-conjunto/x.jpg"] });
    expect(cerrada.estado).toBe("COMPLETADA");
    expect(cerrada.evidencias).toEqual([`/api/files/${ctx.conjuntoId}/ordenes/a.jpg#despues`]);
    const p = await prisma.planMantenimiento.findUniqueOrThrow({ where: { id: plan.id } });
    expect(p.ultimaEjecucion?.toISOString()).toBe(fechaCierre.toISOString());
    expect(p.proximaFecha.toISOString()).toBe(proximaFechaPlan(fechaCierre, 30).toISOString());
    const gasto = await prisma.gasto.findFirstOrThrow({ where: { ordenTrabajoId: orden.id } });
    expect(gasto.estado).toBe("PENDIENTE_APROBACION");
    expect(toNumber(gasto.valor)).toBe(650000);
    // Tras el cierre el job ya no genera (la próxima fecha está a 30 días)
    expect(await generarOrdenesProgramadas(ctx)).toHaveLength(0);
    // Orden de un ticket: al cerrar, el ticket queda resuelto con comentario de sistema
    const ticket = await prisma.ticket.create({
      data: { conjuntoId: ctx.conjuntoId, radicado: "2026-9999", tipo: "DANO_ZONA_COMUN", activoId: activo.id, titulo: "Falla", descripcion: "No funciona", fechaLimite: new Date(Date.now() + DIA), estado: "ASIGNADO" },
    });
    const o2 = await guardarOrden(ctx, { titulo: "Correctivo", activoId: activo.id, fechaProgramada: new Date() });
    await prisma.ordenTrabajo.update({ where: { id: o2.id }, data: { ticketId: ticket.id, origen: "TICKET" } });
    await cerrarOrden(ctx, { id: o2.id, notasCierre: "Cambio de pieza" });
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id }, include: { comentarios: true } });
    expect(t.estado).toBe("RESUELTO");
    expect(t.resueltoEn).not.toBeNull();
    expect(t.comentarios.some((c) => c.tipo === "SISTEMA" && c.contenido.includes(`#${o2.numero}`))).toBe(true);
  });

  it("el proveedor y el técnico solo ven sus órdenes asignadas", async () => {
    const { ctx, roles } = await makeConjunto("Mant alcance");
    const uProv = await usuarioConRol(ctx.conjuntoId, roles.PROVEEDOR, "Proveedor");
    const uTec = await usuarioConRol(ctx.conjuntoId, roles.MANTENIMIENTO, "Tecnico");
    const proveedor = await prisma.proveedor.create({ data: { conjuntoId: ctx.conjuntoId, nit: "900123456-8", razonSocial: "Ascensores S.A.S.", categoria: "Ascensores", usuarioId: uProv.id } });
    const otro = await prisma.proveedor.create({ data: { conjuntoId: ctx.conjuntoId, nit: "800111222-3", razonSocial: "Otro", categoria: "Aseo" } });
    const oProv = await guardarOrden(ctx, { titulo: "Del proveedor", proveedorId: proveedor.id, fechaProgramada: new Date() });
    const oOtro = await guardarOrden(ctx, { titulo: "De otro proveedor", proveedorId: otro.id, fechaProgramada: new Date() });
    const oTec = await guardarOrden(ctx, { titulo: "Del técnico", asignadoAId: uTec.id, fechaProgramada: new Date() });

    const ctxProv = ctxDe(ctx, uProv.id, "PROVEEDOR");
    const vistas = await listarOrdenes(ctxProv, { vista: "todas" });
    expect(vistas.items.map((o) => o.id)).toEqual([oProv.id]);
    await expect(fichaOrden(ctxProv, oOtro.id)).rejects.toThrow(/no existe/);
    await expect(cerrarOrden(ctxProv, { id: oOtro.id })).rejects.toThrow(/no existe/);
    const cerrada = await cerrarOrden(ctxProv, { id: oProv.id, notasCierre: "Hecho" });
    expect(cerrada.estado).toBe("COMPLETADA");

    const ctxTec = ctxDe(ctx, uTec.id, "MANTENIMIENTO");
    const delTec = await listarOrdenes(ctxTec, { vista: "todas" });
    expect(delTec.items.map((o) => o.id)).toEqual([oTec.id]);

    const todas = await listarOrdenes(ctx, { vista: "todas" });
    expect(todas.total).toBe(3);
  });

  it("reportar falla por QR crea un ticket de daño con el activo y origen ACTIVO_QR", async () => {
    const { ctx, roles } = await makeConjunto("Mant QR");
    const u = await usuarioConRol(ctx.conjuntoId, roles.RESIDENTE, "Residente");
    const activo = await prisma.activo.create({ data: { conjuntoId: ctx.conjuntoId, nombre: "Motobomba 1", categoria: "Motobomba", ubicacion: "Cuarto de bombas" } });
    const ctxRes = ctxDe(ctx, u.id, "RESIDENTE");
    const antes = Date.now();
    const r = await reportarFallaActivo(ctxRes, { codigoQr: activo.codigoQr, descripcion: "Hace ruido y no bombea", prioridad: "ALTA", fotos: [] });
    expect(r.radicado).toMatch(/^\d{4}-\d{4}$/);
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: r.id } });
    expect(t).toMatchObject({ activoId: activo.id, origen: "ACTIVO_QR", tipo: "DANO_ZONA_COMUN", prioridad: "ALTA", estado: "ABIERTO", solicitanteId: u.id, ubicacion: "Cuarto de bombas" });
    const dias = (t.fechaLimite.getTime() - antes) / DIA;
    expect(dias).toBeGreaterThan(2.9);
    expect(dias).toBeLessThan(3.1);
    // Un código de otro conjunto no crea nada
    await expect(reportarFallaActivo(ctxRes, { codigoQr: "no-existe", descripcion: "x", prioridad: "MEDIA", fotos: [] })).rejects.toThrow(/no corresponde/);
  });
});
