import * as React from "react";
import QRCode from "qrcode";
import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import type { Ctx } from "@/lib/auth/context";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notificaciones";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { saveFile } from "@/lib/storage";
import { fecha, fechaHora, num } from "@/lib/format";
import { PdfFooter, PdfHeader, PdfQr, PdfTable, pdfStyles, renderPdf } from "@/lib/pdf/kit";
import { codigoVerificacion, parseCompromisos } from "@/lib/votaciones/calculos";
import { obtenerAsamblea, propietariosDestinatarios, quorumAsamblea } from "./service";

/** Renderiza el texto del acta (subconjunto de Markdown: #, ##, ###, "- ") como bloques PDF. */
function Cuerpo({ texto }: { texto: string }) {
  return (
    <>
      {texto.split("\n").map((l, i) => {
        const t = l.trimEnd();
        if (!t.trim()) return <View key={i} style={{ height: 4 }} />;
        if (t.startsWith("# ")) return <Text key={i} style={[pdfStyles.title, { textAlign: "center" }]}>{t.slice(2)}</Text>;
        if (t.startsWith("## ")) return <Text key={i} style={pdfStyles.h2}>{t.slice(3)}</Text>;
        if (t.startsWith("### ")) return <Text key={i} style={[pdfStyles.bold, { marginTop: 6, marginBottom: 2 }]}>{t.slice(4)}</Text>;
        if (t.startsWith("- ")) return <Text key={i} style={[pdfStyles.p, { marginLeft: 10 }]}>• {t.slice(2)}</Text>;
        return <Text key={i} style={pdfStyles.p}>{t}</Text>;
      })}
    </>
  );
}

function Firma({ src, nombre, cargo }: { src: string | null; nombre: string | null; cargo: string }) {
  return (
    <View style={{ width: "45%", alignItems: "center" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      {src ? <Image src={src} style={{ height: 55, objectFit: "contain", marginBottom: 2 }} /> : <View style={{ height: 55 }} />}
      <View style={{ borderTopWidth: 0.8, borderTopColor: "#18181b", width: "100%", paddingTop: 3, alignItems: "center" }}>
        <Text style={pdfStyles.bold}>{nombre ?? "—"}</Text>
        <Text style={pdfStyles.muted}>{cargo}</Text>
      </View>
    </View>
  );
}

export async function actaAsambleaPdf(ctx: Ctx, asambleaId: string) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  const [conjunto, q, asist, votaciones] = await Promise.all([
    prisma.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } }),
    quorumAsamblea(ctx, a),
    ctx.db.asistenciaAsamblea.findMany({ where: { asambleaId }, include: { unidad: { select: { codigo: true } } }, orderBy: { unidad: { codigo: "asc" } } }),
    ctx.db.votacion.findMany({ where: { asambleaId, estado: "CERRADA" }, orderBy: { puntoOrden: "asc" } }),
  ]);
  const compromisos = parseCompromisos(a.compromisos);
  const verif = a.actaCodigo ? appUrl(`/verificar/${a.actaCodigo}`) : null;
  const qr = verif ? await QRCode.toDataURL(verif, { margin: 1, width: 240 }) : null;

  const doc = (
    <Document title={`Acta — ${a.titulo}`} author="MiConjunto">
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          conjunto={conjunto}
          derecha={
            <>
              <Text style={pdfStyles.bold}>ACTA DE ASAMBLEA</Text>
              <Text style={pdfStyles.muted}>{a.actaCodigo ?? "BORRADOR — sin publicar"}</Text>
              <Text style={pdfStyles.muted}>{fecha(a.fecha)}</Text>
            </>
          }
        />
        <Cuerpo texto={a.actaTexto ?? "(Acta sin redactar)"} />

        <Text style={pdfStyles.h2}>Anexo 1. Resumen de votaciones</Text>
        <PdfTable
          columns={[
            { header: "Punto", key: "punto", width: 8 },
            { header: "Pregunta", key: "pregunta", width: 38 },
            { header: "Participación", key: "part", width: 16, align: "right" },
            { header: "Decisión", key: "decision", width: 24 },
            { header: "Código", key: "codigo", width: 14 },
          ]}
          rows={votaciones.map((v) => {
            const r = (v.resultado ?? {}) as { participacionCoeficiente?: number; decision?: string; aprobada?: boolean };
            return {
              punto: v.puntoOrden ? String(v.puntoOrden) : "",
              pregunta: v.pregunta,
              part: `${num(r.participacionCoeficiente ?? 0)} % coef.`,
              decision: r.aprobada ? "Aprobada" : "No aprobada",
              codigo: v.codigoActa ?? "",
            };
          })}
        />

        <Text style={pdfStyles.h2}>Anexo 2. Registro de asistencia ({q.unidadesPresentes} unidades · {num(q.porcentaje, 4)} % de coeficientes)</Text>
        <PdfTable
          columns={[
            { header: "Unidad", key: "unidad", width: 15 },
            { header: "Asistente", key: "nombre", width: 40 },
            { header: "Tipo", key: "tipo", width: 15 },
            { header: "Coeficiente", key: "coef", width: 15, align: "right" },
            { header: "Registro", key: "hora", width: 15 },
          ]}
          rows={asist.map((x) => ({
            unidad: x.unidad.codigo,
            nombre: x.personaNombre ?? "",
            tipo: x.tipo === "PODER" ? "Poder" : x.tipo === "VIRTUAL" ? "Virtual" : "Presencial",
            coef: num(x.coeficiente, 4),
            hora: x.salidaEn ? `Salió ${fechaHora(x.salidaEn).slice(11)}` : fechaHora(x.registradaEn).slice(11),
          }))}
        />

        {compromisos.length ? (
          <>
            <Text style={pdfStyles.h2}>Anexo 3. Compromisos</Text>
            <PdfTable
              columns={[
                { header: "Tarea", key: "tarea", width: 50 },
                { header: "Responsable", key: "responsable", width: 25 },
                { header: "Fecha", key: "fecha", width: 25 },
              ]}
              rows={compromisos.map((c) => ({ tarea: c.tarea, responsable: c.responsable, fecha: c.fecha ?? "" }))}
            />
          </>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 28 }} wrap={false}>
          <Firma src={a.firmaPresidente} nombre={a.presidenteNombre} cargo="Presidente de la asamblea" />
          <Firma src={a.firmaSecretario} nombre={a.secretarioNombre} cargo="Secretario de la asamblea" />
        </View>

        {qr && verif ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }} wrap={false}>
            <PdfQr dataUrl={qr} size={80} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={pdfStyles.bold}>Código de verificación: {a.actaCodigo}</Text>
              <Text style={pdfStyles.muted}>Verifica la autenticidad de esta acta en {verif}</Text>
            </View>
          </View>
        ) : null}
        <PdfFooter texto={`${conjunto.nombre} · Acta generada por MiConjunto`} />
      </Page>
    </Document>
  );
  return { buffer: await renderPdf(doc), nombre: `acta-${a.actaCodigo ?? a.id}.pdf` };
}

