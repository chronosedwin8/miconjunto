/**
 * Servicio de reservas de zonas comunes: disponibilidad, validación (traslapes, horario, reglas, mora),
 * creación con cobro (cuota ALQUILER_ZONA + depósito), aprobación, cancelación con política de reembolso,
 * check-in/check-out con acta, no-show, calificación, bloqueos y reglas extra.
 * Las reglas puras viven en `./reglas.ts`.
 */
import type { Prisma, Reserva, ZonaComun } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { systemCtx } from "@/lib/auth/system-ctx";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { anularCargo, crearCargo, unidadAlDia } from "@/lib/cartera/core";
import { can, seesAll } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso, usuariosDeUnidad } from "@/lib/notificaciones";
import { nextConsecutivo } from "@/lib/consecutivo";
import { AppError, notFound } from "@/lib/errors";
import { cop, fecha as fmtFecha, fechaHora, hora as fmtHora, toNumber } from "@/lib/format";
import { anularFacturaPendiente, emitirNotaCredito, encolarFacturaReserva } from "@/lib/facturacion/service";
import {
  ESTADOS_CUENTAN,
  ESTADOS_OCUPAN,
  type DiaDisponibilidad,
  type HorarioZona,
  diaSemana,
  fechaHoraBogota,
  fechaLocal,
  hhmm,
  horarioDia,
  mapaFestivos,
  politicaCancelacion,
  rangoFechas,
  sumarDias,
  validarSolicitud,
  valoresReserva,
} from "./reglas";

type Db = Ctx["db"];
const MS_H = 3_600_000;

// ─────────────────────────── Visibilidad y permisos ───────────────────────────

export function esPropia(ctx: Pick<Ctx, "unidadIds" | "userId">, r: { unidadId: string; usuarioId: string | null }) {
  return ctx.unidadIds.includes(r.unidadId) || (!!r.usuarioId && r.usuarioId === ctx.userId);
}

/** ¿Puede ver el detalle de la reserva? (ajenas solo con `reservas.ver_todos`). */
export function puedeVer(ctx: Ctx, r: { unidadId: string; usuarioId: string | null }) {
  return seesAll(ctx, "reservas") || (can(ctx, "reservas.ver") && esPropia(ctx, r));
}

export async function reservaVisible(ctx: Ctx, id: string) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true, unidad: { select: { id: true, codigo: true } } } });
  if (!r || !puedeVer(ctx, r)) notFound("La reserva");
  return r;
}

// ─────────────────────────── Zonas y disponibilidad ───────────────────────────

export async function zonasReservables(ctx: Pick<Ctx, "db">) {
  return ctx.db.zonaComun.findMany({ where: { reservable: true, estado: { in: ["ACTIVA", "MANTENIMIENTO"] } }, orderBy: [{ tarifa: "desc" }, { nombre: "asc" }] });
}

export function infoZona(z: ZonaComun, reglas: { tipo: string; valor: unknown; descripcion: string | null }[] = []) {
  return {
    id: z.id,
    nombre: z.nombre,
    categoria: z.categoria,
    descripcion: z.descripcion,
    fotos: z.fotos,
    capacidad: z.capacidad,
    horario: z.horario as HorarioZona,
    reservable: z.reservable,
    estado: z.estado,
    requiereAprobacion: z.requiereAprobacion,
    duracionMinimaMin: z.duracionMinimaMin,
    duracionMaximaMin: z.duracionMaximaMin,
    anticipacionMinimaHoras: z.anticipacionMinimaHoras,
    anticipacionMaximaDias: z.anticipacionMaximaDias,
    maxReservasMesUnidad: z.maxReservasMesUnidad,
    reglasUso: z.reglasUso,
    politicaCancelacion: z.politicaCancelacion,
    horasCancelacionReembolso: z.horasCancelacionReembolso,
    bloqueoPorMora: z.bloqueoPorMora,
    gravaIva: z.gravaIva,
    tarifaIva: toNumber(z.tarifaIva),
    generaFactura: z.generaFactura,
    valores: valoresReserva({ tarifa: toNumber(z.tarifa), gravaIva: z.gravaIva, tarifaIva: toNumber(z.tarifaIva), deposito: toNumber(z.deposito) }),
    reglas: reglas.map((r) => ({ tipo: r.tipo, valor: r.valor, descripcion: r.descripcion })),
  };
}
export type ZonaInfo = ReturnType<typeof infoZona>;

/**
 * Disponibilidad de una zona entre dos fechas locales (máx. 62 días). Las reservas ajenas se devuelven
 * solo como "ocupado" (sin unidad ni datos), salvo para quien tiene `reservas.ver_todos`.
 */
