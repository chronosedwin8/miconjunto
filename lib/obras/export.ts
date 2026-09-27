import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { toNumber } from "@/lib/format";
import { contratistasDe, whereMudanzas, whereObras } from "./service";

registerExporter("obras", {
  perm: "obras.ver_todos",
  titulo: "Obras y remodelaciones",
  columns: [
    { header: "Unidad", key: "unidad" },
    { header: "Descripción", key: "descripcion", width: 40 },
    { header: "Inicio", key: "inicio", tipo: "fecha" },
    { header: "Fin", key: "fin", tipo: "fecha" },
    { header: "Horario", key: "horario", width: 26 },
    { header: "Contratistas", key: "contratistas", tipo: "numero" },
    { header: "Depósito", key: "deposito", tipo: "moneda" },
    { header: "Estado", key: "estado" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.solicitudObra.findMany({
      where: { AND: [whereObras(ctx), sp.estado ? { estado: sp.estado as never } : {}] },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { fechaInicio: "desc" },
    });
    return rows.map((o) => ({
      unidad: o.unidad.codigo,
      descripcion: o.descripcion,
      inicio: o.fechaInicio,
      fin: o.fechaFin,
      horario: o.horario,
      contratistas: contratistasDe(o.contratistas).length,
      deposito: toNumber(o.deposito),
      estado: label(o.estado),
    }));
  },
});

registerExporter("mudanzas", {
  perm: "obras.ver_todos",
  titulo: "Mudanzas",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Franja", key: "franja" },
    { header: "Unidad", key: "unidad" },
    { header: "Tipo", key: "tipo" },
    { header: "Recurso", key: "recurso", width: 20 },
    { header: "Empresa", key: "empresa", width: 22 },
    { header: "Placa", key: "placa" },
    { header: "Paz y salvo", key: "pys" },
    { header: "Estado", key: "estado" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.mudanza.findMany({
      where: { AND: [whereMudanzas(ctx), sp.estado ? { estado: sp.estado as never } : {}] },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { fecha: "desc" },
    });
    return rows.map((m) => ({
      fecha: m.fecha,
      franja: `${m.horaInicio}–${m.horaFin}`,
      unidad: m.unidad.codigo,
      tipo: label(m.tipo),
      recurso: m.recurso,
      empresa: m.empresa,
      placa: m.placaVehiculo,
      pys: m.pazYSalvoVerificado ? "Sí" : "No",
      estado: label(m.estado),
    }));
  },
});
