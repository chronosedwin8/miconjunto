import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { periodoActual, toNumber } from "@/lib/format";
import { reporteIngresosAlquiler, whereFacturasVisibles } from "./service";

registerExporter("ingresos-alquiler", {
  perm: "facturacion.exportar",
  titulo: "Ingresos por alquiler de zonas comunes (base gravable e IVA)",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Tipo", key: "tipo" },
    { header: "Zona / concepto", key: "zona", width: 28 },
    { header: "Unidad", key: "unidad" },
    { header: "Cliente", key: "cliente", width: 26 },
    { header: "Base gravable", key: "base", tipo: "moneda", width: 16 },
    { header: "IVA", key: "iva", tipo: "moneda" },
    { header: "Total", key: "total", tipo: "moneda" },
    { header: "Factura", key: "factura", width: 18 },
    { header: "Estado factura", key: "estadoFactura", width: 16 },
  ],
  rows: async (ctx, sp) => {
    const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : periodoActual();
    const r = await reporteIngresosAlquiler(ctx, mes);
    return [
      ...r.filas.map((f) => ({ ...f, tipo: f.tipo === "ALQUILER" ? "Alquiler" : "Nota crédito", estadoFactura: label(f.estadoFactura) })),
      { fecha: null, tipo: "TOTAL", zona: `Mes ${mes}`, unidad: "", cliente: "", base: r.totales.base, iva: r.totales.iva, total: r.totales.total, factura: "", estadoFactura: "" },
    ];
  },
});

registerExporter("facturas", {
  perm: ["facturacion.exportar", "facturacion.ver"],
  titulo: "Facturas electrónicas",
  columns: [
    { header: "Número", key: "numero", width: 18 },
    { header: "Tipo", key: "tipo" },
    { header: "Estado", key: "estado" },
    { header: "Proveedor", key: "proveedor" },
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Cliente", key: "cliente", width: 26 },
    { header: "Documento", key: "documento", width: 16 },
    { header: "Descripción", key: "descripcion", width: 40 },
    { header: "Base", key: "subtotal", tipo: "moneda" },
    { header: "IVA", key: "iva", tipo: "moneda" },
    { header: "Total", key: "total", tipo: "moneda" },
    { header: "CUFE", key: "cufe", width: 40 },
  ],
  rows: async (ctx, sp) => {
    const vis = await whereFacturasVisibles(ctx);
    const rows = await ctx.db.facturaElectronica.findMany({
      where: { ...vis, ...(sp.estado ? { estado: sp.estado as never } : {}), ...(sp.tipo ? { tipo: sp.tipo as never } : {}), ...(sp.q ? { OR: [{ numero: { contains: sp.q, mode: "insensitive" } }, { clienteNombre: { contains: sp.q, mode: "insensitive" } }] } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return rows.map((f) => ({
      numero: f.numero ?? f.referenceCode,
      tipo: label(f.tipo),
      estado: label(f.estado),
      proveedor: label(f.proveedor),
      fecha: f.validadaEn ?? f.createdAt,
      cliente: f.clienteNombre,
      documento: f.clienteDocumento,
      descripcion: f.descripcion,
      subtotal: toNumber(f.subtotal),
      iva: toNumber(f.iva),
      total: toNumber(f.total),
      cufe: f.cufe,
    }));
  },
});