export async function disponibilidad(ctx: Ctx, zonaId: string, desde: string, hasta: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) throw new AppError("Fechas no válidas (usa AAAA-MM-DD).");
  if (hasta < desde) throw new AppError("El rango de fechas no es válido.");
  if (rangoFechas(desde, hasta).length > 62) hasta = sumarDias(desde, 61);
  const zona = await ctx.db.zonaComun.findUnique({ where: { id: zonaId } });
  if (!zona) notFound("La zona");
  const ini = fechaHoraBogota(desde);
  const fin = fechaHoraBogota(sumarDias(hasta, 1));
  const verTodo = seesAll(ctx, "reservas");
  const [reservas, bloqueos, reglas] = await Promise.all([
    ctx.db.reserva.findMany({
      where: { zonaId, estado: { in: [...ESTADOS_OCUPAN] }, inicio: { lt: fin }, fin: { gt: ini } },
      select: { id: true, inicio: true, fin: true, estado: true, unidadId: true, usuarioId: true, unidad: { select: { codigo: true } } },
      orderBy: { inicio: "asc" },
    }),
    ctx.db.bloqueoZona.findMany({ where: { zonaId, inicio: { lt: fin }, fin: { gt: ini } }, orderBy: { inicio: "asc" } }),
    ctx.db.reglaReserva.findMany({ where: { zonaId, activa: true } }),
  ]);
  const festivos = mapaFestivos(desde, hasta);
  const dias: DiaDisponibilidad[] = rangoFechas(desde, hasta).map((f) => {
    const h = horarioDia(zona.horario as HorarioZona, diaSemana(f));
    const dIni = fechaHoraBogota(f).getTime();
    const dFin = dIni + 24 * MS_H;
    const cruza = (x: { inicio: Date; fin: Date }) => x.inicio.getTime() < dFin && x.fin.getTime() > dIni;
    return {
      fecha: f,
      festivo: festivos.get(f) ?? null,
      abre: h ? hhmm(h.abre) : null,
      cierra: h ? (h.cierra === 1440 ? "24:00" : hhmm(h.cierra)) : null,
      bloqueos: bloqueos.filter(cruza).map((b) => ({ inicio: b.inicio.toISOString(), fin: b.fin.toISOString(), motivo: b.motivo, tipo: b.tipo })),
      ocupados: reservas.filter(cruza).map((r) => {
        const propia = esPropia(ctx, r);
        return propia || verTodo
          ? { inicio: r.inicio.toISOString(), fin: r.fin.toISOString(), propia, id: r.id, estado: r.estado, ...(verTodo ? { unidad: r.unidad.codigo } : {}) }
          : { inicio: r.inicio.toISOString(), fin: r.fin.toISOString(), propia: false };
      }),
    };
  });
  return { zona: infoZona(zona, reglas), desde, hasta, dias, ahora: new Date().toISOString() };
}

/** Datos de BD para validar una solicitud (ocupadas, bloqueos, reservas de la unidad, reglas). */
async function contextoBD(db: Prisma.TransactionClient, conjuntoId: string, zonaId: string, unidadId: string, inicio: Date, excluirId?: string) {
  const mesIni = fechaHoraBogota(`${fechaLocal(inicio).slice(0, 7)}-01`);
  const mesFin = new Date(mesIni.getTime() + 32 * 24 * MS_H);
  const base = { conjuntoId, deletedAt: null, zonaId, ...(excluirId ? { id: { not: excluirId } } : {}) };
  const [ocupadas, bloqueos, reservasUnidad, reglas] = await Promise.all([
    db.reserva.findMany({ where: { ...base, estado: { in: [...ESTADOS_OCUPAN] }, inicio: { lt: new Date(inicio.getTime() + 3 * 24 * MS_H) }, fin: { gt: new Date(inicio.getTime() - 3 * 24 * MS_H) } }, select: { inicio: true, fin: true } }),
    db.bloqueoZona.findMany({ where: { conjuntoId, zonaId, deletedAt: null, inicio: { lt: new Date(inicio.getTime() + 3 * 24 * MS_H) }, fin: { gt: new Date(inicio.getTime() - 3 * 24 * MS_H) } }, select: { inicio: true, fin: true, motivo: true } }),
    db.reserva.findMany({ where: { ...base, unidadId, estado: { in: [...ESTADOS_CUENTAN] }, inicio: { gte: new Date(mesIni.getTime() - 24 * MS_H), lt: mesFin } }, select: { inicio: true, fin: true } }),
    db.reglaReserva.findMany({ where: { conjuntoId, zonaId, activa: true, deletedAt: null } }),
  ]);
  return { ocupadas, bloqueos, reservasUnidad, reglas };
}

// ─────────────────────────── Crear ───────────────────────────

export type CrearReservaInput = { zonaId: string; unidadId?: string | null; inicio: Date; fin: Date; asistentes: number; motivo?: string | null };

async function personaDeUnidad(ctx: Ctx, unidadId: string) {
  if (!ctx.personaIds.length) return null;
  const v = await ctx.db.vinculoUnidad.findFirst({ where: { unidadId, personaId: { in: ctx.personaIds }, estado: "ACTIVO" }, select: { personaId: true } });
  return v?.personaId ?? ctx.personaIds[0] ?? null;
}

async function destinatariosReserva(conjuntoId: string, r: { unidadId: string; usuarioId: string | null }) {
  const ids = await usuariosDeUnidad(conjuntoId, r.unidadId);
  return [...new Set([...(r.usuarioId ? [r.usuarioId] : []), ...ids])];
}

/** Enlace al pago de las cuotas de la reserva (ruta contrato del módulo Pagos). */
export function enlacePago(cuotaIds: string[], unidadId: string, reservaId?: string) {
  return `/cuenta/pagar?cuotas=${cuotaIds.join(",")}&unidad=${unidadId}${reservaId ? `&origen=reservas&volver=${encodeURIComponent(`/reservas/detalle/${reservaId}`)}` : ""}`;
}