/**
 * Publica el acta firmada: asigna el código de verificación, genera el PDF con QR, lo guarda en el
 * almacenamiento y crea el Documento (categoría ACTA) con su versión en la gestión documental. Si ya
 * estaba publicada, agrega una versión nueva al mismo documento.
 */
export async function publicarActa(ctx: Ctx, asambleaId: string) {
  const a = await obtenerAsamblea(ctx, asambleaId);
  if (a.estado !== "FINALIZADA") throw new AppError("Finaliza la asamblea antes de publicar el acta.");
  if (!a.actaTexto?.trim()) throw new AppError("El acta está vacía.");
  if (!a.firmaPresidente || !a.firmaSecretario) throw new AppError("El acta debe estar firmada por el presidente y el secretario antes de publicarla.");
  let codigo = a.actaCodigo;
  for (let i = 0; !codigo && i < 5; i++) {
    const c = codigoVerificacion("ACT");
    if (!(await prisma.asamblea.findUnique({ where: { actaCodigo: c } }))) codigo = c;
  }
  if (!a.actaCodigo) await ctx.db.asamblea.update({ where: { id: a.id }, data: { actaCodigo: codigo } });
  const pdf = await actaAsambleaPdf(ctx, asambleaId);
  const saved = await saveFile({ conjuntoId: ctx.conjuntoId, folder: "actas", body: Buffer.from(pdf.buffer), filename: pdf.nombre, mime: "application/pdf" });

  const marca = `Código de verificación ${codigo}`;
  const existente = await ctx.db.documento.findFirst({ where: { categoria: "ACTA", descripcion: { contains: marca } } });
  const carpeta = await ctx.db.carpetaDocumento.findFirst({ where: { nombre: { contains: "Acta", mode: "insensitive" } } });
  let documentoId: string;
  let version = 1;
  if (existente) {
    version = existente.versionActual + 1;
    await ctx.db.documento.update({ where: { id: existente.id }, data: { versionActual: version, publicado: true } });
    documentoId = existente.id;
  } else {
    const d = await ctx.db.documento.create({
      data: {
        conjuntoId: ctx.conjuntoId,
        carpetaId: carpeta?.id ?? null,
        titulo: `Acta — ${a.titulo} (${fecha(a.fecha)})`,
        descripcion: `Acta de la asamblea general ${a.tipo === "ORDINARIA" ? "ordinaria" : "extraordinaria"} de copropietarios. ${marca}.`,
        categoria: "ACTA",
        rolesVisibles: [],
        publicado: true,
        versionActual: 1,
      },
    });
    documentoId = d.id;
  }
  await ctx.db.versionDocumento.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      documentoId,
      version,
      archivoUrl: saved.url,
      nombreArchivo: pdf.nombre,
      mime: "application/pdf",
      tamano: pdf.buffer.length,
      subidoPorId: ctx.userId.startsWith("sistema") ? null : ctx.userId,
      notas: version > 1 ? "Nueva versión del acta publicada" : "Acta firmada y publicada",
      textoExtraido: a.actaTexto.slice(0, 50_000),
    },
  });
  await ctx.db.asamblea.update({ where: { id: a.id }, data: { actaPublicadaEn: new Date() } });
  await audit(ctx, "publicar_acta", "Asamblea", a.id, undefined, { actaCodigo: codigo, documentoId, version, archivo: saved.url });
  await emit({ tipo: "asamblea.acta_publicada", conjuntoId: ctx.conjuntoId, data: { id: a.id, actaCodigo: codigo, documentoId }, actorId: ctx.userId });
  const dest = await propietariosDestinatarios(ctx.conjuntoId);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: dest.usuarioIds, titulo: "Acta de asamblea publicada", cuerpo: `Ya puedes consultar el acta de «${a.titulo}».`, enlace: `/asambleas/${a.id}`, tipo: "ASAMBLEA", canales: ["push"] });
  return { actaCodigo: codigo!, documentoId, archivoUrl: saved.url, version };
}
