import { registerExporter } from "@/lib/export/registry";
import { fechaHora, parseLocal, addDays, startOfDayBogota } from "@/lib/format";
import { label } from "@/lib/labels";
import { idsAnulados, whereBitacora } from "./service";
import { wherePaquetes } from "@/lib/paqueteria/service";
import { diasEnPorteria } from "./reglas";

/** Exportaciones de portería: bitácora (con anulaciones), paquetes y novedades. */

function filtrosBitacora(sp: Record<string, string | undefined>) {
  const filtrado = ["q", "tipo", "sujeto", "medio", "unidad", "desde", "hasta"].some((k) => sp[k]);
  return {
    tipo: sp.tipo,
    sujeto: sp.sujeto,
    medio: sp.medio,
    unidad: sp.unidad,
    q: sp.q,
    // Sin filtros se exporta lo de hoy (igual que la pantalla)
    desde: sp.desde ? parseLocal(sp.desde) : filtrado ? null : startOfDayBogota(),
    hasta: sp.hasta ? addDays(parseLocal(sp.hasta), 1) : null,
  };
}

registerExporter("bitacora", {
  perm: ["porteria.bitacora", "porteria.ver"],
  titulo: "Bitácora de portería",
  columns: [
    { header: "Fecha y hora", key: "hora", width: 18 },
    { header: "Tipo", key: "tipo" },
    { header: "Sujeto", key: "sujeto" },
    { header: "Nombre", key: "nombre", width: 28 },
    { header: "Unidad", key: "unidad" },
    { header: "Medio", key: "medio", width: 18 },
    { header: "Placa", key: "placa" },
    { header: "Portero", key: "portero", width: 22 },
    { header: "Estado", key: "estado" },
    { header: "Observaciones", key: "obs", width: 40 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.registroAcceso.findMany({
      where: whereBitacora(filtrosBitacora(sp)),
      include: { unidad: { select: { codigo: true } }, portero: { select: { nombre: true } } },
      orderBy: { hora: "desc" },
      take: 5000,
    });
    const anulados = await idsAnulados(ctx, rows.map((r) => r.id));
    return rows.map((r) => ({
      hora: fechaHora(r.hora),
      tipo: label(r.tipo),
      sujeto: label(r.sujeto),
      nombre: r.nombre,
      unidad: r.unidad?.codigo ?? "",
      medio: label(r.medio),
      placa: r.placa ?? "",
      portero: r.portero?.nombre ?? "",
      estado: anulados.has(r.id) ? "Anulado" : "Vigente",
      obs: r.observaciones ?? "",
    }));
  },
});

registerExporter("paquetes", {
  perm: ["paqueteria.ver_todos"],
  titulo: "Paquetes en portería",
  columns: [
    { header: "Llegada", key: "llegada", width: 18 },
    { header: "Unidad", key: "unidad" },
    { header: "Tipo", key: "tipo" },
    { header: "Transportadora", key: "transportadora", width: 18 },
    { header: "Guía", key: "guia", width: 18 },
    { header: "Destinatario", key: "destinatario", width: 22 },
    { header: "Estado", key: "estado" },
    { header: "Días", key: "dias", tipo: "numero" },
    { header: "Entregado", key: "entregado", width: 18 },
    { header: "Recogió", key: "recogio", width: 22 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.paquete.findMany({
      where: wherePaquetes(ctx, { estado: sp.estado, q: sp.q, vencidos: sp.vencidos === "1" }),
      include: { unidad: { select: { codigo: true } } },
      orderBy: { llegadaEn: "desc" },
      take: 5000,
    });
    return rows.map((p) => ({
      llegada: fechaHora(p.llegadaEn),
      unidad: p.unidad.codigo,
      tipo: label(p.tipo),
      transportadora: p.transportadora ?? "",
      guia: p.guia ?? "",
      destinatario: p.destinatario ?? "",
      estado: label(p.estado),
      dias: p.estado === "EN_PORTERIA" ? diasEnPorteria(p.llegadaEn) : null,
      entregado: p.entregadoEn ? fechaHora(p.entregadoEn) : "",
      recogio: p.recogidoPor ?? "",
    }));
  },
});

registerExporter("novedades", {
  perm: ["porteria.novedades", "porteria.bitacora"],
  titulo: "Novedades de portería",
  columns: [
    { header: "Fecha", key: "fecha", width: 18 },
    { header: "Tipo", key: "tipo" },
    { header: "Severidad", key: "severidad" },
    { header: "Descripción", key: "descripcion", width: 60 },
    { header: "Notificada", key: "notificada" },
    { header: "Ticket", key: "ticket" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.novedad.findMany({
      where: { ...(sp.tipo ? { tipo: sp.tipo as never } : {}), ...(sp.severidad ? { severidad: sp.severidad as never } : {}), ...(sp.q ? { descripcion: { contains: sp.q, mode: "insensitive" } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return rows.map((n) => ({ fecha: fechaHora(n.createdAt), tipo: label(n.tipo), severidad: label(n.severidad), descripcion: n.descripcion, notificada: n.notificada ? "Sí" : "No", ticket: n.ticketId ? "Sí" : "" }));
  },
});