export async function crearReserva(ctx: Ctx, input: CrearReservaInput) {
  const zona = await ctx.db.zonaComun.findUnique({ where: { id: input.zonaId } });
  if (!zona) notFound("La zona");
  const unidadId = input.unidadId ?? ctx.unidadIds[0];
  if (!unidadId) throw new AppError("Selecciona la unidad para la que haces la reserva.");
  if (!seesAll(ctx, "reservas") && !ctx.unidadIds.includes(unidadId)) throw new AppError("Solo puedes reservar para tus unidades.", 403);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");

  // Bloqueo por mora (configurable por zona y por conjunto)
  const cfg = conjuntoConfig(ctx);
  if (zona.bloqueoPorMora && cfg.bloqueoMora.reservas) {
    const { alDia, saldo } = await unidadAlDia(ctx, unidadId);
    if (!alDia) throw new AppError(`La unidad ${unidad.codigo} tiene saldo vencido de ${cop(saldo.vencido - saldo.saldoAFavor)}. Ponte al día para reservar ${zona.nombre}.`, 402);
  }

  const zonaReglas = { ...zona, horario: zona.horario as HorarioZona };
  const v = valoresReserva({ tarifa: toNumber(zona.tarifa), gravaIva: zona.gravaIva, tarifaIva: toNumber(zona.tarifaIva), deposito: toNumber(zona.deposito) });
  const requiereCobro = v.totalAPagar > 0;
  const estado = zona.requiereAprobacion || requiereCobro ? "SOLICITADA" : "APROBADA";
  const personaId = await personaDeUnidad(ctx, unidadId);
  const ahora = new Date();

  // Validación + creación bajo bloqueo exclusivo por zona (evita traslapes por concurrencia).
  const reserva = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reserva:${zona.id}`}))`;
    const c = await contextoBD(tx, ctx.conjuntoId, zona.id, unidadId, input.inicio);
    const festivos = mapaFestivos(fechaLocal(input.inicio), fechaLocal(input.inicio));
    const errores = validarSolicitud(zonaReglas, { inicio: input.inicio, fin: input.fin, asistentes: input.asistentes }, { ahora, ...c, festivos });
    if (errores.length) throw new AppError(errores[0], 409);
    return tx.reserva.create({
      data: {
        conjuntoId: ctx.conjuntoId,
        zonaId: zona.id,
        unidadId,
        personaId,
        usuarioId: ctx.userId.startsWith("api:") || ctx.userId === "sistema" ? null : ctx.userId,
        inicio: input.inicio,
        fin: input.fin,
        asistentes: input.asistentes,
        motivo: input.motivo ?? null,
        estado,
        valor: v.base,
        iva: v.iva,
        deposito: v.deposito,
        pagada: !requiereCobro,
        aprobadaPorId: estado === "APROBADA" ? "automatica" : null,
      },
    });
  });

  // Cobro: cuota de alquiler (con IVA) y depósito como cargo aparte (enlazado por cuotaOrigenId).
  let cuotaId: string | null = null;
  const cuotaIds: string[] = [];
  try {
    const periodo = fechaLocal(ahora).slice(0, 7);
    const cuando = `${fmtFecha(input.inicio)} ${fmtHora(input.inicio)}`;
    if (v.base > 0) {
      const c = await crearCargo(ctx, { unidadId, conceptoTipo: "ALQUILER_ZONA", valorBase: v.base, iva: v.iva, descripcion: `Alquiler ${zona.nombre} — ${cuando}`, fechaVencimiento: input.inicio, periodo, origen: "RESERVA" });
      cuotaId = c.id;
      cuotaIds.push(c.id);
    }
    if (v.deposito > 0) {
      const d = await crearCargo(ctx, { unidadId, conceptoTipo: "OTRO", valorBase: v.deposito, descripcion: `Depósito ${zona.nombre} — ${cuando} (reembolsable)`, fechaVencimiento: input.inicio, periodo, origen: "RESERVA", cuotaOrigenId: cuotaId });
      cuotaId ??= d.id;
      cuotaIds.push(d.id);
    }
  } catch (e) {
    await prisma.reserva.update({ where: { id: reserva.id }, data: { deletedAt: new Date(), estado: "CANCELADA", motivoCancelacion: "Error al generar el cobro" } });
    throw e;
  }
  const r = cuotaId ? await ctx.db.reserva.update({ where: { id: reserva.id }, data: { cuotaId } }) : reserva;
  await audit(ctx, "crear", "Reserva", r.id, undefined, r);
  await emit({ tipo: "reserva.creada", conjuntoId: ctx.conjuntoId, data: { id: r.id, zonaId: zona.id, unidadId, estado: r.estado, inicio: r.inicio.toISOString() }, actorId: ctx.userId });

  if (zona.requiereAprobacion) {
    const admins = await usuariosConPermiso(ctx.conjuntoId, ["reservas.aprobar"]);
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: admins, titulo: "Reserva por aprobar", cuerpo: `${unidad.codigo} solicitó ${zona.nombre} el ${fechaHora(r.inicio)}.`, enlace: `/reservas/detalle/${r.id}`, tipo: "RESERVA" });
  }
  return { reserva: r, cuotaIds, requierePago: requiereCobro, enlacePago: requiereCobro ? enlacePago(cuotaIds, unidadId, r.id) : null, valores: v };
}

// ─────────────────────────── Estado de pago ───────────────────────────

/** Cuotas de la reserva: la principal y el depósito (cuota con `cuotaOrigenId` = principal). */
export async function cuotasDeReserva(db: Db, r: Pick<Reserva, "cuotaId" | "unidadId">) {
  if (!r.cuotaId) return [];
  return db.cuota.findMany({ where: { OR: [{ id: r.cuotaId }, { cuotaOrigenId: r.cuotaId, origen: "RESERVA" }] }, include: { concepto: { select: { tipo: true, nombre: true } } }, orderBy: { createdAt: "asc" } });
}

