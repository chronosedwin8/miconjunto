import { registerExporter } from "@/lib/export/registry";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { listarContratos, listarProveedores } from "./service";

registerExporter("proveedores", {
  perm: "proveedores.ver",
  titulo: "Proveedores",
  columns: [
    { header: "NIT", key: "nit", width: 16 },
    { header: "Razón social", key: "razonSocial", width: 34 },
    { header: "Categoría", key: "categoria", width: 18 },
    { header: "Contacto", key: "contacto", width: 22 },
    { header: "Teléfono", key: "telefono" },
    { header: "Correo", key: "email", width: 26 },
    { header: "Calificación", key: "calificacion", tipo: "numero" },
    { header: "Directorio comunitario", key: "directorio" },
    { header: "Beneficio", key: "beneficio", width: 30 },
    { header: "Documentos vencidos", key: "docsVencidos", tipo: "numero" },
  ],
  rows: async (ctx, sp) => {
    const { items } = await listarProveedores(ctx, { q: sp.q, categoria: sp.categoria, directorio: sp.directorio, estado: sp.estado });
    return items.map((p) => ({
      nit: p.nit,
      razonSocial: p.razonSocial,
      categoria: p.categoria,
      contacto: p.contactoNombre,
      telefono: p.telefono,
      email: p.email,
      calificacion: toNumber(p.calificacionPromedio),
      directorio: p.directorioComunitario ? "Sí" : "No",
      beneficio: p.beneficioComunidad,
      docsVencidos: p.docsVencidos,
    }));
  },
});

registerExporter("contratos", {
  perm: "proveedores.ver",
  titulo: "Contratos con proveedores",
  columns: [
    { header: "Proveedor", key: "proveedor", width: 30 },
    { header: "NIT", key: "nit", width: 16 },
    { header: "Objeto", key: "objeto", width: 40 },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "Inicio", key: "inicio", tipo: "fecha" },
    { header: "Fin", key: "fin", tipo: "fecha" },
    { header: "Renovación automática", key: "renovacion" },
    { header: "Estado", key: "estado" },
  ],
  rows: async (ctx, sp) => {
    const rows = await listarContratos(ctx, { q: sp.q, estado: sp.estado });
    return rows.map((c) => ({
      proveedor: c.proveedor.razonSocial,
      nit: c.proveedor.nit,
      objeto: c.objeto,
      valor: toNumber(c.valor),
      inicio: c.inicio,
      fin: c.fin,
      renovacion: c.renovacionAutomatica ? "Sí" : "No",
      estado: label(c.estadoCalculado),
    }));
  },
});
