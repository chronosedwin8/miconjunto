import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { estadoSla } from "./reglas";
import { whereFiltros } from "./service";

registerExporter("tickets", {
  perm: ["tickets.exportar", "tickets.ver_todos"],
  titulo: "PQRS y tickets",
  columns: [
    { header: "Radicado", key: "radicado", width: 12 },
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Tipo", key: "tipo", width: 20 },
    { header: "Título", key: "titulo", width: 40 },
    { header: "Unidad", key: "unidad" },
    { header: "Zona", key: "zona", width: 18 },
    { header: "Prioridad", key: "prioridad" },
    { header: "Estado", key: "estado", width: 20 },
    { header: "Asignado a", key: "asignado", width: 22 },
    { header: "Fecha límite", key: "limite", tipo: "fecha" },
    { header: "SLA", key: "sla" },
    { header: "Resuelto", key: "resuelto", tipo: "fecha" },
    { header: "Calificación", key: "calificacion", tipo: "numero" },
    { header: "Origen", key: "origen" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.ticket.findMany({
      where: whereFiltros(ctx, sp),
      include: { unidad: { select: { codigo: true } }, zona: { select: { nombre: true } }, asignadoA: { select: { nombre: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return rows.map((t) => ({
      radicado: t.radicado,
      fecha: t.createdAt,
      tipo: label(t.tipo),
      titulo: t.titulo,
      unidad: t.unidad?.codigo ?? "",
      zona: t.zona?.nombre ?? "",
      prioridad: label(t.prioridad),
      estado: label(t.estado),
      asignado: t.asignadoA?.nombre ?? "",
      limite: t.fechaLimite,
      sla: label(estadoSla(t)),
      resuelto: t.resueltoEn,
      calificacion: t.calificacion,
      origen: label(t.origen),
    }));
  },
});