/**
 * Tras un pago aprobado: si todas las cuotas de la reserva quedaron pagadas, la marca pagada, la
 * confirma (salvo aprobación pendiente), notifica y encola la factura electrónica si aplica.
 */
export async function confirmarPagoReserva(conjuntoId: string, reservaId: string, pagoId?: string | null) {
  const db = (await systemCtx(conjuntoId)).db;
  const r = await db.reserva.findUnique({ where: { id: reservaId }, include: { zona: true } });
  if (!r || r.pagada || ["CANCELADA", "RECHAZADA"].includes(r.estado)) return null;
  const cuotas = await cuotasDeReserva(db, r);
  if (!cuotas.length || cuotas.some((c) => c.estado !== "PAGADA")) return null;
  const pendienteAprobacion = r.zona.requiereAprobacion && !r.aprobadaPorId;
  const nuevo = r.estado === "SOLICITADA" && !pendienteAprobacion ? "APROBADA" : r.estado;
  const act = await db.reserva.update({ where: { id: r.id }, data: { pagada: true, pagoId: pagoId ?? r.pagoId, estado: nuevo } });
  await audit({ conjuntoId, userId: null, nombre: "Sistema" }, "pago_reserva", "Reserva", r.id, { estado: r.estado, pagada: false }, { estado: nuevo, pagada: true, pagoId });
  const usuarios = await destinatariosReserva(conjuntoId, r);
  await notify({
    conjuntoId,
    usuarioIds: usuarios,
    titulo: nuevo === "APROBADA" ? "¡Reserva confirmada!" : "Pago recibido",
    cuerpo: nuevo === "APROBADA" ? `Tu reserva de ${r.zona.nombre} el ${fechaHora(r.inicio)} quedó confirmada.` : `Recibimos el pago de ${r.zona.nombre}. La administración aprobará tu reserva pronto.`,
    enlace: `/reservas/detalle/${r.id}`,
    tipo: "RESERVA",
    canales: ["push", "email"],
  });
  if (nuevo === "APROBADA") await emit({ tipo: "reserva.aprobada", conjuntoId, data: { id: r.id, zonaId: r.zonaId, unidadId: r.unidadId } });
  if (pendienteAprobacion) {
    const admins = await usuariosConPermiso(conjuntoId, ["reservas.aprobar"]);
    await notify({ conjuntoId, usuarioIds: admins, titulo: "Reserva pagada por aprobar", cuerpo: `${r.zona.nombre} el ${fechaHora(r.inicio)} ya está pagada.`, enlace: `/reservas/detalle/${r.id}`, tipo: "RESERVA" });
  }
  if (r.zona.generaFactura && toNumber(r.valor) > 0) await encolarFacturaReserva(conjuntoId, r.id, pagoId);
  return act;
}

// ─────────────────────────── Aprobar / rechazar ───────────────────────────

export async function aprobarReserva(ctx: Ctx, id: string) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true } });
  if (!r) notFound("La reserva");
  if (r.estado !== "SOLICITADA") throw new AppError("Solo se aprueban reservas solicitadas.");
  const nuevo = r.pagada ? "APROBADA" : "SOLICITADA";
  const act = await ctx.db.reserva.update({ where: { id }, data: { aprobadaPorId: ctx.userId, estado: nuevo } });
  await audit(ctx, "aprobar", "Reserva", id, { estado: r.estado }, { estado: nuevo, aprobadaPorId: ctx.userId });
  const usuarios = await destinatariosReserva(ctx.conjuntoId, r);
  const cuotas = await cuotasDeReserva(ctx.db, r);
  const pendientes = cuotas.filter((c) => c.estado !== "PAGADA" && c.estado !== "ANULADA").map((c) => c.id);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: nuevo === "APROBADA" ? "Reserva aprobada" : "Reserva aprobada: falta el pago",
    cuerpo: nuevo === "APROBADA" ? `Tu reserva de ${r.zona.nombre} el ${fechaHora(r.inicio)} fue aprobada.` : `Aprobamos ${r.zona.nombre} el ${fechaHora(r.inicio)}. Paga para confirmarla.`,
    enlace: nuevo === "APROBADA" || !pendientes.length ? `/reservas/detalle/${id}` : enlacePago(pendientes, r.unidadId, r.id),
    tipo: "RESERVA",
    canales: ["push", "email"],
  });
  if (nuevo === "APROBADA") await emit({ tipo: "reserva.aprobada", conjuntoId: ctx.conjuntoId, data: { id, zonaId: r.zonaId, unidadId: r.unidadId }, actorId: ctx.userId });
  return act;
}

export async function rechazarReserva(ctx: Ctx, id: string, motivo: string) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true } });
  if (!r) notFound("La reserva");
  if (r.estado !== "SOLICITADA") throw new AppError("Solo se rechazan reservas solicitadas.");
  return cerrarReserva(ctx, r, { estado: "RECHAZADA", motivo: `Rechazada: ${motivo}`, porAdministracion: true });
}

// ─────────────────────────── Cancelar ───────────────────────────

export type ResumenCancelacion = ReturnType<typeof politicaCancelacion> & { notaCreditoId?: string | null };

