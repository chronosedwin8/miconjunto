import { registerExporter } from "@/lib/export/registry";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { listarOrdenes, listarPlanes } from "./service";

registerExporter("ordenes", {
  perm: "mantenimiento.ver",
  titulo: "Órdenes de trabajo",
  columns: [
    { header: "Número", key: "numero", tipo: "numero" },
    { header: "Título", key: "titulo", width: 36 },
    { header: "Origen", key: "origen" },
    { header: "Activo", key: "activo", width: 26 },
    { header: "Proveedor", key: "proveedor", width: 26 },
    { header: "Responsable", key: "responsable", width: 22 },
    { header: "Programada", key: "programada", tipo: "fecha" },
    { header: "Cierre", key: "cierre", tipo: "fecha" },
    { header: "Estado", key: "estado" },
    { header: "Costo", key: "costo", tipo: "moneda" },
  ],
  rows: async (ctx, sp) => {
    const { items } = await listarOrdenes(ctx, { q: sp.q, estado: sp.estado, origen: sp.origen, vista: sp.vista });
    return items.map((o) => ({
      numero: o.numero,
      titulo: o.titulo,
      origen: label(o.origen),
      activo: o.activo?.nombre ?? "",
      proveedor: o.proveedor?.razonSocial ?? "",
      responsable: o.asignadoNombre ?? "",
      programada: o.fechaProgramada,
      cierre: o.fechaCierre,
      estado: label(o.estado),
      costo: o.costo ? toNumber(o.costo) : null,
    }));
  },
});

registerExporter("planes-mantenimiento", {
  perm: ["mantenimiento.ver_todos", "mantenimiento.gestionar", "mantenimiento.crear"],
  titulo: "Plan de mantenimiento",
  columns: [
    { header: "Plan", key: "nombre", width: 36 },
    { header: "Tipo", key: "tipo" },
    { header: "Activo", key: "activo", width: 26 },
    { header: "Frecuencia (días)", key: "frecuencia", tipo: "numero" },
    { header: "Última ejecución", key: "ultima", tipo: "fecha" },
    { header: "Próxima fecha", key: "proxima", tipo: "fecha" },
    { header: "Proveedor", key: "proveedor", width: 26 },
    { header: "Responsable", key: "responsable", width: 22 },
    { header: "Costo estimado", key: "costo", tipo: "moneda" },
    { header: "Activo en plan", key: "activoPlan" },
  ],
  rows: async (ctx, sp) => {
    const planes = await listarPlanes(ctx, { q: sp.q, tipo: sp.tipo, estado: sp.estado });
    return planes.map((p) => ({
      nombre: p.nombre,
      tipo: label(p.tipo),
      activo: p.activo?.nombre ?? "",
      frecuencia: p.frecuenciaDias,
      ultima: p.ultimaEjecucion,
      proxima: p.proximaFecha,
      proveedor: p.proveedor?.razonSocial ?? "",
      responsable: p.responsableNombre ?? "",
      costo: p.costoEstimado ? toNumber(p.costoEstimado) : null,
      activoPlan: p.activoPlan ? "Sí" : "No",
    }));
  },
});
