import * as React from "react";
import type { Ctx } from "@/lib/auth/context";
import { notFound } from "@/lib/errors";
import { renderTemplate } from "@/lib/email";
import type { ConjuntoPdf } from "@/lib/pdf/kit";
import { pdfKit } from "./pdf-kit";
import { cop, fecha, fechaLarga, fechaHora, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { saldoUnidad } from "./core";
import { valorEnLetras } from "./calculos";
import { conjuntoParaPdf, titularesUnidad } from "./comun";
import { detalleAcuerdo } from "./acuerdos";

// ─────────────── Recibo de caja ───────────────

/** Recibo de caja con consecutivo (Pago.numeroRecibo), valor en letras y detalle de la aplicación. */
export async function reciboPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, pagoId: string): Promise<Buffer> {
  const { Document, Page, Text, View, Header, Footer, Table, render, s } = await pdfKit();
  const p = await ctx.db.pago.findUnique({
    where: { id: pagoId },
    include: { unidad: { include: { torre: { select: { nombre: true } } } }, aplicaciones: { where: { deletedAt: null }, include: { cuota: { include: { concepto: true } } } } },
  });
  if (!p) notFound("El pago");
  const [conjunto, titulares, saldo, registrador] = await Promise.all([
    conjuntoParaPdf(ctx),
    titularesUnidad(ctx, p.unidadId),
    saldoUnidad(ctx, p.unidadId),
    p.registradoPorId ? ctx.db.usuario.findUnique({ where: { id: p.registradoPorId }, select: { nombre: true } }) : Promise.resolve(null),
  ]);
  const aplicado = p.aplicaciones.reduce((a, x) => a + toNumber(x.valor), 0);
  const descuentos = await ctx.db.movimientoCartera.findMany({ where: { pagoId, tipo: "CREDITO", descripcion: { startsWith: "Descuento pronto pago" } } });
  const excedente = toNumber(p.valor) - aplicado;
  const anulado = p.estado === "ANULADO";
  const doc = (
    <Document title={`Recibo de caja ${p.numeroRecibo ?? ""}`} author="Conjunto360">
      <Page size="A5" orientation="landscape" style={s.page}>
        <Header
          conjunto={conjunto}
          derecha={
            <>
              <Text style={[s.bold, { fontSize: 12 }]}>RECIBO DE CAJA</Text>
              <Text style={[s.bold, { fontSize: 14, color: "#0f766e" }]}>N.º {p.numeroRecibo ?? "—"}</Text>
              <Text style={s.muted}>{fechaHora(p.fecha)}</Text>
            </>
          }
        />
        {anulado ? <Text style={{ color: "#b91c1c", fontFamily: "Helvetica-Bold", marginBottom: 4 }}>RECIBO ANULADO — SIN VALIDEZ</Text> : null}
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text>
              Recibimos de: <Text style={s.bold}>{p.pagadorNombre || titulares[0]?.nombre || "Propietario"}</Text>
            </Text>
            <Text>
              Unidad: <Text style={s.bold}>{p.unidad.codigo}</Text>
              {p.unidad.torre ? ` · ${p.unidad.torre.nombre}` : ""}
            </Text>
            <Text>
              Medio de pago: {label(p.medio)}
              {p.referenciaExterna ? ` · Ref. ${p.referenciaExterna}` : ""}
            </Text>
          </View>
          <View style={[s.box, { width: 160, alignItems: "flex-end", marginVertical: 0 }]}>
            <Text style={s.muted}>Valor recibido</Text>
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold" }}>{cop(p.valor)}</Text>
          </View>
        </View>
        <Text style={[s.p, { marginTop: 4, fontSize: 8.5 }]}>La suma de: {valorEnLetras(toNumber(p.valor))}</Text>
        <Table
          columns={[
            { header: "Concepto aplicado", key: "c", width: 60 },
            { header: "Periodo", key: "p", width: 15 },
            { header: "Valor", key: "v", width: 25, align: "right" },
          ]}
          rows={[
            ...p.aplicaciones.map((a) => ({ c: a.cuota.descripcion ?? a.cuota.concepto.nombre, p: a.cuota.periodo, v: cop(a.valor) })),
            ...descuentos.map((d) => ({ c: `${d.descripcion} (descuento, no es pago)`, p: "", v: cop(d.valor) })),
            ...(excedente > 0.5 ? [{ c: "Saldo a favor (anticipo)", p: "", v: cop(excedente) }] : []),
          ]}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <Text>Saldo pendiente de la unidad después de este pago: {cop(Math.max(0, saldo.neto))}</Text>
          <Text style={s.muted}>Recibió: {registrador?.nombre ?? (p.pasarela !== "NINGUNA" ? `Pasarela ${label(p.pasarela)}` : "Administración")}</Text>
        </View>
        {p.observaciones ? <Text style={[s.muted, { marginTop: 4 }]}>Observaciones: {p.observaciones}</Text> : null}
        <Text style={[s.muted, { marginTop: 6, fontSize: 7 }]}>Referencia interna {p.referencia}. Las expensas comunes no se facturan electrónicamente (Ley 675 de 2001).</Text>
        <Footer texto={`${conjunto.nombre} · Recibo de caja ${p.numeroRecibo ?? ""}`} />
      </Page>
    </Document>
  );
  return render(doc);
}

