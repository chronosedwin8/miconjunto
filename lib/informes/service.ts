import type { Ctx } from "@/lib/auth/context";
import { notFound } from "@/lib/errors";
import { cop, nombreCompleto, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";

export type EventoHistorial = { fecha: Date; tipo: string; titulo: string; detalle?: string; href?: string };

/**
 * Historial de la unidad: línea de tiempo de propietarios, arrendatarios, pagos, multas, tickets,
 * reservas, obras, mudanzas, llamados de atención y cambios de coeficiente.
 */
export async function historialUnidad(ctx: Ctx, unidadId: string, verFinanciero: boolean) {
  const u = await ctx.db.unidad.findUnique({ where: { id: unidadId }, include: { torre: true } });
  if (!u) notFound("La unidad");
  const [vinculos, pagos, multas, tickets, reservas, obras, mudanzas, llamados, coef, paz] = await Promise.all([
    ctx.db.vinculoUnidad.findMany({ where: { unidadId, deletedAt: undefined }, include: { persona: true } }),
    verFinanciero ? ctx.db.pago.findMany({ where: { unidadId, estado: { in: ["APROBADO", "ANULADO"] } }, orderBy: { fecha: "desc" }, take: 200 }) : Promise.resolve([]),
    ctx.db.multa.findMany({ where: { unidadId } }),
    ctx.db.ticket.findMany({ where: { unidadId } }),
    ctx.db.reserva.findMany({ where: { unidadId }, include: { zona: true } }),
    ctx.db.solicitudObra.findMany({ where: { unidadId } }),
    ctx.db.mudanza.findMany({ where: { unidadId } }),
    ctx.db.llamadoAtencion.findMany({ where: { unidadId } }),
    ctx.db.historialCoeficiente.findMany({ where: { unidadId } }),
    ctx.db.certificadoPazYSalvo.findMany({ where: { unidadId } }),
  ]);
  const ev: EventoHistorial[] = [];
  for (const v of vinculos) {
    ev.push({ fecha: v.fechaInicio, tipo: "Vínculo", titulo: `${nombreCompleto(v.persona)} — ${label(v.tipo)}`, detalle: v.estado === "ACTIVO" ? "Vínculo vigente" : label(v.estado), href: `/residentes/${v.personaId}` });
    if (v.fechaFin) ev.push({ fecha: v.fechaFin, tipo: "Vínculo", titulo: `Fin del vínculo de ${nombreCompleto(v.persona)} (${label(v.tipo)})` });
  }
  for (const p of pagos) ev.push({ fecha: p.fecha, tipo: "Pago", titulo: `Pago ${cop(p.valor)} (${label(p.medio)})`, detalle: `${p.numeroRecibo ? `Recibo N.º ${p.numeroRecibo}` : ""} ${p.estado === "ANULADO" ? "· ANULADO" : ""}`.trim() });
  for (const m of multas) ev.push({ fecha: m.fecha, tipo: "Multa", titulo: `Multa ${cop(m.valor)} — ${label(m.estado)}`, detalle: m.descripcion });
  for (const t of tickets) ev.push({ fecha: t.createdAt, tipo: "PQRS", titulo: `${t.radicado} · ${t.titulo}`, detalle: `${label(t.tipo)} · ${label(t.estado)}`, href: `/tickets/${t.id}` });
  for (const r of reservas) ev.push({ fecha: r.inicio, tipo: "Reserva", titulo: `${r.zona.nombre}`, detalle: `${label(r.estado)}${toNumber(r.valor) > 0 && verFinanciero ? ` · ${cop(toNumber(r.valor) + toNumber(r.iva))}` : ""}` });
  for (const o of obras) ev.push({ fecha: o.fechaInicio, tipo: "Obra", titulo: o.descripcion.slice(0, 80), detalle: label(o.estado) });
  for (const m of mudanzas) ev.push({ fecha: m.fecha, tipo: "Mudanza", titulo: `Mudanza de ${m.tipo === "INGRESO" ? "ingreso" : "salida"}`, detalle: label(m.estado) });
  for (const l of llamados) ev.push({ fecha: l.fecha, tipo: "Convivencia", titulo: `Llamado de atención: ${l.motivo}`, detalle: label(l.estado) });
  for (const c of coef) ev.push({ fecha: c.createdAt, tipo: "Coeficiente", titulo: `Coeficiente ${toNumber(c.anterior)} % → ${toNumber(c.nuevo)} %`, detalle: c.motivo ?? undefined });
  for (const p of paz) ev.push({ fecha: p.fecha, tipo: "Paz y salvo", titulo: `Certificado ${p.codigo}`, detalle: label(p.estado) });
  ev.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  return { unidad: u, eventos: ev };
}

/**
 * Informe de gestión / empalme de administración (Ley 675: rendición de cuentas).
 * Consolida estructura, población, cartera, recaudo, PQRS, mantenimiento, contratos, asambleas y pendientes.
 */
export async function informeEmpalme(ctx: Ctx, desde: Date, hasta: Date) {
  const db = ctx.db;
  const rango = { gte: desde, lte: hasta };
  const [unidades, personas, vinculosArr, cuotasPend, pagos, ticketsPorEstado, ticketsAbiertos, ordenes, contratos, asambleas, multas, polizas, gastos, reservas, paquetes, novedades] = await Promise.all([
    db.unidad.count(),
    db.persona.count({ where: { anonimizada: false } }),
    db.unidad.groupBy({ by: ["estadoOcupacion"], _count: true }),
    db.cuota.aggregate({ where: { estado: { in: ["PENDIENTE", "PARCIAL", "EN_ACUERDO"] } }, _sum: { saldo: true }, _count: true }),
    db.pago.aggregate({ where: { estado: "APROBADO", fecha: rango }, _sum: { valor: true }, _count: true }),
    db.ticket.groupBy({ by: ["estado"], where: { createdAt: rango }, _count: true }),
    db.ticket.findMany({ where: { estado: { notIn: ["CERRADO", "RESUELTO"] } }, orderBy: { fechaLimite: "asc" }, take: 30 }),
    db.ordenTrabajo.groupBy({ by: ["estado"], where: { fechaProgramada: rango }, _count: true, _sum: { costo: true } }),
    db.contrato.findMany({ where: { estado: { in: ["VIGENTE", "POR_VENCER"] } }, include: { proveedor: true }, orderBy: { fin: "asc" } }),
    db.asamblea.findMany({ where: { fecha: rango }, orderBy: { fecha: "desc" } }),
    db.multa.groupBy({ by: ["estado"], where: { fecha: rango }, _count: true, _sum: { valor: true } }),
    db.documento.findMany({ where: { categoria: "POLIZA" }, orderBy: { vence: "asc" } }),
    db.gasto.aggregate({ where: { fecha: rango, estado: { in: ["APROBADO", "PAGADO"] } }, _sum: { valor: true }, _count: true }),
    db.reserva.count({ where: { inicio: rango } }),
    db.paquete.count({ where: { llegadaEn: rango } }),
    db.novedad.count({ where: { createdAt: rango } }),
  ]);
  const morosos = await db.cuota.groupBy({
    by: ["unidadId"],
    where: { estado: { in: ["PENDIENTE", "PARCIAL"] }, fechaVencimiento: { lt: new Date() } },
    _sum: { saldo: true },
    orderBy: { _sum: { saldo: "desc" } },
    take: 15,
  });
  const unidadesMorosas = await db.unidad.findMany({ where: { id: { in: morosos.map((m) => m.unidadId) } }, select: { id: true, codigo: true } });
  return {
    periodo: { desde, hasta },
    estructura: { unidades, personas, ocupacion: vinculosArr.map((v) => ({ estado: label(v.estadoOcupacion), total: v._count })) },
    cartera: {
      saldoPendiente: toNumber(cuotasPend._sum.saldo),
      cuotasPendientes: cuotasPend._count,
      topMorosos: morosos.map((m) => ({ unidad: unidadesMorosas.find((u) => u.id === m.unidadId)?.codigo ?? "", saldo: toNumber(m._sum.saldo) })),
    },
    recaudo: { total: toNumber(pagos._sum.valor), pagos: pagos._count },
    gastos: { total: toNumber(gastos._sum.valor), registros: gastos._count },
    pqrs: { porEstado: ticketsPorEstado.map((t) => ({ estado: label(t.estado), total: t._count })), abiertos: ticketsAbiertos.map((t) => ({ radicado: t.radicado, titulo: t.titulo, estado: label(t.estado), vence: t.fechaLimite })) },
    mantenimiento: ordenes.map((o) => ({ estado: label(o.estado), total: o._count, costo: toNumber(o._sum.costo) })),
    contratos: contratos.map((c) => ({ proveedor: c.proveedor.razonSocial, objeto: c.objeto, valor: toNumber(c.valor), fin: c.fin, estado: label(c.estado) })),
    polizas: polizas.map((p) => ({ titulo: p.titulo, vence: p.vence })),
    asambleas: asambleas.map((a) => ({ titulo: a.titulo, fecha: a.fecha, estado: label(a.estado), acta: a.actaCodigo })),
    convivencia: multas.map((m) => ({ estado: label(m.estado), total: m._count, valor: toNumber(m._sum.valor) })),
    operacion: { reservas, paquetes, novedades },
  };
}
export type InformeEmpalme = Awaited<ReturnType<typeof informeEmpalme>>;