/** Cierre de una reserva (cancelación, rechazo o vencimiento) con anulación de cobros y política de reembolso. */
async function cerrarReserva(ctx: Ctx, r: Reserva & { zona: ZonaComun }, opts: { estado: "CANCELADA" | "RECHAZADA"; motivo: string; porAdministracion: boolean }) {
  const cuotas = await cuotasDeReserva(ctx.db, r);
  // Cobros sin pagar se anulan (movimiento crédito de reversión en cartera)
  for (const c of cuotas) {
    if (["PENDIENTE", "PARCIAL"].includes(c.estado) && toNumber(c.saldo) === toNumber(c.valorBase) + toNumber(c.iva)) await anularCargo(ctx, c.id, opts.motivo);
  }
  const pol = politicaCancelacion({ pagada: r.pagada && cuotas.length > 0, inicio: r.inicio, ahora: new Date(), horasReembolso: r.zona.horasCancelacionReembolso, porAdministracion: opts.porAdministracion, valor: toNumber(r.valor) + toNumber(r.iva), deposito: toNumber(r.deposito) });
  let notaCreditoId: string | null = null;
  if (pol.tipo === "REEMBOLSO" && toNumber(r.valor) > 0) {
    const f = await ctx.db.facturaElectronica.findFirst({ where: { reservaId: r.id, tipo: "FACTURA" } });
    if (f?.estado === "VALIDADA") notaCreditoId = (await emitirNotaCredito(ctx.conjuntoId, f.id, `Cancelación de reserva ${r.zona.nombre} ${fechaHora(r.inicio)} con reembolso`, ctx)).id;
    else await anularFacturaPendiente(ctx.conjuntoId, r.id);
  }
  const reembolso = pol.reembolsoAlquiler + pol.reembolsoDeposito;
  const resumen =
    pol.tipo === "SIN_PAGO"
      ? ""
      : pol.tipo === "REEMBOLSO"
        ? ` Reembolso: ${cop(reembolso)}${notaCreditoId ? " (con nota crédito)" : ""}.`
        : ` Se retiene el alquiler (${cop(pol.retenido)}) por cancelar con menos de ${r.zona.horasCancelacionReembolso} h.${pol.reembolsoDeposito ? ` Se devuelve el depósito (${cop(pol.reembolsoDeposito)}).` : ""}`;
  const act = await ctx.db.reserva.update({ where: { id: r.id }, data: { estado: opts.estado, canceladaEn: new Date(), motivoCancelacion: `${opts.motivo}.${resumen}`.slice(0, 1000) } });
  await audit(ctx, opts.estado === "RECHAZADA" ? "rechazar" : "cancelar", "Reserva", r.id, { estado: r.estado }, { estado: opts.estado, motivo: opts.motivo, politica: pol, notaCreditoId });
  if (reembolso > 0) {
    // Registro del reembolso: auditoría + tarea para tesorería (la devolución de dinero se hace por fuera).
    await audit(ctx, "reembolso_reserva", "Reserva", r.id, undefined, { unidadId: r.unidadId, reembolsoAlquiler: pol.reembolsoAlquiler, reembolsoDeposito: pol.reembolsoDeposito, retenido: pol.retenido, pagoId: r.pagoId, notaCreditoId });
    const tesoreria = await usuariosConPermiso(ctx.conjuntoId, ["pagos.registrar", "reservas.aprobar"]);
    await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: tesoreria, titulo: "Reembolso por devolver", cuerpo: `Devolver ${cop(reembolso)} por la reserva cancelada de ${r.zona.nombre} (${fechaHora(r.inicio)}).`, enlace: `/reservas/detalle/${r.id}`, tipo: "RESERVA" });
  }
  const usuarios = await destinatariosReserva(ctx.conjuntoId, r);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios.filter((u) => u !== ctx.userId),
    titulo: opts.estado === "RECHAZADA" ? "Reserva rechazada" : "Reserva cancelada",
    cuerpo: `${r.zona.nombre} el ${fechaHora(r.inicio)}. ${opts.motivo}.${resumen}`,
    enlace: `/reservas/detalle/${r.id}`,
    tipo: "RESERVA",
    canales: ["push", "email"],
  });
  await emit({ tipo: `reserva.${opts.estado === "RECHAZADA" ? "rechazada" : "cancelada"}`, conjuntoId: ctx.conjuntoId, data: { id: r.id, zonaId: r.zonaId, unidadId: r.unidadId }, actorId: ctx.userId });
  return { reserva: act, politica: { ...pol, notaCreditoId } as ResumenCancelacion };
}

export async function cancelarReserva(ctx: Ctx, id: string, motivo?: string | null) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true } });
  if (!r) notFound("La reserva");
  const propia = esPropia(ctx, r);
  const admin = can(ctx, "reservas.cancelar_todas");
  if (!admin && !(propia && can(ctx, "reservas.crear"))) throw new AppError("No puedes cancelar esta reserva.", 403);
  if (!["SOLICITADA", "APROBADA"].includes(r.estado)) throw new AppError("Esta reserva ya no se puede cancelar.");
  if (r.checkInEn) throw new AppError("La reserva ya tuvo check-in; no se puede cancelar.");
  if (r.inicio.getTime() < Date.now() && !admin) throw new AppError("La reserva ya empezó; comunícate con la administración.");
  const porAdministracion = admin && !propia;
  return cerrarReserva(ctx, r, { estado: "CANCELADA", motivo: motivo?.trim() || (porAdministracion ? "Cancelada por la administración" : "Cancelada por el residente"), porAdministracion });
}

// ─────────────────────────── Check-in / check-out / no-show ───────────────────────────

export type ActaInput = { checklist: string[]; observaciones?: string | null; fotos?: string[] };

function acta(ctx: Ctx, items: string[], input: ActaInput) {
  return { fecha: new Date().toISOString(), porId: ctx.userId, porNombre: ctx.nombre, checklist: Object.fromEntries(items.map((i) => [i, input.checklist.includes(i)])), observaciones: input.observaciones ?? null, fotos: input.fotos ?? [] };
}