// ─────────────── Cartas de cobro prejurídico ───────────────

export const PLANTILLA_CARTA_DEFECTO = `Señor(a) {{propietario}}
Propietario(a) de la unidad {{unidad}}

Asunto: Cobro prejurídico de expensas comunes

Respetado(a) señor(a):

Revisados nuestros registros, la unidad {{unidad}} presenta a la fecha un saldo vencido de {{saldo_vencido}} por concepto de cuotas de administración, intereses de mora y demás expensas comunes, con {{dias_mora}} días de mora.

De acuerdo con los artículos 29 y 30 de la Ley 675 de 2001, los propietarios están obligados a contribuir oportunamente con las expensas necesarias para la administración de la copropiedad, y el retardo en su pago causa intereses de mora a la tasa máxima legal.

Le invitamos a ponerse al día o a suscribir un acuerdo de pago dentro de los próximos diez (10) días hábiles. De lo contrario, la administración podrá iniciar el cobro por vía judicial, con los costos que ello implica.

Puede pagar en línea en {{link_pago}} o consignar con la referencia {{referencia}}. Si ya realizó el pago, por favor haga caso omiso de esta comunicación y envíenos el soporte.

Atentamente,

Administración
{{conjunto}}`;

export const VARIABLES_CARTA = ["propietario", "unidad", "saldo_total", "saldo_vencido", "dias_mora", "referencia", "fecha", "conjunto", "link_pago"] as const;

export type DatosCarta = { unidadId: string; unidad: string; propietario: string; direccionUnidad: string; saldoTotal: number; saldoVencido: number; diasMora: number; referencia: string; aging: Record<string, number> };

export async function datosCarta(ctx: Pick<Ctx, "db">, unidadId: string): Promise<DatosCarta> {
  const u = await ctx.db.unidad.findUnique({ where: { id: unidadId }, include: { torre: { select: { nombre: true } } } });
  if (!u) notFound("La unidad");
  const [s, t] = await Promise.all([saldoUnidad(ctx, unidadId), titularesUnidad(ctx, unidadId)]);
  return {
    unidadId,
    unidad: u.codigo,
    propietario: t.map((x) => x.nombre).join(" y ") || "Propietario(a)",
    direccionUnidad: [u.codigo, u.torre?.nombre].filter(Boolean).join(", "),
    saldoTotal: s.neto,
    saldoVencido: Math.max(0, s.vencido - s.saldoAFavor),
    diasMora: s.diasMoraMax,
    referencia: s.cuotas.find((c) => c.diasMora > 0)?.referenciaPago ?? s.cuotas[0]?.referenciaPago ?? "—",
    aging: s.aging,
  };
}

function CartaPagina({ k, conjunto, d, plantilla, hoy, linkPago }: { k: Awaited<ReturnType<typeof pdfKit>>; conjunto: ConjuntoPdf; d: DatosCarta; plantilla: string; hoy: Date; linkPago: string }) {
  const { Page, Text, Header, Footer, s } = k;
  const texto = renderTemplate(plantilla, {
    propietario: d.propietario,
    unidad: d.unidad,
    saldo_total: cop(d.saldoTotal),
    saldo_vencido: cop(d.saldoVencido),
    dias_mora: d.diasMora,
    referencia: d.referencia,
    fecha: fechaLarga(hoy),
    conjunto: conjunto.nombre,
    link_pago: linkPago,
  });
  return (
    <Page size="LETTER" style={[s.page, { padding: 48, fontSize: 10.5 }]}>
      <Header conjunto={conjunto} derecha={<Text style={s.muted}>{conjunto.ciudad ? `${conjunto.ciudad}, ` : ""}{fechaLarga(hoy)}</Text>} />
      {texto.split(/\n{2,}/).map((par, i) => (
        <Text key={i} style={[s.p, { marginBottom: 9, lineHeight: 1.5 }]}>
          {par}
        </Text>
      ))}
      <Footer texto="Comunicación enviada conforme a la Ley 2300 de 2023 (horarios y frecuencia de cobranza)." />
    </Page>
  );
}

/** Genera un PDF con una carta de cobro prejurídico por unidad (una página cada una). */
export async function cartasCobroPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, unidadIds: string[], plantilla = PLANTILLA_CARTA_DEFECTO, linkPago = "", hoy = new Date()): Promise<Buffer> {
  const kit = await pdfKit();
  const { Document, render } = kit;
  const conjunto = await conjuntoParaPdf(ctx);
  const datos: DatosCarta[] = [];
  for (const id of unidadIds) datos.push(await datosCarta(ctx, id));
  const doc = (
    <Document title="Cartas de cobro" author="Conjunto360">
      {datos.map((d) => (
        <CartaPagina k={kit} key={d.unidadId} conjunto={conjunto} d={d} plantilla={plantilla} hoy={hoy} linkPago={linkPago} />
      ))}
    </Document>
  );
  return render(doc);
}

