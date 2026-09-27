import { registerExporter } from "@/lib/export/registry";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { listarActivos } from "./service";

registerExporter("activos", {
  perm: "activos.ver",
  titulo: "Inventario de activos",
  columns: [
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Categoría", key: "categoria", width: 18 },
    { header: "Ubicación", key: "ubicacion", width: 24 },
    { header: "Marca", key: "marca" },
    { header: "Modelo", key: "modelo" },
    { header: "Serie", key: "serie" },
    { header: "Fecha de compra", key: "fechaCompra", tipo: "fecha" },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "Vida útil (años)", key: "vidaUtil", tipo: "numero" },
    { header: "Proveedor", key: "proveedor", width: 28 },
    { header: "Garantía vence", key: "garantia", tipo: "fecha" },
    { header: "Estado", key: "estado" },
    { header: "Código QR", key: "codigoQr", width: 28 },
  ],
  rows: async (ctx, sp) => {
    const { items } = await listarActivos(ctx, { q: sp.q, categoria: sp.categoria, estado: sp.estado });
    return items.map((a) => ({
      nombre: a.nombre,
      categoria: a.categoria,
      ubicacion: a.ubicacion ?? a.zona?.nombre ?? "",
      marca: a.marca,
      modelo: a.modelo,
      serie: a.serie,
      fechaCompra: a.fechaCompra,
      valor: a.valor ? toNumber(a.valor) : null,
      vidaUtil: a.vidaUtilAnios,
      proveedor: a.proveedor?.razonSocial ?? "",
      garantia: a.garantiaVence,
      estado: label(a.estado),
      codigoQr: a.codigoQr,
    }));
  },
});
