"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { zs } from "@/lib/validation";
import { anularCargo } from "@/lib/cartera/core";
import { generarCuotasMes, crearCuotaExtraordinaria, anularCuotaExtraordinaria, parsearDistribucionManual } from "@/lib/cartera/generacion";
import { liquidarInteresesMora, registrarTasaMora } from "@/lib/cartera/mora";
import { anularPago, crearCargoManual, eliminarConcepto, guardarConcepto, registrarPagoManual } from "@/lib/cartera/operaciones";
import { registrarGestion } from "@/lib/cartera/cobranza";
import { enviarEstadoCuenta } from "@/lib/cartera/estado-cuenta";
import { adjuntarDocumentoAcuerdo, cambiarEstadoAcuerdo, crearAcuerdo } from "@/lib/cartera/acuerdos";
import { anularPazYSalvo, emitirPazYSalvoManual, solicitarPazYSalvo } from "@/lib/cartera/paz-y-salvo";
import {
  cargarExtracto,
  cerrarConciliacion,
  crearPagoDesdeLinea,
  deshacerLinea,
  eliminarCuentaBancaria,
  emparejarAutomatico,
  emparejarManual,
  guardarCuentaBancaria,
  ignorarLinea,
} from "@/lib/cartera/conciliacion";

const done = <T>(r: T) => {
  revalidatePath("/cartera", "layout");
  return r;
};

const PERIODO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo no válido (AAAA-MM)");
const MOTIVO = zs.text(5, 300);
const vacioANull = (v: unknown) => (v === "" ? null : v);
const OPT_PERIODO = z.preprocess(vacioANull, PERIODO.nullable()).optional();
const TIPOS_CONCEPTO = ["ADMINISTRACION", "EXTRAORDINARIA", "MULTA", "INTERES_MORA", "ALQUILER_ZONA", "PARQUEADERO", "SERVICIO", "OTRO"] as const;
const MEDIOS = ["EFECTIVO", "TRANSFERENCIA", "CONSIGNACION", "PSE", "NEQUI", "BANCOLOMBIA_QR", "TARJETA"] as const;
const CANALES = ["LLAMADA", "CORREO", "VISITA", "WHATSAPP", "CARTA", "SMS"] as const;

// ── Cuotas ──
export const generarCuotasAction = action({ perm: "cartera.generar", schema: z.object({ periodo: PERIODO }) }, async ({ periodo }, ctx) => done(await generarCuotasMes(ctx, periodo)));

export const liquidarMoraAction = action({ perm: "cartera.generar", schema: z.object({}) }, async (_i, ctx) => done(await liquidarInteresesMora(ctx)));

export const crearCargoAction = action(
  {
    perm: "cartera.crear",
    schema: z.object({ unidadId: zs.id(), conceptoId: zs.id(), valorBase: zs.money(1), descripcion: zs.optText(200), fechaVencimiento: zs.date(), periodo: OPT_PERIODO }),
  },
  async (input, ctx) => done({ id: (await crearCargoManual(ctx, input)).id }),
);

export const anularCuotaAction = action({ perm: "cartera.anular", schema: z.object({ id: zs.id(), motivo: MOTIVO }) }, async ({ id, motivo }, ctx) => {
  await anularCargo(ctx, id, motivo);
  return done(true);
});

// ── Extraordinarias ──
export const crearExtraordinariaAction = action(
  {
    perm: "cartera.generar",
    schema: z.object({
      nombre: zs.text(3, 120),
      motivo: zs.optText(500),
      asambleaId: zs.optId(),
      valorTotal: zs.optMoney(),
      distribucion: z.enum(["POR_COEFICIENTE", "IGUAL_POR_UNIDAD", "MANUAL"]),
      numeroCuotas: zs.int(1, 36),
      primerPeriodo: PERIODO,
      diaVencimiento: zs.int(1, 28),
      manualTexto: zs.optText(20000),
    }),
  },
  async ({ manualTexto, valorTotal, ...input }, ctx) => {
    const manual = input.distribucion === "MANUAL" ? await parsearDistribucionManual(ctx, manualTexto ?? "") : undefined;
    if (input.distribucion !== "MANUAL" && !valorTotal) throw new AppError("Escribe el valor total a distribuir.", 400, { valorTotal: "Obligatorio" });
    return done(await crearCuotaExtraordinaria(ctx, { ...input, valorTotal: valorTotal ?? 0, manual }));
  },
);