export async function checkIn(ctx: Ctx, id: string, input: ActaInput & { items: string[] }) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true, unidad: { select: { codigo: true } } } });
  if (!r) notFound("La reserva");
  if (r.estado !== "APROBADA") throw new AppError(r.estado === "SOLICITADA" ? "La reserva aún no está aprobada o pagada." : "La reserva no está activa.");
  if (r.checkInEn) throw new AppError("La reserva ya tiene check-in.");
  const ahora = Date.now();
  if (ahora < r.inicio.getTime() - 2 * MS_H) throw new AppError("El check-in se habilita 2 horas antes del inicio.");
  if (ahora > r.fin.getTime()) throw new AppError("La reserva ya terminó.");
  const a = acta(ctx, input.items, input);
  const act = await ctx.db.reserva.update({ where: { id }, data: { checkInEn: new Date(), checkInPorId: ctx.userId, actaEntrega: a, actaFotos: [...r.actaFotos, ...(input.fotos ?? [])] } });
  await audit(ctx, "check_in", "Reserva", id, undefined, a);
  await emit({ tipo: "porteria.reserva_checkin", conjuntoId: ctx.conjuntoId, data: { id, zona: r.zona.nombre, unidad: r.unidad.codigo }, actorId: ctx.userId });
  return act;
}

export type CheckOutInput = ActaInput & { items: string[]; danos: boolean; descripcionDano?: string | null; proponerMulta?: boolean; valorMulta?: number | null };

export async function checkOut(ctx: Ctx, id: string, input: CheckOutInput) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true, unidad: { select: { codigo: true } } } });
  if (!r) notFound("La reserva");
  if (!r.checkInEn) throw new AppError("Primero registra el check-in (entrega de la zona).");
  if (r.checkOutEn) throw new AppError("La reserva ya tiene check-out.");
  if (input.danos && !input.descripcionDano?.trim()) throw new AppError("Describe el daño encontrado.", 400, { descripcionDano: "Describe el daño" });
  let ticketId: string | null = null;
  let multaId: string | null = null;
  if (input.danos) {
    const anio = new Date().getFullYear();
    const n = await nextConsecutivo(ctx.conjuntoId, "RADICADO", anio);
    const t = await ctx.db.ticket.create({
      data: {
        conjuntoId: ctx.conjuntoId,
        radicado: `${anio}-${String(n).padStart(5, "0")}`,
        tipo: "DANO_ZONA_COMUN",
        unidadId: r.unidadId,
        solicitanteId: ctx.userId === "sistema" ? null : ctx.userId,
        solicitanteNombre: ctx.nombre,
        zonaId: r.zonaId,
        titulo: `Daño en ${r.zona.nombre} tras reserva de ${r.unidad.codigo}`,
        descripcion: `${input.descripcionDano}\n\nDetectado en el acta de recepción de la reserva del ${fechaHora(r.inicio)}.`,
        adjuntos: input.fotos ?? [],
        ubicacion: r.zona.nombre,
        prioridad: "ALTA",
        origen: "PORTERIA",
        fechaLimite: new Date(Date.now() + 72 * MS_H),
      },
    });
    ticketId = t.id;
    await emit({ tipo: "ticket.creado", conjuntoId: ctx.conjuntoId, data: { id: t.id, radicado: t.radicado, tipo: t.tipo, origen: "RESERVA" }, actorId: ctx.userId });
    if (input.proponerMulta) {
      const infraccion = await ctx.db.catalogoInfraccion.findFirst({ where: { codigo: "ZON-01" } });
      const valor = input.valorMulta && input.valorMulta > 0 ? input.valorMulta : toNumber(infraccion?.valorSugerido) || 0;
      const m = await ctx.db.multa.create({
        data: { conjuntoId: ctx.conjuntoId, unidadId: r.unidadId, personaId: r.personaId, infraccionId: infraccion?.id ?? null, descripcion: `Daño en ${r.zona.nombre} durante la reserva del ${fechaHora(r.inicio)}: ${input.descripcionDano}`, evidencias: input.fotos ?? [], valor, estado: "PROPUESTA" },
      });
      multaId = m.id;
    }
  }
  const a = { ...acta(ctx, input.items, input), danos: input.danos, descripcionDano: input.descripcionDano ?? null, ticketId, multaId };
  const act = await ctx.db.reserva.update({ where: { id }, data: { checkOutEn: new Date(), checkOutPorId: ctx.userId, actaRecepcion: a, actaFotos: [...r.actaFotos, ...(input.fotos ?? [])], estado: "CUMPLIDA" } });
  await audit(ctx, "check_out", "Reserva", id, undefined, a);
  const deposito = toNumber(r.deposito);
  if (deposito > 0 && r.pagada) {
    const admins = await usuariosConPermiso(ctx.conjuntoId, ["reservas.aprobar"]);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: admins,
      titulo: input.danos ? "Depósito retenido por daños" : "Depósito por devolver",
      cuerpo: input.danos ? `${r.zona.nombre} (${r.unidad.codigo}): se detectaron daños; decide sobre el depósito de ${cop(deposito)}.` : `${r.zona.nombre} (${r.unidad.codigo}) se entregó sin daños: devolver el depósito de ${cop(deposito)}.`,
      enlace: `/reservas/detalle/${id}`,
      tipo: "RESERVA",
    });
  }
  const usuarios = await destinatariosReserva(ctx.conjuntoId, r);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: usuarios, titulo: "¿Cómo te fue?", cuerpo: `Gracias por usar ${r.zona.nombre}. Califica tu experiencia.`, enlace: `/reservas/detalle/${id}`, tipo: "RESERVA" });
  return { reserva: act, ticketId, multaId };
}

