import { registerExporter } from "@/lib/export/registry";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { parseOpciones } from "@/lib/votaciones/calculos";

/** Exportaciones de gobierno: votaciones, asistencia y poderes de asambleas, respuestas de encuestas. */

registerExporter("votaciones", {
  perm: ["votaciones.crear", "asambleas.gestionar"],
  titulo: "Votaciones",
  columns: [
    { header: "Pregunta", key: "pregunta", width: 40 },
    { header: "Estado", key: "estado" },
    { header: "Mayoría", key: "mayoria", width: 18 },
    { header: "Ponderación", key: "ponderacion" },
    { header: "Secreta", key: "secreto" },
    { header: "Inicio", key: "inicio", tipo: "fecha" },
    { header: "Cierre", key: "fin", tipo: "fecha" },
    { header: "Votos", key: "votos", tipo: "numero" },
    { header: "Participación coef. %", key: "participacion", tipo: "numero", width: 20 },
    { header: "Decisión", key: "decision", width: 40 },
    { header: "Código acta", key: "codigo", width: 18 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.votacion.findMany({
      where: { ...(sp.estado ? { estado: sp.estado as never } : {}), ...(sp.asambleaId ? { asambleaId: sp.asambleaId } : {}) },
      include: { _count: { select: { votos: { where: { deletedAt: null } } } } },
      orderBy: { fin: "desc" },
    });
    return rows.map((v) => {
      const r = (v.resultado ?? {}) as { participacionCoeficiente?: number; decision?: string };
      return {
        pregunta: v.pregunta,
        estado: label(v.estado),
        mayoria: label(v.tipoMayoria),
        ponderacion: v.ponderacion === "UNIDAD" ? "Por unidad" : "Por coeficiente",
        secreto: v.secreto ? "Sí" : "No",
        inicio: v.inicio,
        fin: v.fin,
        votos: v._count.votos,
        participacion: r.participacionCoeficiente ?? null,
        decision: r.decision ?? "",
        codigo: v.codigoActa ?? "",
      };
    });
  },
});

registerExporter("votos", {
  perm: ["votaciones.crear", "asambleas.gestionar"],
  titulo: "Registro de votos",
  columns: [
    { header: "Unidad", key: "unidad" },
    { header: "Coeficiente %", key: "coeficiente", tipo: "numero" },
    { header: "Votante", key: "votante", width: 28 },
    { header: "Opción", key: "opcion", width: 24 },
    { header: "Por poder", key: "poder" },
    { header: "Emitido", key: "emitido", tipo: "fecha" },
    { header: "Comprobante", key: "comprobante", width: 66 },
  ],
  rows: async (ctx, sp) => {
    if (!sp.votacionId) return [];
    const v = await ctx.db.votacion.findUnique({ where: { id: sp.votacionId } });
    if (!v) return [];
    const opciones = parseOpciones(v.opciones);
    const votos = await ctx.db.voto.findMany({ where: { votacionId: v.id }, include: { unidad: { select: { codigo: true } } }, orderBy: { emitidoEn: "asc" } });
    return votos.map((x) => ({
      unidad: x.unidad.codigo,
      coeficiente: toNumber(x.coeficiente),
      votante: v.secreto ? "(secreto)" : (x.votanteNombre ?? ""),
      opcion: v.secreto ? "(secreto)" : (opciones.find((o) => o.id === x.opcionId)?.texto ?? x.opcionId),
      poder: x.porPoder ? "Sí" : "No",
      emitido: x.emitidoEn,
      comprobante: x.comprobanteHash,
    }));
  },
});

registerExporter("asistencia-asamblea", {
  perm: ["asambleas.gestionar", "asambleas.asistencia"],
  titulo: "Asistencia a la asamblea",
  columns: [
    { header: "Unidad", key: "unidad" },
    { header: "Asistente", key: "nombre", width: 30 },
    { header: "Tipo", key: "tipo" },
    { header: "Coeficiente %", key: "coeficiente", tipo: "numero" },
    { header: "Registro", key: "registro", tipo: "fecha" },
    { header: "Salida", key: "salida", tipo: "fecha" },
  ],
  rows: async (ctx, sp) => {
    if (!sp.asambleaId) return [];
    const rows = await ctx.db.asistenciaAsamblea.findMany({ where: { asambleaId: sp.asambleaId }, include: { unidad: { select: { codigo: true } } }, orderBy: { unidad: { codigo: "asc" } } });
    return rows.map((a) => ({ unidad: a.unidad.codigo, nombre: a.personaNombre ?? "", tipo: label(a.tipo), coeficiente: toNumber(a.coeficiente), registro: a.registradaEn, salida: a.salidaEn }));
  },
});

registerExporter("poderes-asamblea", {
  perm: ["asambleas.gestionar", "asambleas.poderes"],
  titulo: "Poderes de la asamblea",
  columns: [
    { header: "Otorgante", key: "otorgante", width: 28 },
    { header: "Apoderado", key: "apoderado", width: 28 },
    { header: "Documento", key: "documento" },
    { header: "Estado", key: "estado" },
    { header: "Registrado", key: "fecha", tipo: "fecha" },
  ],
  rows: async (ctx, sp) => {
    if (!sp.asambleaId) return [];
    const rows = await ctx.db.poderAsamblea.findMany({ where: { asambleaId: sp.asambleaId }, orderBy: { createdAt: "asc" } });
    return rows.map((p) => ({ otorgante: p.otorganteNombre, apoderado: p.apoderadoNombre, documento: p.apoderadoDocumento ?? "", estado: label(p.estado), fecha: p.createdAt }));
  },
});

registerExporter("encuesta-respuestas", {
  perm: "encuestas.resultados",
  titulo: "Respuestas de la encuesta",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Pregunta", key: "pregunta", width: 40 },
    { header: "Respuesta", key: "respuesta", width: 50 },
  ],
  rows: async (ctx, sp) => {
    if (!sp.encuestaId) return [];
    const preguntas = await ctx.db.preguntaEncuesta.findMany({ where: { encuestaId: sp.encuestaId }, orderBy: { orden: "asc" } });
    const resp = await ctx.db.respuestaEncuesta.findMany({ where: { encuestaId: sp.encuestaId }, orderBy: { createdAt: "asc" } });
    return resp.flatMap((r) =>
      preguntas.map((p) => {
        const v = (r.respuestas as Record<string, unknown>)[p.id];
        return { fecha: r.createdAt, pregunta: p.texto, respuesta: Array.isArray(v) ? v.join(", ") : v === undefined || v === null ? "" : String(v) };
      }),
    );
  },
});
