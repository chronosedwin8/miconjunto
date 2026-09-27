import { registerExporter } from "@/lib/export/registry";
import { can } from "@/lib/permisos";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { insensitive } from "@/lib/pagination";

registerExporter("unidades", {
  perm: "conjunto.ver",
  titulo: "Unidades del conjunto",
  columns: [
    { header: "Código", key: "codigo" },
    { header: "Torre", key: "torre" },
    { header: "Tipo", key: "tipo" },
    { header: "Piso", key: "piso", tipo: "numero" },
    { header: "Área privada m²", key: "area", tipo: "numero" },
    { header: "Coeficiente %", key: "coeficiente", tipo: "numero", width: 16 },
    { header: "Cuota administración", key: "cuota", tipo: "moneda", width: 20 },
    { header: "Ocupación", key: "ocupacion", width: 20 },
    { header: "Matrícula", key: "matricula" },
  ],
  rows: async (ctx, sp) => {
    const verFin = can(ctx, ["cartera.ver_todos", "campos.unidad_financiero"]);
    const rows = await ctx.db.unidad.findMany({
      where: {
        ...(sp.q ? { codigo: insensitive(sp.q) } : {}),
        ...(sp.torre ? { torreId: sp.torre === "casas" ? null : sp.torre } : {}),
        ...(sp.tipo ? { tipo: sp.tipo as never } : {}),
        ...(sp.ocupacion ? { estadoOcupacion: sp.ocupacion as never } : {}),
      },
      include: { torre: true },
      orderBy: [{ torreId: "asc" }, { codigo: "asc" }],
    });
    return rows.map((u) => ({
      codigo: u.codigo,
      torre: u.torre?.nombre ?? "",
      tipo: label(u.tipo),
      piso: u.piso,
      area: toNumber(u.areaPrivada),
      coeficiente: toNumber(u.coeficiente),
      cuota: verFin ? toNumber(u.cuotaAdministracion) : null,
      ocupacion: label(u.estadoOcupacion),
      matricula: u.matriculaInmobiliaria,
    }));
  },
});

registerExporter("parqueaderos", {
  perm: "conjunto.ver",
  titulo: "Parqueaderos",
  columns: [
    { header: "Código", key: "codigo" },
    { header: "Tipo", key: "tipo" },
    { header: "Ubicación", key: "ubicacion", width: 24 },
    { header: "Unidad", key: "unidad" },
    { header: "Estado", key: "estado" },
    { header: "Tarifa hora", key: "tarifa", tipo: "moneda" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.parqueadero.findMany({
      where: { ...(sp.tipo ? { tipo: sp.tipo as never } : {}), ...(sp.estado ? { estado: sp.estado as never } : {}), ...(sp.q ? { codigo: insensitive(sp.q) } : {}) },
      include: { unidad: true },
      orderBy: { codigo: "asc" },
    });
    return rows.map((p) => ({ codigo: p.codigo, tipo: label(p.tipo), ubicacion: p.ubicacion, unidad: p.unidad?.codigo ?? "", estado: label(p.estado), tarifa: p.tarifaHora ? toNumber(p.tarifaHora) : null }));
  },
});

registerExporter("bodegas", {
  perm: "conjunto.ver",
  titulo: "Bodegas",
  columns: [
    { header: "Código", key: "codigo" },
    { header: "Ubicación", key: "ubicacion" },
    { header: "Área m²", key: "area", tipo: "numero" },
    { header: "Unidad", key: "unidad" },
    { header: "Estado", key: "estado" },
  ],
  rows: async (ctx) => {
    const rows = await ctx.db.bodega.findMany({ include: { unidad: true }, orderBy: { codigo: "asc" } });
    return rows.map((b) => ({ codigo: b.codigo, ubicacion: b.ubicacion, area: toNumber(b.area), unidad: b.unidad?.codigo ?? "", estado: label(b.estado) }));
  },
});
