import type { Pago, Pasarela, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { systemCtx } from "@/lib/auth/system-ctx";
import { prisma } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/email";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { aplicarPago, registrarPago, saldoUnidad, type SaldoUnidad } from "@/lib/cartera/core";
import { can } from "@/lib/permisos";
import { rateLimit } from "@/lib/rate-limit";
import { toNumber } from "@/lib/format";
import { assertPagarCuenta, assertVerCuenta } from "./acceso";
import { calcularValorPago, ErrorCalculoPago, type CalculoPago, type CuotaPagable } from "./calculos";
import { proveedorConjunto, proveedorPorPasarela } from "./providers";
import { notificarResultadoPago } from "./notificar";
import { firmaEstadoPublico } from "./firmas";
import type { EventoPago, MedioEnLinea } from "./types";

/**
 * Servicio de pagos en línea (MICONJUNTO_SPEC §5.5): iniciar pago → checkout de la pasarela → webhook
 * firmado → pago APROBADO aplicado a la cartera (aplicarPago emite `pago.aprobado`) → notificación.
 */

export type IniciarPagoInput = {
  unidadId: string;
  cuotaIds?: string[] | null;
  valor?: number | null;
  medio?: MedioEnLinea;
  /** Módulo o pantalla que originó el pago (reservas, multas, correo de cobro…). */
  origen?: string | null;
  /** Ruta interna a la que vuelve el pagador (por defecto /cuenta/pagos/<referencia>). */
  returnPath?: string | null;
  pagadorNombre?: string | null;
  pagadorEmail?: string | null;
};

export type IniciarPagoResult = { pagoId: string; referencia: string; url: string; valor: number; pasarela: Pasarela; reutilizado: boolean };

type CtxPago = Ctx;

export function cuotasPagables(saldo: SaldoUnidad): CuotaPagable[] {
  return saldo.cuotas.map((c) => ({
    id: c.id,
    descripcion: c.descripcion,
    tipo: c.tipo,
    saldo: c.saldo,
    valorBase: c.valorBase,
    valorTotal: c.valorTotal,
    fechaVencimiento: c.fechaVencimiento,
    fechaProntoPago: c.fechaProntoPago,
    porcentajeProntoPago: c.porcentajeProntoPago,
  }));
}

/** Calcula el valor a pagar de una unidad (sin crear nada). */
export async function cotizarPago(ctx: Pick<Ctx, "db" | "conjunto">, input: Pick<IniciarPagoInput, "unidadId" | "cuotaIds" | "valor">): Promise<CalculoPago> {
  const saldo = await saldoUnidad(ctx, input.unidadId);
  try {
    return calcularValorPago(cuotasPagables(saldo), { cuotaIds: input.cuotaIds, valor: input.valor, permitirAbonos: conjuntoConfig(ctx).pagos.permitirAbonos });
  } catch (e) {
    if (e instanceof ErrorCalculoPago) throw new AppError(e.message);
    throw e;
  }
}

function rutaSegura(p: string | null | undefined) {
  return p && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : null;
}

const mismoConjunto = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

/**
 * Inicia un pago en línea: valida acceso, calcula el valor (cuotas / saldo total / abono), crea el `Pago`
 * PENDIENTE con referencia única y devuelve la URL del checkout. Si hay un pago PENDIENTE idéntico
 * reciente (mismo pagador, unidad, valor y cuotas), lo reutiliza con la misma referencia (reintento idempotente).
 */
export async function iniciarPagoEnLinea(ctx: CtxPago, input: IniciarPagoInput): Promise<IniciarPagoResult> {
  await assertPagarCuenta(ctx, input.unidadId);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true, codigo: true } });
  if (!unidad) notFound("La unidad");
  const calc = await cotizarPago(ctx, input);
  const provider = await proveedorConjunto(ctx.conjunto);
  const medio: MedioEnLinea = input.medio ?? "PSE";
  const cuotasSel = calc.modo === "ABONO" ? [] : calc.cuotaIds;
  const registradoPorId = ctx.userId === "sistema" ? null : ctx.userId;
  const usuario = registradoPorId ? await prisma.usuario.findUnique({ where: { id: registradoPorId }, select: { email: true, nombre: true } }) : null;
  const pagadorEmail = input.pagadorEmail ?? usuario?.email ?? null;
  const pagadorNombre = input.pagadorNombre ?? usuario?.nombre ?? null;

  // Reintento idempotente: mismo pagador + unidad + valor + cuotas + pasarela en los últimos 30 minutos.
  const candidatos = await ctx.db.pago.findMany({
    where: {
      unidadId: unidad.id,
      estado: "PENDIENTE",
      pasarela: provider.pasarela,
      valor: calc.valor,
      registradoPorId,
      createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const previo = candidatos.find((p) => mismoConjunto(p.cuotasSeleccionadas, cuotasSel) && (registradoPorId || p.pagadorEmail === pagadorEmail));

  const pago: Pago =
    previo ??
    ((await registrarPago(ctx, {
      unidadId: unidad.id,
      valor: calc.valor,
      medio,
      pasarela: provider.pasarela,
      estado: "PENDIENTE",
      cuotasSeleccionadas: cuotasSel,
      observaciones: input.origen ? `Pago en línea · origen: ${input.origen}` : "Pago en línea",
      pagadorNombre,
      pagadorEmail,
    })) as Pago);

  const returnPath =
    rutaSegura(input.returnPath)?.replace("{referencia}", encodeURIComponent(pago.referencia)).replace("{firma}", firmaEstadoPublico(pago.referencia)) ??
    `/cuenta/pagos/${pago.referencia}`;
  const checkout = await provider.crearCheckout(
    {
      id: pago.id,
      conjuntoId: ctx.conjuntoId,
      referencia: pago.referencia,
      valor: calc.valor,
      descripcion: `${ctx.conjunto.nombre} · ${unidad.codigo} · ${calc.modo === "ABONO" ? "Abono" : "Pago de cuotas"}`,
      medio,
      pagadorEmail,
      pagadorNombre,
    },
    { redirectUrl: appUrl(returnPath), webhookUrl: appUrl(`/api/webhooks/mercadopago?c=${ctx.conjuntoId}`) },
  );
  const prev = (pago.datosPasarela ?? {}) as Record<string, unknown>;
  await ctx.db.pago.update({
    where: { id: pago.id },
    data: {
      ...(previo ? { medio } : {}),
      datosPasarela: {
        ...prev,
        ...checkout.datos,
        checkoutUrl: checkout.url,
        returnPath,
        modo: calc.modo,
        descuentoEsperado: calc.descuento,
        origen: input.origen ?? null,
        intentos: Number(prev.intentos ?? 0) + 1,
      } as Prisma.InputJsonValue,
    },
  });
  await audit(ctx, previo ? "reintentar_pago_en_linea" : "iniciar_pago_en_linea", "Pago", pago.id, undefined, {
    referencia: pago.referencia,
    valor: calc.valor,
    modo: calc.modo,
    pasarela: provider.pasarela,
    cuotas: cuotasSel.length,
  });
  return { pagoId: pago.id, referencia: pago.referencia, url: checkout.url, valor: calc.valor, pasarela: provider.pasarela, reutilizado: !!previo };
}

// ── Procesamiento de eventos (webhooks y conciliación) ─────────────────

export type ResultadoEvento = "APROBADO" | "RECHAZADO" | "PENDIENTE" | "DUPLICADO" | "IGNORADO" | "MONTO_INVALIDO";

const g = globalThis as unknown as { __mcPagoLocks?: Map<string, Promise<unknown>> };
const locks: Map<string, Promise<unknown>> = (g.__mcPagoLocks ??= new Map());

/** Serializa el procesamiento por referencia dentro del proceso (webhooks simultáneos). */
async function conLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

function resumenRaw(raw: unknown) {
  try {
    const s = JSON.stringify(raw);
    return s.length > 6000 ? { truncado: true } : (JSON.parse(s) as Prisma.InputJsonValue);
  } catch {
    return null;
  }
}

/**
 * Procesa un evento ya verificado de una pasarela. Idempotente: un evento repetido no duplica la
 * aplicación ni la notificación. La transición PENDIENTE→APROBADO es atómica (updateMany condicionado).
 */
export async function procesarEventoPago(pasarela: Pasarela, evento: EventoPago): Promise<{ resultado: ResultadoEvento; pagoId?: string }> {
  return conLock(evento.referencia, async () => {
    const pago = await prisma.pago.findUnique({ where: { referencia: evento.referencia } });
    if (!pago || pago.deletedAt) return { resultado: "IGNORADO" as const };
    // Una pasarela solo puede cambiar pagos creados con ella (p. ej. el simulador nunca aprueba un pago de Wompi).
    if (pago.pasarela !== pasarela) return { resultado: "IGNORADO" as const, pagoId: pago.id };
    const ctx = await systemCtx(pago.conjuntoId);
    const prev = (pago.datosPasarela ?? {}) as Record<string, unknown>;
    const historial = Array.isArray(prev.eventos) ? (prev.eventos as unknown[]).slice(-9) : [];
    const registro = {
      estado: evento.estado,
      referenciaExterna: evento.referenciaExterna,
      medio: evento.medio,
      valor: evento.valor,
      en: new Date().toISOString(),
    };
    const datosPasarela = { ...prev, ultimoEvento: resumenRaw(evento.raw), eventos: [...historial, registro] } as Prisma.InputJsonValue;

    if (evento.estado === "APROBADO") {
      if (evento.valor !== null && Math.round(evento.valor) !== Math.round(toNumber(pago.valor))) {
        await prisma.pago.update({
          where: { id: pago.id },
          data: { datosPasarela: { ...(datosPasarela as object), alerta: `Monto reportado ${evento.valor} ≠ ${toNumber(pago.valor)}` } },
        });
        await audit(ctx, "pago_monto_invalido", "Pago", pago.id, undefined, registro);
        return { resultado: "MONTO_INVALIDO" as const, pagoId: pago.id };
      }
      const r = await prisma.pago.updateMany({
        where: { id: pago.id, estado: { in: ["PENDIENTE", "RECHAZADO", "ANULADO"] } },
        data: { estado: "APROBADO", referenciaExterna: evento.referenciaExterna ?? pago.referenciaExterna, medio: evento.medio, datosPasarela },
      });
      const ganador = r.count === 1;
      if (!ganador) {
        // Evento repetido. Solo re-aplica si un intento anterior quedó a medias (aprobado sin recibo hace > 2 min).
        const actual = await prisma.pago.findUniqueOrThrow({ where: { id: pago.id } });
        if (actual.estado === "APROBADO" && !actual.numeroRecibo && Date.now() - actual.updatedAt.getTime() > 120_000) {
          const aplicado = await aplicarPago(ctx, pago.id);
          if (aplicado.numeroRecibo) await notificarResultadoPago(ctx, pago.id, "APROBADO");
        }
        return { resultado: "DUPLICADO" as const, pagoId: pago.id };
      }
      await audit(ctx, "pago_aprobado_pasarela", "Pago", pago.id, { estado: pago.estado }, { ...registro, pasarela });
      await aplicarPago(ctx, pago.id);
      await notificarResultadoPago(ctx, pago.id, "APROBADO");
      return { resultado: "APROBADO" as const, pagoId: pago.id };
    }

    if (evento.estado === "RECHAZADO") {
      const r = await prisma.pago.updateMany({
        where: { id: pago.id, estado: "PENDIENTE" },
        data: { estado: "RECHAZADO", referenciaExterna: evento.referenciaExterna ?? pago.referenciaExterna, datosPasarela },
      });
      if (r.count !== 1) return { resultado: "DUPLICADO" as const, pagoId: pago.id };
      await audit(ctx, "pago_rechazado_pasarela", "Pago", pago.id, { estado: pago.estado }, { ...registro, pasarela });
      await notificarResultadoPago(ctx, pago.id, "RECHAZADO");
      return { resultado: "RECHAZADO" as const, pagoId: pago.id };
    }

    if (pago.estado === "PENDIENTE") {
      await prisma.pago.update({ where: { id: pago.id }, data: { datosPasarela, referenciaExterna: evento.referenciaExterna ?? pago.referenciaExterna } });
    }
    return { resultado: "PENDIENTE" as const, pagoId: pago.id };
  });
}

/** Consulta a la pasarela el estado de un pago pendiente y lo procesa (no depende de la redirección de retorno). */
export async function sincronizarPago(pagoId: string): Promise<ResultadoEvento | null> {
  const pago = await prisma.pago.findUnique({ where: { id: pagoId } });
  if (!pago || pago.estado !== "PENDIENTE") return null;
  if (pago.pasarela !== "WOMPI" && pago.pasarela !== "MERCADOPAGO") return null;
  const provider = await proveedorPorPasarela(pago.conjuntoId, pago.pasarela);
  if (!provider) return null;
  const evento = await provider.consultarEstado(pago.referencia);
  if (!evento || evento.referencia !== pago.referencia) return null;
  return (await procesarEventoPago(pago.pasarela, evento)).resultado;
}

// ── Consultas ──────────────────────────────────────────────────────────

export type PagoDetalle = Awaited<ReturnType<typeof consultarPago>>;

/** Detalle de un pago por referencia (para la página de retorno y la API). */
export async function consultarPago(ctx: Ctx, referencia: string, opts?: { sincronizar?: boolean }) {
  let pago = await ctx.db.pago.findFirst({ where: { referencia }, include: { unidad: { select: { id: true, codigo: true } } } });
  if (!pago) notFound("El pago");
  if (!can(ctx, "pagos.ver_todos") && pago.registradoPorId !== ctx.userId) await assertVerCuenta(ctx, pago.unidadId);
  if (opts?.sincronizar && pago.estado === "PENDIENTE" && Date.now() - pago.createdAt.getTime() > 60_000 && rateLimit(`pago-sync:${pago.id}`, 1, 20_000).ok) {
    await sincronizarPago(pago.id).catch((e) => console.error("[pagos] sincronización falló:", (e as Error).message));
    pago = (await ctx.db.pago.findFirst({ where: { referencia }, include: { unidad: { select: { id: true, codigo: true } } } }))!;
  }
  return serializarPago(pago);
}

export function serializarPago(p: Pago & { unidad: { id: string; codigo: string } }) {
  const d = (p.datosPasarela ?? {}) as Record<string, unknown>;
  return {
    id: p.id,
    referencia: p.referencia,
    unidadId: p.unidad.id,
    unidad: p.unidad.codigo,
    valor: toNumber(p.valor),
    estado: p.estado,
    medio: p.medio,
    pasarela: p.pasarela,
    fecha: p.fecha,
    numeroRecibo: p.numeroRecibo,
    referenciaExterna: p.referenciaExterna,
    checkoutUrl: p.estado === "PENDIENTE" && typeof d.checkoutUrl === "string" ? d.checkoutUrl : null,
    descuento: typeof d.descuentoEsperado === "number" ? d.descuentoEsperado : 0,
    modo: (d.modo as string | undefined) ?? null,
  };
}

/** Historial de pagos de una unidad (más recientes primero). */
export async function pagosDeUnidad(ctx: Ctx, unidadId: string, take = 30) {
  const rows = await ctx.db.pago.findMany({
    where: { unidadId },
    orderBy: { fecha: "desc" },
    take,
    include: { unidad: { select: { id: true, codigo: true } } },
  });
  return rows.map(serializarPago);
}

// ── Mantenimiento (jobs) ───────────────────────────────────────────────

/** Consulta a la pasarela los pagos PENDIENTES con más de `minutos` de antigüedad. */
export async function conciliarPendientes(opts?: { minutos?: number; limite?: number }) {
  const desde = new Date(Date.now() - (opts?.minutos ?? 10) * 60_000);
  const pendientes = await prisma.pago.findMany({
    where: { estado: "PENDIENTE", deletedAt: null, pasarela: { in: ["WOMPI", "MERCADOPAGO"] }, createdAt: { lt: desde } },
    orderBy: { createdAt: "asc" },
    take: opts?.limite ?? 200,
    select: { id: true },
  });
  const res: Record<string, number> = {};
  for (const p of pendientes) {
    try {
      const r = (await sincronizarPago(p.id)) ?? "SIN_CAMBIO";
      res[r] = (res[r] ?? 0) + 1;
    } catch (e) {
      res.ERROR = (res.ERROR ?? 0) + 1;
      console.error("[pagos] conciliación", p.id, (e as Error).message);
    }
  }
  return { revisados: pendientes.length, ...res };
}

/** Marca como ANULADOS los pagos en línea que siguen PENDIENTES después de `horas` (tras consultar a la pasarela). */
export async function expirarPendientes(opts?: { horas?: number }) {
  const limite = new Date(Date.now() - (opts?.horas ?? 24) * 3600_000);
  const viejos = await prisma.pago.findMany({
    where: { estado: "PENDIENTE", deletedAt: null, pasarela: { in: ["WOMPI", "MERCADOPAGO", "SIMULADOR"] }, createdAt: { lt: limite } },
    select: { id: true, conjuntoId: true, estado: true },
    take: 500,
  });
  let expirados = 0;
  for (const p of viejos) {
    await sincronizarPago(p.id).catch(() => null);
    const r = await prisma.pago.updateMany({
      where: { id: p.id, estado: "PENDIENTE" },
      data: { estado: "ANULADO", observaciones: "Pago en línea expirado: la pasarela no confirmó la transacción en 24 horas." },
    });
    if (r.count === 1) {
      expirados++;
      await audit(
        { conjuntoId: p.conjuntoId, nombre: "Sistema Conjunto360" },
        "expirar_pago_en_linea",
        "Pago",
        p.id,
        { estado: "PENDIENTE" },
        { estado: "ANULADO" },
      );
    }
  }
  return { revisados: viejos.length, expirados };
}
