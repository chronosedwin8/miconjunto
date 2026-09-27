import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { nombreCompleto, toNumber } from "@/lib/format";
import { insensitive } from "@/lib/pagination";
import { whereLlamados, whereMultas } from "./service";

registerExporter("llamados", {
  perm: "convivencia.ver_todos",
  titulo: "Llamados de atención",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Unidad", key: "unidad" },
    { header: "Persona", key: "persona", width: 24 },
    { header: "Motivo", key: "motivo", width: 36 },
    { header: "Gravedad", key: "gravedad" },
    { header: "Estado", key: "estado", width: 18 },
    { header: "Leído", key: "acuse", tipo: "fecha" },
    { header: "Respondido", key: "respuesta", tipo: "fecha" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.llamadoAtencion.findMany({
      where: { AND: [whereLlamados(ctx), sp.estado ? { estado: sp.estado as never } : {}, sp.q ? { OR: [{ motivo: insensitive(sp.q) }, { unidad: { codigo: insensitive(sp.q) } }] } : {}] },
      include: { unidad: { select: { codigo: true } }, persona: { select: { nombres: true, apellidos: true } } },
      orderBy: { fecha: "desc" },
    });
    return rows.map((l) => ({
      fecha: l.fecha,
      unidad: l.unidad.codigo,
      persona: nombreCompleto(l.persona),
      motivo: l.motivo,
      gravedad: label(l.gravedad),
      estado: label(l.estado),
      acuse: l.acuseEn,
      respuesta: l.respuestaEn,
    }));
  },
});

registerExporter("multas", {
  perm: "convivencia.ver_todos",
  titulo: "Multas de convivencia",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Unidad", key: "unidad" },
    { header: "Descripción", key: "descripcion", width: 40 },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "Estado", key: "estado", width: 16 },
    { header: "Notificada", key: "notificada", tipo: "fecha" },
    { header: "Plazo descargos", key: "plazo", tipo: "fecha" },
    { header: "Decisión", key: "decision", tipo: "fecha" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.multa.findMany({
      where: { AND: [whereMultas(ctx), sp.estado ? { estado: sp.estado as never } : {}, sp.q ? { OR: [{ descripcion: insensitive(sp.q) }, { unidad: { codigo: insensitive(sp.q) } }] } : {}] },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { fecha: "desc" },
    });
    return rows.map((m) => ({
      fecha: m.fecha,
      unidad: m.unidad.codigo,
      descripcion: m.descripcion,
      valor: toNumber(m.valor),
      estado: label(m.estado),
      notificada: m.notificadaEn,
      plazo: m.plazoDescargos,
      decision: m.resolucionEn,
    }));
  },
});
