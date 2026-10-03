import * as React from "react";
import crypto from "node:crypto";
import QRCode from "qrcode";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { appUrl } from "@/lib/email";
import { pdfKit } from "./pdf-kit";
import { fecha, fechaLarga, num } from "@/lib/format";
import { unidadAlDia, type SaldoUnidad } from "./core";
import { conjuntoParaPdf, titularesUnidad } from "./comun";

type PCtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">;

/** Código de verificación legible y único: PYS-XXXX-XXXX (sin caracteres ambiguos). */
export function codigoVerificacion(prefijo = "PYS") {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  const s = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
  return `${prefijo}-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export function urlVerificacion(codigo: string) {
  return appUrl(`/verificar/${codigo}`);
}

async function crearCertificado(ctx: PCtx, data: { unidadId: string; personaNombre: string | null; automatico: boolean; observaciones?: string | null; vigenciaDias?: number; hoy?: Date }) {
  const cfg = conjuntoConfig(ctx);
  const hoy = data.hoy ?? new Date();
  const dias = data.vigenciaDias ?? cfg.pazYSalvo.vigenciaDias;
  for (let intento = 0; intento < 5; intento++) {
    try {
      return await ctx.db.certificadoPazYSalvo.create({
        data: {
          conjuntoId: ctx.conjuntoId,
          unidadId: data.unidadId,
          personaNombre: data.personaNombre,
          solicitadoPorId: ctx.userId === "sistema" ? null : ctx.userId,
          fecha: hoy,
          vigenteHasta: new Date(hoy.getTime() + dias * 86_400_000),
          codigo: codigoVerificacion(),
          automatico: data.automatico,
          emitidoPorId: data.automatico || ctx.userId === "sistema" ? null : ctx.userId,
          observaciones: data.observaciones ?? null,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  throw new AppError("No se pudo generar un código único. Intenta de nuevo.");
}

export type SolicitudPazYSalvo =
  | { ok: true; certificado: { id: string; codigo: string; vigenteHasta: Date; fecha: Date }; nuevo: boolean }
  | { ok: false; saldo: SaldoUnidad; mensaje: string };

/**
 * El residente (o el admin) solicita el paz y salvo: si la unidad está al día se emite automáticamente (o se
 * devuelve el vigente); si no, devuelve el saldo para mostrar el botón de pago. El llamador valida permisos.
 */
export async function solicitarPazYSalvo(ctx: PCtx, unidadId: string): Promise<SolicitudPazYSalvo> {
  const u = await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { id: true, codigo: true } });
  if (!u) notFound("La unidad");
  const { alDia, saldo } = await unidadAlDia(ctx, unidadId);
  if (!alDia) {
    return { ok: false, saldo, mensaje: `La unidad ${u.codigo} tiene un saldo vencido de $ ${Math.round(saldo.vencido - saldo.saldoAFavor).toLocaleString("es-CO")}. Ponte al día para descargar el paz y salvo.` };
  }
  const vigente = await ctx.db.certificadoPazYSalvo.findFirst({ where: { unidadId, estado: "VIGENTE", vigenteHasta: { gt: new Date() } }, orderBy: { fecha: "desc" } });
  if (vigente) return { ok: true, certificado: vigente, nuevo: false };
  const titulares = await titularesUnidad(ctx, unidadId);
  const cert = await crearCertificado(ctx, { unidadId, personaNombre: titulares[0]?.nombre ?? ctx.nombre, automatico: true });
  await audit(ctx as Ctx, "emitir_paz_y_salvo", "CertificadoPazYSalvo", cert.id, undefined, { unidadId, automatico: true, codigo: cert.codigo });
  await emit({ tipo: "cartera.paz_y_salvo_emitido", conjuntoId: ctx.conjuntoId, data: { id: cert.id, unidadId, codigo: cert.codigo }, actorId: ctx.userId });
  return { ok: true, certificado: cert, nuevo: true };
}

/** Emisión manual por el administrador (aun con saldo, dejando constancia en observaciones). */
export async function emitirPazYSalvoManual(ctx: Ctx, input: { unidadId: string; personaNombre?: string | null; observaciones: string; vigenciaDias?: number | null }) {
  const u = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } });
  if (!u) notFound("La unidad");
  const { alDia, saldo } = await unidadAlDia(ctx, input.unidadId);
  if (!alDia && (!input.observaciones || input.observaciones.trim().length < 10)) {
    throw new AppError("La unidad tiene saldo vencido: explica en las observaciones por qué se emite (mínimo 10 caracteres).", 400, { observaciones: "Obligatorio con saldo vencido" });
  }
  const titulares = await titularesUnidad(ctx, input.unidadId);
  const cert = await crearCertificado(ctx, {
    unidadId: input.unidadId,
    personaNombre: input.personaNombre || titulares[0]?.nombre || null,
    automatico: false,
    observaciones: input.observaciones,
    vigenciaDias: input.vigenciaDias ?? undefined,
  });
  await audit(ctx, "emitir_paz_y_salvo", "CertificadoPazYSalvo", cert.id, undefined, { ...input, automatico: false, saldoVencido: saldo.vencido });
  return cert;
}

export async function anularPazYSalvo(ctx: Ctx, id: string, motivo: string) {
  const c = await ctx.db.certificadoPazYSalvo.findUnique({ where: { id } });
  if (!c) notFound("El certificado");
  const u = await ctx.db.certificadoPazYSalvo.update({ where: { id }, data: { estado: "ANULADO", observaciones: [c.observaciones, `Anulado: ${motivo}`].filter(Boolean).join("\n") } });
  await audit(ctx, "anular", "CertificadoPazYSalvo", id, c, { motivo });
  return u;
}

/** Marca como VENCIDO los certificados cuya vigencia terminó (job diario). */
export async function vencerCertificados(ctx: Pick<Ctx, "db">, hoy = new Date()) {
  const r = await ctx.db.certificadoPazYSalvo.updateMany({ where: { estado: "VIGENTE", vigenteHasta: { lt: hoy } }, data: { estado: "VENCIDO" } });
  return r.count;
}

/** PDF del paz y salvo con QR de verificación pública (APP_URL/verificar/<codigo>). */
export async function pazYSalvoPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, id: string): Promise<Buffer> {
  const { Document, Page, Text, View, Header, Footer, Qr, render, s } = await pdfKit();
  const c = await ctx.db.certificadoPazYSalvo.findUnique({ where: { id }, include: { unidad: { include: { torre: { select: { nombre: true } } } } } });
  if (!c) notFound("El certificado");
  const [conjunto, titulares] = await Promise.all([conjuntoParaPdf(ctx), titularesUnidad(ctx, c.unidadId)]);
  const url = urlVerificacion(c.codigo);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 300 });
  const anulado = c.estado === "ANULADO";
  const doc = (
    <Document title={`Paz y salvo ${c.unidad.codigo}`} author="Conjunto360">
      <Page size="LETTER" style={[s.page, { padding: 48 }]}>
        <Header conjunto={conjunto} derecha={<Text style={s.muted}>Código {c.codigo}</Text>} />
        <Text style={[s.title, { textAlign: "center", marginTop: 16, fontSize: 18 }]}>CERTIFICADO DE PAZ Y SALVO</Text>
        {anulado ? <Text style={{ textAlign: "center", color: "#b91c1c", fontFamily: "Helvetica-Bold", marginBottom: 8 }}>ANULADO — SIN VALIDEZ</Text> : null}
        <Text style={[s.p, { marginTop: 18, fontSize: 11, lineHeight: 1.6 }]}>
          La administración de {conjunto.nombre}
          {conjunto.nit ? `, identificada con NIT ${conjunto.nit}` : ""}, certifica que la unidad privada{" "}
          <Text style={s.bold}>{c.unidad.codigo}</Text>
          {c.unidad.torre ? ` (${c.unidad.torre.nombre})` : ""}, con coeficiente de copropiedad de {num(c.unidad.coeficiente, 6)} %
          {titulares.length ? `, de propiedad de ${titulares.map((t) => `${t.nombre} (${t.tipoDocumento} ${t.documento})`).join(" y ")}` : ""}, se encuentra a PAZ Y SALVO por
          concepto de cuotas de administración, cuotas extraordinarias, intereses de mora, multas y demás expensas comunes a la fecha de expedición.
        </Text>
        {c.observaciones ? (
          <View style={s.box}>
            <Text style={s.bold}>Observaciones</Text>
            <Text>{c.observaciones}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 20, alignItems: "flex-end" }}>
          <View>
            <Text>Fecha de expedición: {fechaLarga(c.fecha)}</Text>
            <Text>Válido hasta: {fecha(c.vigenteHasta)}</Text>
            {c.personaNombre ? <Text>Solicitado por / a nombre de: {c.personaNombre}</Text> : null}
            <Text style={[s.muted, { marginTop: 4 }]}>{c.automatico ? "Emitido automáticamente por Conjunto360" : "Emitido por la administración"}</Text>
            <View style={{ marginTop: 36, borderTopWidth: 0.8, borderTopColor: "#18181b", width: 220, paddingTop: 3 }}>
              <Text>Administración</Text>
              <Text style={s.muted}>{conjunto.nombre}</Text>
            </View>
          </View>
          <Qr dataUrl={qr} size={110} caption="Escanea para verificar" />
        </View>
        <Text style={[s.muted, { marginTop: 20, fontSize: 8 }]}>
          Verifica la autenticidad de este certificado en {url.replace(/^https?:\/\//, "")} o escaneando el código QR. Este certificado no reemplaza la verificación
          directa con la administración para trámites notariales.
        </Text>
        <Footer texto={`Paz y salvo ${c.codigo}`} />
      </Page>
    </Document>
  );
  return render(doc);
}