export async function marcarNoShow(ctx: Ctx, id: string) {
  const r = await ctx.db.reserva.findUnique({ where: { id }, include: { zona: true } });
  if (!r) notFound("La reserva");
  if (r.estado !== "APROBADA" || r.checkInEn) throw new AppError("Solo se marca 'no se presentó' en reservas aprobadas sin check-in.");
  if (Date.now() < r.inicio.getTime()) throw new AppError("La reserva aún no ha empezado.");
  const act = await ctx.db.reserva.update({ where: { id }, data: { estado: "NO_SHOW" } });
  await audit(ctx, "no_show", "Reserva", id, { estado: r.estado }, { estado: "NO_SHOW" });
  const usuarios = await destinatariosReserva(ctx.conjuntoId, r);
  await notify({ conjuntoId: ctx.conjuntoId, usuarioIds: usuarios, titulo: "Reserva no utilizada", cuerpo: `No registramos tu llegada a ${r.zona.nombre} (${fechaHora(r.inicio)}).`, enlace: `/reservas/detalle/${id}`, tipo: "RESERVA" });
  return act;
}

export async function calificarReserva(ctx: Ctx, id: string, calificacion: number, comentario?: string | null) {
  const r = await ctx.db.reserva.findUnique({ where: { id } });
  if (!r || !esPropia(ctx, r)) notFound("La reserva");
  if (r.estado !== "CUMPLIDA") throw new AppError("Puedes calificar cuando la reserva se haya cumplido.");
  if (calificacion < 1 || calificacion > 5) throw new AppError("La calificación va de 1 a 5 estrellas.");
  const act = await ctx.db.reserva.update({ where: { id }, data: { calificacion, comentarioCalificacion: comentario ?? null } });
  await audit(ctx, "calificar", "Reserva", id, undefined, { calificacion, comentario });
  return act;
}

// ─────────────────────────── Bloqueos y reglas ───────────────────────────

export type BloqueoInput = { zonaIds: string[]; inicio: Date; fin: Date; motivo: string; tipo: string; cancelarAfectadas?: boolean };

export async function crearBloqueo(ctx: Ctx, input: BloqueoInput) {
  if (input.fin <= input.inicio) throw new AppError("El fin del bloqueo debe ser posterior al inicio.");
  if (!input.zonaIds.length) throw new AppError("Selecciona al menos una zona.");
  const afectadas = await ctx.db.reserva.findMany({ where: { zonaId: { in: input.zonaIds }, estado: { in: ["SOLICITADA", "APROBADA"] }, inicio: { lt: input.fin }, fin: { gt: input.inicio } }, include: { zona: true } });
  if (afectadas.length && !input.cancelarAfectadas) throw new AppError(`Hay ${afectadas.length} reserva(s) en ese horario. Marca "Cancelar reservas afectadas" para continuar (se reembolsan completas).`, 409);
  const creados = [];
  for (const zonaId of input.zonaIds) {
    const b = await ctx.db.bloqueoZona.create({ data: { conjuntoId: ctx.conjuntoId, zonaId, inicio: input.inicio, fin: input.fin, motivo: input.motivo, tipo: input.tipo } });
    creados.push(b);
  }
  for (const r of afectadas) await cerrarReserva(ctx, r, { estado: "CANCELADA", motivo: `Zona bloqueada: ${input.motivo}`, porAdministracion: true });
  await audit(ctx, "bloquear", "BloqueoZona", creados[0]?.id, undefined, { ...input, canceladas: afectadas.length });
  return { creados: creados.length, canceladas: afectadas.length };
}

export async function eliminarBloqueo(ctx: Ctx, id: string) {
  const b = await ctx.db.bloqueoZona.findUnique({ where: { id } });
  if (!b) notFound("El bloqueo");
  await ctx.db.bloqueoZona.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "BloqueoZona", id, b);
}

/** Crea bloqueos de día completo para los festivos de Colombia del año en las zonas elegidas. */
export async function bloquearFestivos(ctx: Ctx, zonaIds: string[], anio: number, festivos: { fecha: string; nombre: string }[]) {
  let n = 0;
  const hoy = fechaLocal(new Date());
  for (const zonaId of zonaIds) {
    for (const f of festivos) {
      if (f.fecha < hoy) continue;
      const inicio = fechaHoraBogota(f.fecha);
      const fin = fechaHoraBogota(sumarDias(f.fecha, 1));
      const ya = await ctx.db.bloqueoZona.findFirst({ where: { zonaId, tipo: "FESTIVO", inicio } });
      if (ya) continue;
      await ctx.db.bloqueoZona.create({ data: { conjuntoId: ctx.conjuntoId, zonaId, inicio, fin, motivo: `Festivo: ${f.nombre}`, tipo: "FESTIVO" } });
      n++;
    }
  }
  await audit(ctx, "bloquear_festivos", "BloqueoZona", null, undefined, { zonaIds, anio, creados: n });
  return n;
}

