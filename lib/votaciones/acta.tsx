import * as React from "react";
import QRCode from "qrcode";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { fechaHora, num } from "@/lib/format";
import { label } from "@/lib/labels";
import { PdfFooter, PdfHeader, PdfQr, PdfTable, pdfStyles, renderPdf } from "@/lib/pdf/kit";
import { detalleVotos, obtenerVotacion, resultadosVotacion } from "./service";
import { MAYORIA_TEXTO, PONDERACION_TEXTO, QUIEN_VOTA_TEXTO } from "./textos";

/** Acta PDF de resultados de una votación con participación por coeficiente y QR de verificación. */
export async function actaVotacionPdf(ctx: Ctx, id: string) {
  const v = await obtenerVotacion(ctx, id);
  const [r, votos, conjunto] = await Promise.all([
    resultadosVotacion(ctx, v),
    detalleVotos(ctx, v),
    prisma.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } }),
  ]);
  const verificacion = v.codigoActa ? appUrl(`/verificar/${v.codigoActa}`) : null;
  const qr = verificacion ? await QRCode.toDataURL(verificacion, { margin: 1, width: 240 }) : null;

  const doc = (
    <Document title={`Acta de votación — ${v.pregunta}`} author="MiConjunto">
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          conjunto={conjunto}
          derecha={
            <>
              <Text style={pdfStyles.bold}>ACTA DE RESULTADOS</Text>
              <Text style={pdfStyles.muted}>{v.codigoActa ?? "Resultado parcial (votación abierta)"}</Text>
            </>
          }
        />
        <Text style={pdfStyles.title}>{v.pregunta}</Text>
        {v.descripcion ? <Text style={pdfStyles.p}>{v.descripcion}</Text> : null}
        {v.asamblea ? <Text style={pdfStyles.p}>Asamblea: {v.asamblea.titulo}{v.puntoOrden ? ` · punto ${v.puntoOrden} del orden del día` : ""}</Text> : null}

        <View style={pdfStyles.box}>
          <Text style={pdfStyles.p}>Estado: {label(v.estado)} · Abierta: {fechaHora(v.inicio)} · Cierre: {fechaHora(v.fin)}</Text>
          <Text style={pdfStyles.p}>Mayoría exigida: {MAYORIA_TEXTO[v.tipoMayoria]} · Ponderación: {PONDERACION_TEXTO[v.ponderacion]}</Text>
          <Text style={pdfStyles.p}>Pueden votar: {QUIEN_VOTA_TEXTO[v.quienVota]} · Voto {v.secreto ? "secreto" : "nominal"}</Text>
          <Text style={pdfStyles.p}>
            Participación: {r.totalVotos} de {r.totalUnidades} unidades ({num(r.participacionUnidades)} %) · {num(r.coeficienteVotante, 4)} de {num(r.totalCoeficientes, 4)} puntos de coeficiente ({num(r.participacionCoeficiente)} %)
          </Text>
          {r.presentes ? <Text style={pdfStyles.p}>Representado en la sesión: {num(r.presentes.coeficiente, 4)} % de coeficientes · {r.presentes.unidades} unidades</Text> : null}
          <Text style={pdfStyles.p}>Base de la mayoría: {r.base.descripcion} ({num(r.base.peso, 4)}) · Regla: {r.base.regla}</Text>
        </View>

        <Text style={pdfStyles.h2}>Resultados por opción</Text>
        <PdfTable
          columns={[
            { header: "Opción", key: "texto", width: 34 },
            { header: "Votos", key: "votos", width: 11, align: "right" },
            { header: "Coeficiente", key: "coef", width: 17, align: "right" },
            { header: "% del total", key: "pctCoef", width: 19, align: "right" },
            { header: "% emitido", key: "pctPart", width: 19, align: "right" },
          ]}
          rows={r.opciones.map((o) => ({
            texto: o.texto,
            votos: String(o.votos),
            coef: num(o.coeficiente, 4),
            pctCoef: `${num(o.pctCoeficiente)} %`,
            pctPart: `${num(o.pctParticipacion)} %`,
          }))}
        />
        <View style={[pdfStyles.box, { marginTop: 10 }]}>
          <Text style={pdfStyles.bold}>{r.decision}</Text>
          <Text style={pdfStyles.muted}>{r.aprobada ? "La opción ganadora alcanzó la mayoría exigida." : "No se alcanzó la mayoría exigida."}</Text>
        </View>

        <Text style={pdfStyles.h2}>Registro de votos {v.secreto ? "(voto secreto: no se revela la opción de cada unidad)" : ""}</Text>
        <PdfTable
          columns={
            v.secreto
              ? [
                  { header: "Unidad", key: "unidad", width: 14 },
                  { header: "Coef.", key: "coef", width: 11, align: "right" },
                  { header: "Poder", key: "poder", width: 9 },
                  { header: "Hora", key: "hora", width: 18 },
                  { header: "Comprobante", key: "comp", width: 48 },
                ]
              : [
                  { header: "Unidad", key: "unidad", width: 12 },
                  { header: "Coef.", key: "coef", width: 10, align: "right" },
                  { header: "Votante", key: "votante", width: 24 },
                  { header: "Opción", key: "opcion", width: 18 },
                  { header: "Poder", key: "poder", width: 8 },
                  { header: "Comprobante", key: "comp", width: 28 },
                ]
          }
          rows={votos.map((x) => ({
            unidad: x.unidad,
            coef: num(x.coeficiente, 4),
            votante: x.votante ?? "",
            opcion: x.opcion ?? "",
            poder: x.porPoder ? "Sí" : "",
            hora: fechaHora(x.emitidoEn),
            comp: v.secreto ? x.comprobante : `${x.comprobante.slice(0, 16)}…`,
          }))}
        />

        {qr && verificacion ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 14 }} wrap={false}>
            <PdfQr dataUrl={qr} size={80} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={pdfStyles.bold}>Código de verificación: {v.codigoActa}</Text>
              <Text style={pdfStyles.muted}>Verifica la autenticidad de esta acta en {verificacion}</Text>
            </View>
          </View>
        ) : null}
        <PdfFooter texto={`Acta de votación generada por MiConjunto el ${fechaHora(new Date())}`} />
      </Page>
    </Document>
  );
  return { buffer: await renderPdf(doc), nombre: `acta-votacion-${v.codigoActa ?? v.id}.pdf` };
}
