import * as React from "react";
import QRCode from "qrcode";
import type { Ctx } from "@/lib/auth/context";
import { notFound, AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { appUrl, queueBrandedEmail } from "@/lib/email";
import { pdfKit } from "./pdf-kit";
import { cop, fecha, fechaLarga, num, toNumber } from "@/lib/format";
import { saldoUnidad, type SaldoUnidad } from "./core";
import { RANGO_LABEL, RANGOS_MORA, round } from "./calculos";
import { conjuntoParaPdf, titularesUnidad, type Titular } from "./comun";
import { registrarGestion, puedeContactar } from "./cobranza";

export type MovimientoEstado = { id: string; fecha: Date; descripcion: string; debito: number; credito: number; saldo: number; conceptoTipo: string | null; pagoId: string | null; cuotaId: string | null };

export type EstadoCuenta = {
  unidad: { id: string; codigo: string; torre: string | null; coeficiente: number; cuotaAdministracion: number };
  titulares: Titular[];
  saldo: SaldoUnidad;
  saldoInicial: number;
  desde: Date;
  movimientos: MovimientoEstado[];
  referenciaPago: string | null;
  acuerdoVigente: { id: string; numeroCuotas: number; valorCuota: number } | null;
  generado: Date;
};

/**
 * Estado de cuenta de una unidad: saldo con edad de mora (30/60/90/+120), saldos por concepto, cuotas pendientes con
 * referencia de pago y movimientos del libro auxiliar con saldo acumulado desde `desde` (por defecto 6 meses).
 * No verifica permisos: el llamador debe hacerlo.
 */
export async function estadoCuenta(ctx: Pick<Ctx, "db">, unidadId: string, opts?: { desde?: Date; hoy?: Date }): Promise<EstadoCuenta> {
  const hoy = opts?.hoy ?? new Date();
  const desde = opts?.desde ?? new Date(hoy.getTime() - 183 * 86_400_000);
  const u = await ctx.db.unidad.findUnique({ where: { id: unidadId }, include: { torre: { select: { nombre: true } } } });
  if (!u) notFound("La unidad");
  const [saldo, titulares, previos, movs, acuerdo] = await Promise.all([
    saldoUnidad(ctx, unidadId, hoy),
    titularesUnidad(ctx, unidadId),
    ctx.db.movimientoCartera.groupBy({ by: ["tipo"], where: { unidadId, fecha: { lt: desde } }, _sum: { valor: true } }),
    ctx.db.movimientoCartera.findMany({ where: { unidadId, fecha: { gte: desde } }, orderBy: [{ fecha: "asc" }, { createdAt: "asc" }] }),
    ctx.db.acuerdoPago.findFirst({ where: { unidadId, estado: "VIGENTE" } }),
  ]);
  const saldoInicial = round(previos.reduce((a, p) => a + (p.tipo === "DEBITO" ? 1 : -1) * toNumber(p._sum.valor), 0));
  let acum = saldoInicial;
  const movimientos: MovimientoEstado[] = movs.map((m) => {
    const v = toNumber(m.valor);
    const debito = m.tipo === "DEBITO" ? v : 0;
    const credito = m.tipo === "CREDITO" ? v : 0;
    acum = round(acum + debito - credito);
    return { id: m.id, fecha: m.fecha, descripcion: m.descripcion, debito, credito, saldo: acum, conceptoTipo: m.conceptoTipo, pagoId: m.pagoId, cuotaId: m.cuotaId };
  });
  return {
    unidad: { id: u.id, codigo: u.codigo, torre: u.torre?.nombre ?? null, coeficiente: toNumber(u.coeficiente), cuotaAdministracion: toNumber(u.cuotaAdministracion) },
    titulares,
    saldo,
    saldoInicial,
    desde,
    movimientos,
    referenciaPago: saldo.cuotas[0]?.referenciaPago ?? null,
    acuerdoVigente: acuerdo ? { id: acuerdo.id, numeroCuotas: acuerdo.numeroCuotas, valorCuota: toNumber(acuerdo.valorCuota) } : null,
    generado: hoy,
  };
}

/** PDF del estado de cuenta con referencia de pago y QR al portal de pagos. Reutilizable (campañas de cobro, residente). */
export async function estadoCuentaPdf(ctx: Pick<Ctx, "db" | "conjuntoId">, unidadId: string): Promise<Buffer> {
  const { Document, Page, Text, View, Header, Footer, Table, Qr, render, s: st } = await pdfKit();
  function Kpi({ titulo, valor, color }: { titulo: string; valor: string; color?: string }) {
    return (
      <View style={{ flex: 1, borderWidth: 0.5, borderColor: "#d4d4d8", borderRadius: 4, padding: 6 }}>
        <Text style={[st.muted, { fontSize: 7.5 }]}>{titulo}</Text>
        <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: color ?? "#18181b" }}>{valor}</Text>
      </View>
    );
  }
  const [e, conjunto] = await Promise.all([estadoCuenta(ctx, unidadId), conjuntoParaPdf(ctx)]);
  const payUrl = appUrl("/cuenta");
  const qr = await QRCode.toDataURL(payUrl, { margin: 1, width: 240 });
  const s = e.saldo;
  const doc = (
    <Document title={`Estado de cuenta ${e.unidad.codigo}`} author="Conjunto360">
      <Page size="A4" style={st.page}>
        <Header
          conjunto={conjunto}
          derecha={
            <>
              <Text style={st.bold}>ESTADO DE CUENTA</Text>
              <Text style={st.muted}>Corte: {fecha(e.generado)}</Text>
            </>
          }
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={[st.box, { flex: 1 }]}>
            <Text style={st.bold}>Unidad {e.unidad.codigo}</Text>
            {e.unidad.torre ? <Text style={st.muted}>{e.unidad.torre}</Text> : null}
            <Text>Coeficiente: {num(e.unidad.coeficiente, 6)} %</Text>
            <Text>Cuota de administración: {cop(e.unidad.cuotaAdministracion)}</Text>
            {e.titulares.slice(0, 2).map((t) => (
              <Text key={t.personaId}>Propietario: {t.nombre}</Text>
            ))}
          </View>
          <View style={[st.box, { width: 170, alignItems: "center" }]}>
            <Text style={[st.bold, { marginBottom: 2 }]}>Paga en línea</Text>
            <Qr dataUrl={qr} size={70} caption={payUrl.replace(/^https?:\/\//, "")} />
            {e.referenciaPago ? (
              <Text style={{ marginTop: 4, fontSize: 8 }}>
                Referencia de pago: <Text style={st.bold}>{e.referenciaPago}</Text>
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 6, marginVertical: 6 }}>
          <Kpi titulo="Total a pagar" valor={cop(s.neto > 0 ? s.neto : 0)} />
          <Kpi titulo="Vencido" valor={cop(s.vencido)} color={s.vencido > 0 ? "#b91c1c" : undefined} />
          <Kpi titulo="Por vencer" valor={cop(s.porVencer)} />
          <Kpi titulo="Saldo a favor" valor={cop(s.saldoAFavor)} color={s.saldoAFavor > 0 ? "#047857" : undefined} />
        </View>
        {s.diasMoraMax > 0 ? <Text style={[st.p, { color: "#b91c1c" }]}>La unidad presenta {s.diasMoraMax} días de mora. Los intereses se liquidan diariamente a la tasa legal vigente.</Text> : null}
        {e.acuerdoVigente ? <Text style={st.p}>Acuerdo de pago vigente: {e.acuerdoVigente.numeroCuotas} cuotas de {cop(e.acuerdoVigente.valorCuota)}.</Text> : null}

        <Text style={st.h2}>Edad de la cartera</Text>
        <Table
          columns={RANGOS_MORA.map((r) => ({ header: RANGO_LABEL[r], key: r, align: "right" as const }))}
          rows={[Object.fromEntries(RANGOS_MORA.map((r) => [r, cop(s.aging[r])]))]}
        />

        {s.porConcepto.length > 0 && (
          <>
            <Text style={st.h2}>Saldos por concepto</Text>
            <Table
              columns={[
                { header: "Concepto", key: "c", width: 70 },
                { header: "Saldo", key: "s", width: 30, align: "right" },
              ]}
              rows={s.porConcepto.map((p) => ({ c: p.nombre, s: cop(p.saldo) }))}
            />
          </>
        )}

        <Text style={st.h2}>Cuotas pendientes</Text>
        {s.cuotas.length === 0 ? (
          <Text style={st.p}>No hay cuotas pendientes. ¡Gracias por estar al día!</Text>
        ) : (
          <Table
            columns={[
              { header: "Concepto", key: "d", width: 38 },
              { header: "Vence", key: "v", width: 13 },
              { header: "Días mora", key: "m", width: 10, align: "right" },
              { header: "Referencia", key: "r", width: 22 },
              { header: "Saldo", key: "s", width: 17, align: "right" },
            ]}
            rows={s.cuotas.map((c) => ({ d: c.descripcion, v: fecha(c.fechaVencimiento), m: c.diasMora > 0 ? String(c.diasMora) : "—", r: c.referenciaPago, s: cop(c.saldo) }))}
          />
        )}

        <Text style={st.h2}>Movimientos desde el {fecha(e.desde)}</Text>
        <Table
          columns={[
            { header: "Fecha", key: "f", width: 12 },
            { header: "Descripción", key: "d", width: 46 },
            { header: "Débito", key: "db", width: 14, align: "right" },
            { header: "Crédito", key: "cr", width: 14, align: "right" },
            { header: "Saldo", key: "s", width: 14, align: "right" },
          ]}
          rows={[
            { f: fecha(e.desde), d: "Saldo anterior", db: "", cr: "", s: cop(e.saldoInicial) },
            ...e.movimientos.map((m) => ({ f: fecha(m.fecha), d: m.descripcion, db: m.debito ? cop(m.debito) : "", cr: m.credito ? cop(m.credito) : "", s: cop(m.saldo) })),
          ]}
        />
        <Text style={[st.muted, { marginTop: 8, fontSize: 7.5 }]}>
          Documento informativo generado el {fechaLarga(e.generado)}. Los pagos por consignación o transferencia deben incluir la referencia de pago. Ley 675 de 2001: las
          expensas comunes no se facturan electrónicamente; este documento no es factura.
        </Text>
        <Footer texto={`${conjunto.nombre} · Estado de cuenta ${e.unidad.codigo}`} />
      </Page>
    </Document>
  );
  return render(doc);
}

/**
 * Envía el estado de cuenta en PDF por correo a los propietarios. Si la unidad tiene saldo vencido es una gestión de
 * cobro: se valida la Ley 2300 (horario y frecuencia por canal) y se registra como gestión por CORREO.
 */
export async function enviarEstadoCuenta(ctx: Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">, unidadId: string, opts?: { mensaje?: string | null; hoy?: Date }) {
  const hoy = opts?.hoy ?? new Date();
  const e = await estadoCuenta(ctx, unidadId, { hoy });
  const destinos = [...new Set(e.titulares.map((t) => t.email).filter((x): x is string => !!x))];
  if (!destinos.length) throw new AppError("Los propietarios de la unidad no tienen correo registrado.");
  const enMora = e.saldo.vencido - e.saldo.saldoAFavor > 0;
  if (enMora) {
    const r = await puedeContactar(unidadId, "CORREO", hoy);
    if (!r.ok) throw new AppError(r.motivo ?? "No se puede enviar ahora (Ley 2300).", 409);
  }
  const pdf = await estadoCuentaPdf(ctx, unidadId);
  const conjunto = await conjuntoParaPdf(ctx);
  const parrafos = [
    `Adjuntamos el estado de cuenta de la unidad ${e.unidad.codigo} con corte al ${fecha(hoy)}.`,
    e.saldo.neto > 0 ? `Saldo total: ${cop(e.saldo.neto)}${e.saldo.vencido > 0 ? ` (vencido: ${cop(e.saldo.vencido)})` : ""}.` : "La unidad se encuentra al día. ¡Gracias!",
    ...(e.referenciaPago ? [`Referencia de pago para consignaciones: ${e.referenciaPago}.`] : []),
    ...(opts?.mensaje ? [opts.mensaje] : []),
  ];
  for (const to of destinos) {
    await queueBrandedEmail(
      to,
      `Estado de cuenta ${e.unidad.codigo} — ${conjunto.nombre}`,
      { conjuntoNombre: conjunto.nombre, color: conjunto.color, parrafos, boton: e.saldo.neto > 0 ? { texto: "Pagar en línea", url: appUrl("/cuenta") } : undefined },
      { conjuntoId: ctx.conjuntoId, attachments: [{ filename: `estado-cuenta-${e.unidad.codigo}.pdf`, contentBase64: pdf.toString("base64"), contentType: "application/pdf" }] },
    );
  }
  if (enMora) await registrarGestion(ctx, { unidadId, canal: "CORREO", resultado: "Estado de cuenta enviado por correo", notas: destinos.join(", ") }, hoy);
  await audit(ctx as Ctx, "enviar_estado_cuenta", "Unidad", unidadId, undefined, { destinos, saldo: e.saldo.neto });
  return { enviados: destinos.length, destinos };
}

