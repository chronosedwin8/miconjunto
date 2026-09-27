import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { listarDocumentos } from "./service";

registerExporter("documentos", {
  perm: ["documentos.crear", "documentos.editar"],
  titulo: "Documentos del conjunto",
  columns: [
    { header: "Título", key: "titulo", width: 40 },
    { header: "Categoría", key: "categoria", width: 22 },
    { header: "Carpeta", key: "carpeta", width: 22 },
    { header: "Versión", key: "version", tipo: "numero" },
    { header: "Visible para", key: "roles", width: 28 },
    { header: "Requiere acuse", key: "acuse" },
    { header: "Vence", key: "vence", tipo: "fecha" },
    { header: "Actualizado", key: "actualizado", tipo: "fecha" },
  ],
  rows: async (ctx, sp) => {
    const r = await listarDocumentos(ctx, { q: sp.q, carpetaId: sp.carpeta, categoria: sp.categoria, take: 5000 });
    return r.items.map((d) => ({
      titulo: d.titulo,
      categoria: label(d.categoria),
      carpeta: d.carpeta?.nombre ?? "",
      version: d.versionActual,
      roles: d.rolesVisibles.length ? d.rolesVisibles.map((x) => label(x)).join(", ") : "Todos",
      acuse: d.requiereAcuse ? "Sí" : "No",
      vence: d.vence,
      actualizado: d.updatedAt,
    }));
  },
});

registerExporter("campanas-correo", {
  perm: "comunicaciones.correo_masivo",
  titulo: "Campañas de correo",
  columns: [
    { header: "Asunto", key: "asunto", width: 40 },
    { header: "Tipo", key: "tipo", width: 22 },
    { header: "Estado", key: "estado" },
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Destinatarios", key: "total", tipo: "numero" },
    { header: "Enviados", key: "enviados", tipo: "numero" },
    { header: "Aperturas", key: "aperturas", tipo: "numero" },
    { header: "Clics", key: "clics", tipo: "numero" },
    { header: "Rebotes", key: "rebotes", tipo: "numero" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.campanaCorreo.findMany({
      where: { ...(sp.estado ? { estado: sp.estado as never } : {}), ...(sp.tipo ? { tipo: sp.tipo as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return rows.map((c) => ({
      asunto: c.asunto,
      tipo: label(c.tipo),
      estado: label(c.estado),
      fecha: c.programadaPara ?? c.createdAt,
      total: c.totalDestinatarios,
      enviados: c.enviados,
      aperturas: c.aperturas,
      clics: c.clics,
      rebotes: c.rebotes,
    }));
  },
});
