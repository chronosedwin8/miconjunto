import { registerExporter } from "@/lib/export/registry";
import { nowBogota, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { ejecucion, listarGastos } from "./service";

registerExporter("gastos", {
  perm: "presupuesto.ver",
  titulo: "Gastos del conjunto",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Descripción", key: "descripcion", width: 40 },
    { header: "Rubro", key: "rubro", width: 26 },
    { header: "Cuenta contable", key: "cuenta", width: 16 },
    { header: "Proveedor", key: "proveedor", width: 28 },
    { header: "NIT", key: "nit", width: 16 },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "Estado", key: "estado", width: 22 },
  ],
  rows: async (ctx, sp) => {
    const { items } = await listarGastos(ctx, { q: sp.q, estado: sp.estado, rubroId: sp.rubroId, proveedorId: sp.proveedorId, desde: sp.desde, hasta: sp.hasta, anio: sp.anio });
    return items.map((g) => ({
      fecha: g.fecha,
      descripcion: g.descripcion,
      rubro: g.rubro?.nombre ?? "",
      cuenta: g.cuentaContable ?? g.rubro?.cuentaContable ?? "",
      proveedor: g.proveedor?.razonSocial ?? "",
      nit: g.proveedor?.nit ?? "",
      valor: toNumber(g.valor),
      estado: label(g.estado),
    }));
  },
});

registerExporter("presupuesto", {
  perm: "presupuesto.ver",
  titulo: "Ejecución presupuestal",
  columns: [
    { header: "Tipo", key: "tipo" },
    { header: "Cuenta", key: "cuenta", width: 14 },
    { header: "Rubro", key: "rubro", width: 34 },
    { header: "Presupuesto anual", key: "presupuestado", tipo: "moneda", width: 20 },
    { header: "Presupuesto a la fecha", key: "aLaFecha", tipo: "moneda", width: 22 },
    { header: "Ejecutado", key: "ejecutado", tipo: "moneda", width: 18 },
    { header: "% ejecución anual", key: "pct", tipo: "numero", width: 18 },
    { header: "Diferencia", key: "diferencia", tipo: "moneda", width: 18 },
  ],
  rows: async (ctx, sp) => {
    const anio = Number(sp.anio) || nowBogota().year;
    const e = await ejecucion(ctx, anio);
    if (!e) return [];
    return e.filas.map((f) => ({
      tipo: label(f.tipo),
      cuenta: f.cuentaContable ?? "",
      rubro: f.nombre,
      presupuestado: toNumber(f.valorAnual),
      aLaFecha: f.presupuestadoALaFecha,
      ejecutado: f.ejecutado,
      pct: f.pct,
      diferencia: f.diferencia,
    }));
  },
});