// ─────────────── Documento del acuerdo de pago ───────────────

export async function acuerdoPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, acuerdoId: string): Promise<Buffer> {
  const { Document, Page, Text, View, Header, Footer, Table, render, s } = await pdfKit();
  const { acuerdo, plan, originales, pagado, pendiente } = await detalleAcuerdo(ctx, acuerdoId);
  const [conjunto, titulares] = await Promise.all([conjuntoParaPdf(ctx), titularesUnidad(ctx, acuerdo.unidadId)]);
  const traslados = await ctx.db.movimientoCartera.findMany({ where: { cuotaId: { in: originales.map((o) => o.id) }, tipo: "CREDITO", descripcion: { startsWith: "Traslado a acuerdo" } } });
  const valorTrasladado = new Map(traslados.map((t) => [t.cuotaId, toNumber(t.valor)]));
  const deudor = titulares.map((t) => `${t.nombre}, ${t.tipoDocumento} ${t.documento}`).join(" y ") || "el propietario";
  const doc = (
    <Document title={`Acuerdo de pago ${acuerdo.unidad.codigo}`} author="Conjunto360">
      <Page size="LETTER" style={[s.page, { padding: 44 }]}>
        <Header conjunto={conjunto} derecha={<Text style={s.muted}>Estado: {label(acuerdo.estado)}</Text>} />
        <Text style={[s.title, { textAlign: "center" }]}>ACUERDO DE PAGO</Text>
        <Text style={[s.p, { lineHeight: 1.5 }]}>
          Entre {conjunto.nombre}
          {conjunto.nit ? ` (NIT ${conjunto.nit})` : ""}, representada por su administración, y {deudor}, en calidad de propietario(s) de la unidad{" "}
          {acuerdo.unidad.codigo}, se celebra el presente acuerdo de pago sobre un saldo vencido de {cop(acuerdo.saldoInicial)} ({valorEnLetras(toNumber(acuerdo.saldoInicial))}),
          el cual se pagará en {acuerdo.numeroCuotas} cuota(s) mensual(es) de aproximadamente {cop(acuerdo.valorCuota)}, los días {acuerdo.diaPago} de cada mes, a partir del{" "}
          {fecha(plan[0]?.fechaVencimiento ?? acuerdo.fechaInicio)}.
        </Text>
        <Text style={s.h2}>Obligaciones que se incluyen</Text>
        <Table
          columns={[
            { header: "Concepto", key: "c", width: 65 },
            { header: "Vencía", key: "v", width: 15 },
            { header: "Valor", key: "s", width: 20, align: "right" },
          ]}
          rows={originales.map((o) => ({ c: o.descripcion ?? o.concepto.nombre, v: fecha(o.fechaVencimiento), s: cop(valorTrasladado.get(o.id) ?? 0) }))}
        />
        <Text style={s.h2}>Plan de pagos</Text>
        <Table
          columns={[
            { header: "Cuota", key: "n", width: 40 },
            { header: "Vence", key: "v", width: 20 },
            { header: "Valor", key: "val", width: 20, align: "right" },
            { header: "Estado", key: "e", width: 20 },
          ]}
          rows={plan.map((c) => ({ n: c.descripcion ?? "", v: fecha(c.fechaVencimiento), val: cop(toNumber(c.valorBase) + toNumber(c.iva)), e: label(c.estado) }))}
        />
        <Text style={[s.p, { marginTop: 6 }]}>
          Pagado: {cop(pagado)} · Pendiente: {cop(pendiente)}
        </Text>
        <Text style={s.h2}>Condiciones</Text>
        <Text style={s.p}>1. Mientras el acuerdo se cumpla, no se causarán intereses de mora sobre las obligaciones incluidas. Las cuotas del acuerdo no pagadas a su vencimiento causarán intereses a la tasa legal vigente.</Text>
        <Text style={s.p}>2. El incumplimiento de una cuota por más de treinta (30) días dará por terminado el acuerdo y la administración podrá exigir el saldo total por vía judicial.</Text>
        <Text style={s.p}>3. Las cuotas de administración que se causen durante la vigencia del acuerdo deben pagarse de forma oportuna e independiente.</Text>
        {acuerdo.observaciones ? <Text style={s.p}>Observaciones: {acuerdo.observaciones}</Text> : null}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 40 }}>
          {["La administración", "El (los) propietario(s)"].map((f) => (
            <View key={f} style={{ borderTopWidth: 0.8, borderTopColor: "#18181b", width: 200, paddingTop: 3 }}>
              <Text>{f}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.muted, { marginTop: 14 }]}>Suscrito el {fechaLarga(acuerdo.fechaInicio)}.</Text>
        <Footer texto={`Acuerdo de pago ${acuerdo.unidad.codigo}`} />
      </Page>
    </Document>
  );
  return render(doc);
}
