import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { categoriaLabel } from "./reglas";
import { tituloDe, whereObjetos } from "./service";

/** Exportación para gestión (portería/administración). No incluye rasgos privados ni firmas. */
registerExporter("objetos-perdidos", {
  perm: "objetos.gestionar",
  titulo: "Objetos perdidos y encontrados",
  columns: [
    { header: "Código", key: "codigo" },
    { header: "Tipo", key: "tipo" },
    { header: "Categoría", key: "categoria" },
    { header: "Objeto", key: "titulo", width: 32 },
    { header: "Color", key: "color" },
    { header: "Marca", key: "marca" },
    { header: "Lugar", key: "lugar", width: 24 },
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Estado", key: "estado" },
    { header: "Custodia", key: "custodia", width: 22 },
    { header: "Recibido", key: "recibido", tipo: "fecha" },
    { header: "Entregado a", key: "entregadoA", width: 26 },
    { header: "Entregado", key: "entregado", tipo: "fecha" },
    { header: "Disposición", key: "disposicion", width: 30 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.objetoPerdido.findMany({
      where: whereObjetos(ctx, { vista: sp.vista ?? "abiertos", q: sp.q, categoria: sp.categoria, estado: sp.estado, zonaId: sp.zonaId, dias: Number(sp.dias) || null }),
      orderBy: { fecha: "desc" },
      take: 5000,
    });
    return rows.map((o) => ({
      codigo: o.codigo,
      tipo: o.tipo === "PERDIDO" ? "Perdido" : "Encontrado",
      categoria: categoriaLabel(o.categoria),
      titulo: tituloDe(o),
      color: o.color,
      marca: o.marca,
      lugar: o.lugar,
      fecha: o.fecha,
      estado: label(o.estado),
      custodia: o.custodia,
      recibido: o.recibidoEn,
      entregadoA: o.entregadoA,
      entregado: o.entregadoEn,
      disposicion: o.disposicion,
    }));
  },
});
