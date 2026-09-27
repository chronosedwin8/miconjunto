import { registerExporter } from "@/lib/export/registry";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { campanasCobro } from "./campana";

/** Exportaciones del módulo de pagos en línea. */

registerExporter("pagos-en-linea", {
  perm: "pagos.ver_todos",
  titulo: "Pagos en línea",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Unidad", key: "unidad" },
    { header: "Referencia", key: "referencia", width: 22 },
    { header: "Pasarela", key: "pasarela" },
    { header: "Medio", key: "medio" },
    { header: "Estado", key: "estado" },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "Recibo", key: "recibo", tipo: "numero" },
    { header: "Transacción", key: "externa", width: 24 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.pago.findMany({
      where: { pasarela: { in: ["WOMPI", "MERCADOPAGO", "SIMULADOR"] }, ...(sp.estado ? { estado: sp.estado as never } : {}) },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { fecha: "desc" },
      take: 5000,
    });
    return rows.map((p) => ({
      fecha: p.fecha,
      unidad: p.unidad.codigo,
      referencia: p.referencia,
      pasarela: label(p.pasarela),
      medio: label(p.medio),
      estado: label(p.estado),
      valor: toNumber(p.valor),
      recibo: p.numeroRecibo,
      externa: p.referenciaExterna,
    }));
  },
});

registerExporter("campanas-cobro", {
  perm: "cartera.gestionar_cobro",
  titulo: "Campañas de cobro",
  columns: [
    { header: "Creada", key: "creada", tipo: "fecha" },
    { header: "Asunto", key: "asunto", width: 36 },
    { header: "Estado", key: "estado" },
    { header: "Correos", key: "total", tipo: "numero" },
    { header: "Enviados", key: "enviados", tipo: "numero" },
    { header: "Aperturas", key: "aperturas", tipo: "numero" },
    { header: "Clics", key: "clics", tipo: "numero" },
    { header: "Pagos desde el link", key: "pagos", tipo: "numero" },
    { header: "Recaudado", key: "recaudado", tipo: "moneda" },
  ],
  rows: async (ctx) => (await campanasCobro(ctx, 200)).map((c) => ({ ...c, estado: label(c.estado) })),
});