export const anularExtraordinariaAction = action({ perm: "cartera.anular", schema: z.object({ id: zs.id(), motivo: MOTIVO }) }, async ({ id, motivo }, ctx) => done(await anularCuotaExtraordinaria(ctx, id, motivo)));

// ── Pagos ──
export const registrarPagoAction = action(
  {
    perm: "pagos.registrar",
    schema: z.object({
      unidadId: zs.id(),
      valor: zs.money(1),
      fecha: zs.date(),
      medio: z.enum(MEDIOS),
      referenciaExterna: zs.optText(80),
      comprobanteUrl: zs.optText(500),
      observaciones: zs.optText(500),
      pagadorNombre: zs.optText(120),
      cuotaIds: zs.list().optional(),
    }),
  },
  async (input, ctx) => {
    const p = await registrarPagoManual(ctx, input);
    revalidatePath("/cuenta");
    return done({ id: p.id, numeroRecibo: p.numeroRecibo });
  },
);

export const anularPagoAction = action({ perm: "pagos.anular", schema: z.object({ id: zs.id(), motivo: MOTIVO }) }, async ({ id, motivo }, ctx) => {
  await anularPago(ctx, id, motivo);
  revalidatePath("/cuenta");
  return done(true);
});

// ── Conceptos y tasa ──
export const guardarConceptoAction = action(
  {
    perm: "cartera.configurar",
    schema: z.object({ id: zs.optId(), nombre: zs.text(2, 80), tipo: z.enum(TIPOS_CONCEPTO), cuentaContable: zs.optText(20), gravaIva: zs.bool(), tarifaIva: zs.number(0), facturaElectronica: zs.bool(), activo: zs.bool() }),
  },
  async (input, ctx) => done({ id: (await guardarConcepto(ctx, input)).id }),
);

