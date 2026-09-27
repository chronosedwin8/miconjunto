import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { toNumber } from "@/lib/format";
import { whereReservas } from "./service";

registerExporter("reservas", {
  perm: ["reservas.ver_todos", "reservas.ver"],
  titulo: "Reservas de zonas comunes",
  columns: [
    { header: "Zona", key: "zona", width: 20 },
    { header: "Unidad", key: "unidad" },
    { header: "Inicio", key: "inicio", tipo: "fecha", width: 14 },
    { header: "Hora", key: "hora" },
    { header: "Estado", key: "estado", width: 16 },
    { header: "Asistentes", key: "asistentes", tipo: "numero" },
    { header: "Base", key: "base", tipo: "moneda" },
    { header: "IVA", key: "iva", tipo: "moneda" },
    { header: "Depósito", key: "deposito", tipo: "moneda" },
    { header: "Pagada", key: "pagada" },
    { header: "Calificación", key: "calificacion", tipo: "numero" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.reserva.findMany({
      where: whereReservas(ctx, { zona: sp.zona, estado: sp.estado, desde: sp.desde, hasta: sp.hasta, q: sp.q }),
      include: { zona: { select: { nombre: true } }, unidad: { select: { codigo: true } } },
      orderBy: { inicio: "desc" },
      take: 5000,
    });
    const hora = (d: Date) => d.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
    return rows.map((r) => ({
      zona: r.zona.nombre,
      unidad: r.unidad.codigo,
      inicio: r.inicio,
      hora: `${hora(r.inicio)}–${hora(r.fin)}`,
      estado: label(r.estado),
      asistentes: r.asistentes,
      base: toNumber(r.valor),
      iva: toNumber(r.iva),
      deposito: toNumber(r.deposito),
      pagada: r.pagada ? "Sí" : "No",
      calificacion: r.calificacion,
    }));
  },
});