export async function guardarRegla(ctx: Ctx, input: { zonaId: string; tipo: string; valor: Record<string, unknown>; descripcion?: string | null }) {
  const zona = await ctx.db.zonaComun.findUnique({ where: { id: input.zonaId } });
  if (!zona) notFound("La zona");
  const ya = await ctx.db.reglaReserva.findFirst({ where: { zonaId: input.zonaId, tipo: input.tipo } });
  const r = ya
    ? await ctx.db.reglaReserva.update({ where: { id: ya.id }, data: { valor: input.valor as Prisma.InputJsonValue, descripcion: input.descripcion ?? null, activa: true } })
    : await ctx.db.reglaReserva.create({ data: { conjuntoId: ctx.conjuntoId, zonaId: input.zonaId, tipo: input.tipo, valor: input.valor as Prisma.InputJsonValue, descripcion: input.descripcion ?? null } });
  await audit(ctx, ya ? "editar" : "crear", "ReglaReserva", r.id, ya, r);
  return r;
}

export async function eliminarRegla(ctx: Ctx, id: string) {
  await ctx.db.reglaReserva.update({ where: { id }, data: { deletedAt: new Date(), activa: false } });
  await audit(ctx, "eliminar", "ReglaReserva", id);
}

// ─────────────────────────── Jobs ───────────────────────────

/**
 * Cierre automático: SOLICITADAS cuyo inicio ya pasó se cancelan (sin pago o sin aprobación);
 * APROBADAS terminadas hace 2 h pasan a CUMPLIDA (con check-in, o zonas sin cobro ni acta) o NO_SHOW.
 */
export async function cerrarReservasVencidas(conjuntoId: string, ahora = new Date()) {
  const ctx = await systemCtx(conjuntoId);
  const vencidas = await ctx.db.reserva.findMany({ where: { estado: "SOLICITADA", inicio: { lte: ahora } }, include: { zona: true } });
  for (const r of vencidas) await cerrarReserva(ctx, r, { estado: "CANCELADA", motivo: r.pagada ? "No fue aprobada a tiempo" : "No se pagó a tiempo", porAdministracion: true });
  const terminadas = await ctx.db.reserva.findMany({ where: { estado: "APROBADA", fin: { lte: new Date(ahora.getTime() - 2 * MS_H) } }, include: { zona: true } });
  let cumplidas = 0;
  let noShow = 0;
  for (const r of terminadas) {
    const requiereActa = toNumber(r.zona.tarifa) > 0 || toNumber(r.zona.deposito) > 0;
    const estado = r.checkInEn || !requiereActa ? "CUMPLIDA" : "NO_SHOW";
    await ctx.db.reserva.update({ where: { id: r.id }, data: { estado } });
    if (estado === "CUMPLIDA") cumplidas++;
    else noShow++;
  }
  return { canceladas: vencidas.length, cumplidas, noShow };
}

/** Recordatorio 24 h antes (el job corre cada hora: ventana [23 h, 24 h)). */
export async function enviarRecordatorios(conjuntoId: string, ahora = new Date()) {
  const db = (await systemCtx(conjuntoId)).db;
  const rs = await db.reserva.findMany({ where: { estado: "APROBADA", inicio: { gte: new Date(ahora.getTime() + 23 * MS_H), lt: new Date(ahora.getTime() + 24 * MS_H) } }, include: { zona: true } });
  for (const r of rs) {
    const usuarios = await destinatariosReserva(conjuntoId, r);
    await notify({ conjuntoId, usuarioIds: usuarios, titulo: "Tu reserva es mañana", cuerpo: `${r.zona.nombre}: ${fechaHora(r.inicio)} a ${fmtHora(r.fin)}. ${r.zona.reglasUso ?? ""}`.trim(), enlace: `/reservas/detalle/${r.id}`, tipo: "RESERVA", canales: ["push", "email"] });
  }
  return rs.length;
}

// ─────────────────────────── Consultas para páginas ───────────────────────────

export const ESTADOS_RESERVA = ["SOLICITADA", "APROBADA", "RECHAZADA", "CANCELADA", "CUMPLIDA", "NO_SHOW"] as const;

export function whereReservas(ctx: Ctx, f: { zona?: string; estado?: string; desde?: string; hasta?: string; q?: string; soloPropias?: boolean }): Prisma.ReservaWhereInput {
  const propias = f.soloPropias || !seesAll(ctx, "reservas");
  return {
    ...(propias ? { OR: [{ unidadId: { in: ctx.unidadIds } }, { usuarioId: ctx.userId }] } : {}),
    ...(f.zona ? { zonaId: f.zona } : {}),
    ...(f.estado ? { estado: f.estado as never } : {}),
    ...(f.desde || f.hasta ? { inicio: { ...(f.desde ? { gte: fechaHoraBogota(f.desde) } : {}), ...(f.hasta ? { lt: fechaHoraBogota(sumarDias(f.hasta, 1)) } : {}) } } : {}),
    ...(f.q ? { unidad: { codigo: { contains: f.q, mode: "insensitive" } } } : {}),
  };
}

/** Reservas del día (hora de Bogotá) para portería. */
export async function reservasDelDia(ctx: Ctx, dia = fechaLocal(new Date())) {
  return ctx.db.reserva.findMany({
    where: { estado: { in: ["APROBADA", "SOLICITADA", "CUMPLIDA", "NO_SHOW"] }, inicio: { lt: fechaHoraBogota(sumarDias(dia, 1)) }, fin: { gt: fechaHoraBogota(dia) } },
    include: { zona: true, unidad: { select: { codigo: true } } },
    orderBy: { inicio: "asc" },
  });
}

/** Nombre de la persona que reservó. */
export async function nombrePersona(db: Db, personaId: string | null) {
  if (!personaId) return null;
  const p = await db.persona.findUnique({ where: { id: personaId }, select: { nombres: true, apellidos: true, telefono: true } });
  return p ? { nombre: `${p.nombres} ${p.apellidos}`.trim(), telefono: p.telefono } : null;
}