export const eliminarConceptoAction = action({ perm: "cartera.configurar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await eliminarConcepto(ctx, id)));

export const registrarTasaAction = action(
  { perm: "cartera.configurar", schema: z.object({ ibcEA: zs.number(0.01), tasaEA: zs.optNumber(), vigenteDesde: zs.date(), fuente: zs.optText(200) }) },
  async (input, ctx) => done({ id: (await registrarTasaMora(ctx, input)).id }),
);

// ── Cobranza ──
export const registrarGestionAction = action(
  { perm: "cartera.gestionar_cobro", schema: z.object({ unidadId: zs.id(), canal: z.enum(CANALES), resultado: zs.optText(200), notas: zs.optText(1000) }) },
  async (input, ctx) => done({ id: (await registrarGestion(ctx, input)).id }),
);

export const enviarEstadoCuentaAction = action(
  { perm: "cartera.gestionar_cobro", schema: z.object({ unidadId: zs.id(), mensaje: zs.optText(1000) }) },
  async ({ unidadId, mensaje }, ctx) => done(await enviarEstadoCuenta(ctx, unidadId, { mensaje })),
);

// ── Acuerdos ──
export const crearAcuerdoAction = action(
  { perm: "cartera.acuerdos", schema: z.object({ unidadId: zs.id(), numeroCuotas: zs.int(1, 36), diaPago: zs.int(1, 28), observaciones: zs.optText(1000), documentoUrl: zs.optText(500) }) },
  async (input, ctx) => done({ id: (await crearAcuerdo(ctx, input)).id }),
);

export const estadoAcuerdoAction = action(
  { perm: "cartera.acuerdos", schema: z.object({ id: zs.id(), estado: z.enum(["INCUMPLIDO", "CUMPLIDO", "ANULADO", "VIGENTE"]), motivo: zs.optText(300) }) },
  async ({ id, estado, motivo }, ctx) => done({ id: (await cambiarEstadoAcuerdo(ctx, id, estado, motivo)).id }),
);

export const adjuntarAcuerdoAction = action({ perm: "cartera.acuerdos", schema: z.object({ id: zs.id(), documentoUrl: zs.text(1, 500) }) }, async ({ id, documentoUrl }, ctx) => {
  await adjuntarDocumentoAcuerdo(ctx, id, documentoUrl);
  return done(true);
});

// ── Paz y salvo ──
export const solicitarPazYSalvoAction = action({ perm: "paz_y_salvo.emitir", schema: z.object({ unidadId: zs.id() }) }, async ({ unidadId }, ctx) => {
  const r = await solicitarPazYSalvo(ctx, unidadId);
  if (!r.ok) throw new AppError(r.mensaje);
  return done({ id: r.certificado.id, codigo: r.certificado.codigo });
});

export const emitirPazYSalvoAction = action(
  { perm: "paz_y_salvo.emitir", schema: z.object({ unidadId: zs.id(), personaNombre: zs.optText(120), observaciones: zs.text(3, 500), vigenciaDias: zs.optInt() }) },
  async (input, ctx) => done({ id: (await emitirPazYSalvoManual(ctx, input)).id }),
);

export const anularPazYSalvoAction = action({ perm: "paz_y_salvo.emitir", schema: z.object({ id: zs.id(), motivo: MOTIVO }) }, async ({ id, motivo }, ctx) => {
  await anularPazYSalvo(ctx, id, motivo);
  return done(true);
});

// ── Conciliación bancaria ──
export const guardarCuentaAction = action(
  { perm: "pagos.conciliar", schema: z.object({ id: zs.optId(), banco: zs.text(2, 60), tipo: z.enum(["AHORROS", "CORRIENTE"]), numero: zs.text(4, 30), titular: zs.text(2, 120), convenio: zs.optText(40), activa: zs.bool() }) },
  async (input, ctx) => done({ id: (await guardarCuentaBancaria(ctx, input)).id }),
);

export const eliminarCuentaAction = action({ perm: "pagos.conciliar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await eliminarCuentaBancaria(ctx, id);
  return done(true);
});

export const cargarExtractoAction = action(
  { perm: "pagos.conciliar", schema: z.object({ cuentaId: zs.optId(), archivoUrl: zs.text(1, 500), periodo: OPT_PERIODO }) },
  async (input, ctx) => done(await cargarExtracto(ctx, input)),
);

export const reemparejarAction = action({ perm: "pagos.conciliar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => done(await emparejarAutomatico(ctx, id)));

export const crearPagoLineaAction = action(
  { perm: ["pagos.conciliar"], schema: z.object({ lineaId: zs.id(), unidadId: zs.id(), medio: z.enum(["CONSIGNACION", "TRANSFERENCIA", "PSE"]) }) },
  async (input, ctx) => done({ id: (await crearPagoDesdeLinea(ctx, input)).id }),
);

export const emparejarLineaAction = action({ perm: "pagos.conciliar", schema: z.object({ lineaId: zs.id(), pagoId: zs.id() }) }, async ({ lineaId, pagoId }, ctx) => {
  await emparejarManual(ctx, lineaId, pagoId);
  return done(true);
});

export const ignorarLineaAction = action({ perm: "pagos.conciliar", schema: z.object({ lineaId: zs.id(), motivo: zs.optText(200) }) }, async ({ lineaId, motivo }, ctx) => {
  await ignorarLinea(ctx, lineaId, motivo);
  return done(true);
});

export const deshacerLineaAction = action({ perm: "pagos.conciliar", schema: z.object({ lineaId: zs.id() }) }, async ({ lineaId }, ctx) => {
  await deshacerLinea(ctx, lineaId);
  return done(true);
});

export const cerrarConciliacionAction = action({ perm: "pagos.conciliar", schema: z.object({ id: zs.id() }) }, async ({ id }, ctx) => {
  await cerrarConciliacion(ctx, id);
  return done(true);
});
