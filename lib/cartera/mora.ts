import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { AppError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { fecha as fmtFecha, periodoActual, pct, startOfDayBogota, toNumber } from "@/lib/format";
import { conceptoPorTipo, crearCargo } from "./core";
import { excesoTasaMora, interesPorTramos, round, tasaEADesdeMensual, tasaMaximaMora, tasaMensualDesdeEA, type TramoTasa } from "./calculos";

type DbCtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto">;

// ─────────────── Tasa de mora ───────────────

/** Extrae el IBC guardado en la fuente de la tasa ("… · IBC 16,52 % E.A."). */
export function ibcDeFuente(fuente: string | null | undefined): number | null {
  const m = fuente?.match(/IBC\s+([\d.,]+)\s*%/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

export type TasaVigente = { tasaMensual: number; tasaEA: number; vigenteDesde: Date | null; ibcEA: number | null; fuente: string | null; id: string | null };

/** Tasa de mora vigente en una fecha: la última registrada con vigenteDesde <= fecha; si no hay, la de la configuración. */
export async function tasaMoraVigente(ctx: DbCtx, fecha = new Date()): Promise<TasaVigente> {
  const t = await ctx.db.tasaMora.findFirst({ where: { vigenteDesde: { lte: fecha } }, orderBy: [{ vigenteDesde: "desc" }, { createdAt: "desc" }] });
  if (t) return { id: t.id, tasaMensual: toNumber(t.tasaMensual), tasaEA: toNumber(t.tasaEfectivaAnual), vigenteDesde: t.vigenteDesde, ibcEA: ibcDeFuente(t.fuente), fuente: t.fuente };
  const cfg = conjuntoConfig(ctx);
  return { id: null, tasaMensual: cfg.cartera.tasaMoraMensual, tasaEA: cfg.cartera.tasaMoraEA, vigenteDesde: null, ibcEA: null, fuente: "Configuración del conjunto" };
}

/** Tramos de tasa para liquidar (historial completo + tasa de configuración como respaldo). */
export async function tramosTasa(ctx: DbCtx): Promise<{ tramos: TramoTasa[]; defecto: number }> {
  const rows = await ctx.db.tasaMora.findMany({ orderBy: { vigenteDesde: "asc" } });
  return { tramos: rows.map((r) => ({ desde: r.vigenteDesde, tasaMensual: toNumber(r.tasaMensual) })), defecto: conjuntoConfig(ctx).cartera.tasaMoraMensual };
}

export type EstadoTasa = {
  vigente: TasaVigente;
  anterior: TasaVigente | null;
  actualizadaEsteMes: boolean;
  cambioReciente: boolean;
  maximoLegalEA: number | null;
  excedeMaximo: boolean;
};

/** Estado de la tasa para alertas: si se actualizó este mes, si cambió respecto a la anterior y si respeta 1,5 × IBC. */
export async function estadoTasaMora(ctx: DbCtx, hoy = new Date()): Promise<EstadoTasa> {
  const rows = await ctx.db.tasaMora.findMany({ where: { vigenteDesde: { lte: hoy } }, orderBy: [{ vigenteDesde: "desc" }, { createdAt: "desc" }], take: 2 });
  const vigente = await tasaMoraVigente(ctx, hoy);
  const a = rows[1];
  const anterior: TasaVigente | null = a ? { id: a.id, tasaMensual: toNumber(a.tasaMensual), tasaEA: toNumber(a.tasaEfectivaAnual), vigenteDesde: a.vigenteDesde, ibcEA: ibcDeFuente(a.fuente), fuente: a.fuente } : null;
  const per = periodoActual(hoy);
  const actualizadaEsteMes = !!vigente.vigenteDesde && periodoActual(vigente.vigenteDesde) === per;
  const cambioReciente = !!anterior && !!vigente.vigenteDesde && Math.abs(anterior.tasaEA - vigente.tasaEA) > 1e-6 && hoy.getTime() - vigente.vigenteDesde.getTime() < 31 * 86_400_000;
  const maximoLegalEA = vigente.ibcEA ? tasaMaximaMora(vigente.ibcEA) : null;
  return { vigente, anterior, actualizadaEsteMes, cambioReciente, maximoLegalEA, excedeMaximo: maximoLegalEA !== null && vigente.tasaEA > maximoLegalEA + 1e-9 };
}

export type TasaInput = { ibcEA: number; tasaEA?: number | null; vigenteDesde: Date; fuente?: string | null };

/**
 * Registra la tasa de mora del mes (el administrador la actualiza mensualmente con la certificación de la
 * Superfinanciera). Por defecto usa la máxima legal: 1,5 × IBC. Rechaza tasas por encima de ese límite.
 */
export async function registrarTasaMora(ctx: Ctx, input: TasaInput) {
  if (input.ibcEA <= 0 || input.ibcEA > 60) throw new AppError("El interés bancario corriente (IBC) no es válido.", 400, { ibcEA: "Escribe el IBC efectivo anual certificado, p. ej. 16,52" });
  const tasaEA = input.tasaEA && input.tasaEA > 0 ? input.tasaEA : tasaMaximaMora(input.ibcEA);
  const exceso = excesoTasaMora(tasaEA, input.ibcEA);
  if (exceso > 0) {
    throw new AppError(`La tasa supera el máximo legal (1,5 × IBC = ${pct(tasaMaximaMora(input.ibcEA), 2)} E.A.). Ley 675 de 2001, art. 30.`, 400, { tasaEA: `Máximo ${pct(tasaMaximaMora(input.ibcEA), 2)}` });
  }
  const tasaMensual = Number(tasaMensualDesdeEA(tasaEA).toFixed(4));
  const anterior = await tasaMoraVigente(ctx, input.vigenteDesde);
  const fuente = `${input.fuente?.trim() || "Superintendencia Financiera"} · IBC ${input.ibcEA.toFixed(2).replace(".", ",")} % E.A.`;
  const t = await ctx.db.tasaMora.create({
    data: { conjuntoId: ctx.conjuntoId, vigenteDesde: input.vigenteDesde, tasaEfectivaAnual: Number(tasaEA.toFixed(4)), tasaMensual, fuente },
  });
  // Refleja la tasa vigente en la configuración (valor por defecto para nuevos cálculos).
  const conj = await ctx.db.conjunto.findUnique({ where: { id: ctx.conjuntoId }, select: { config: true } });
  const raw = (conj?.config ?? {}) as Record<string, unknown>;
  await ctx.db.conjunto.update({
    where: { id: ctx.conjuntoId },
    data: { config: { ...raw, cartera: { ...((raw.cartera as object) ?? {}), tasaMoraMensual: tasaMensual, tasaMoraEA: Number(tasaEA.toFixed(4)), tasaMoraVigenteDesde: input.vigenteDesde.toISOString() } } },
  });
  await audit(ctx, "registrar_tasa_mora", "TasaMora", t.id, { tasaEA: anterior.tasaEA, tasaMensual: anterior.tasaMensual }, { tasaEA, tasaMensual, ibcEA: input.ibcEA, vigenteDesde: input.vigenteDesde });
  if (Math.abs(anterior.tasaEA - tasaEA) > 1e-6) {
    const ids = await usuariosConPermiso(ctx.conjuntoId, ["cartera.configurar", "cartera.ver_todos"]);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: ids.filter((i) => i !== ctx.userId),
      titulo: "Cambió la tasa de interés de mora",
      cuerpo: `Desde el ${fmtFecha(input.vigenteDesde)} la tasa de mora es ${pct(tasaEA, 2)} E.A. (${pct(tasaMensual, 3)} mensual). Antes: ${pct(anterior.tasaEA, 2)} E.A.`,
      enlace: "/cartera/tasa-mora",
      tipo: "CARTERA",
    });
  }
  return t;
}

// ─────────────── Liquidación diaria de intereses ───────────────

export type LiquidacionResultado = { unidades: number; cuotas: number; interes: number };

/**
 * Liquida intereses de mora hasta `hoy` (00:00 Bogotá):
 * - Base: saldo de cada cuota vencida que NO sea de intereses (sin anatocismo) ni esté trasladada a un acuerdo.
 * - Días: desde `interesCausadoHasta` (o el vencimiento) hasta hoy, con la tasa vigente de cada tramo.
 * - Se acumula en UNA cuota INTERES_MORA por unidad y periodo (mes en curso) con un movimiento débito por cada
 *   liquidación; `Cuota.interes` guarda lo causado por cada cuota (informativo).
 * Idempotente: una segunda ejecución el mismo día no causa nada (interesCausadoHasta = hoy).
 */
export async function liquidarInteresesMora(ctx: Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">, hoyRef = new Date(), opts?: { unidadId?: string }): Promise<LiquidacionResultado> {
  const cfg = conjuntoConfig(ctx);
  const hoy = startOfDayBogota(hoyRef);
  const limiteGracia = new Date(hoy.getTime() - cfg.cartera.diasGraciaMora * 86_400_000);
  const cuotas = await ctx.db.cuota.findMany({
    where: {
      ...(opts?.unidadId ? { unidadId: opts.unidadId } : {}),
      estado: { in: ["PENDIENTE", "PARCIAL"] },
      saldo: { gt: 0 },
      fechaVencimiento: { lt: limiteGracia },
      concepto: { tipo: { not: "INTERES_MORA" } },
      OR: [{ interesCausadoHasta: null }, { interesCausadoHasta: { lt: hoy } }],
    },
    select: { id: true, unidadId: true, saldo: true, fechaVencimiento: true, interesCausadoHasta: true, periodo: true, descripcion: true },
    orderBy: { fechaVencimiento: "asc" },
  });
  if (!cuotas.length) return { unidades: 0, cuotas: 0, interes: 0 };
  const { tramos, defecto } = await tramosTasa(ctx);
  const porUnidad = new Map<string, { id: string; interes: number }[]>();
  for (const c of cuotas) {
    const desde = c.interesCausadoHasta && c.interesCausadoHasta > c.fechaVencimiento ? c.interesCausadoHasta : c.fechaVencimiento;
    const interes = interesPorTramos(toNumber(c.saldo), desde, hoy, tramos, defecto);
    const list = porUnidad.get(c.unidadId) ?? [];
    list.push({ id: c.id, interes });
    porUnidad.set(c.unidadId, list);
  }
  const periodo = periodoActual(hoy);
  const concepto = await conceptoPorTipo(ctx, "INTERES_MORA");
  let total = 0;
  let nCuotas = 0;
  for (const [unidadId, items] of porUnidad) {
    const interesUnidad = round(items.reduce((a, i) => a + i.interes, 0));
    // Marca la causación en todas las cuotas (aunque el interés del día redondee a 0).
    for (const i of items) {
      await ctx.db.cuota.update({ where: { id: i.id }, data: { interesCausadoHasta: hoy, ...(i.interes > 0 ? { interes: { increment: i.interes } } : {}) } });
    }
    if (interesUnidad <= 0) continue;
    total += interesUnidad;
    nCuotas += items.length;
    await acumularInteres(ctx, { unidadId, periodo, conceptoId: concepto.id, valor: interesUnidad, hoy, detalle: `${items.length} cuota(s) vencida(s)` });
  }
  if (total > 0) await emit({ tipo: "cartera.intereses_liquidados", conjuntoId: ctx.conjuntoId, data: { id: periodo, periodo, total, unidades: porUnidad.size }, actorId: ctx.userId });
  return { unidades: porUnidad.size, cuotas: nCuotas, interes: round(total) };
}

/** Suma interés a la cuota INTERES_MORA del periodo (la crea si no existe) con su movimiento débito. */
async function acumularInteres(ctx: Pick<Ctx, "db" | "conjuntoId">, p: { unidadId: string; periodo: string; conceptoId: string; valor: number; hoy: Date; detalle: string }) {
  const existente = await ctx.db.cuota.findFirst({
    where: { unidadId: p.unidadId, periodo: p.periodo, conceptoId: p.conceptoId, origen: "INTERES", estado: { not: "ANULADA" }, acuerdoId: null },
    include: { aplicaciones: { where: { deletedAt: null }, select: { id: true } } },
  });
  if (!existente) {
    await crearCargo(ctx, {
      unidadId: p.unidadId,
      conceptoId: p.conceptoId,
      valorBase: p.valor,
      periodo: p.periodo,
      fechaEmision: p.hoy,
      fechaVencimiento: p.hoy,
      origen: "INTERES",
    });
    return;
  }
  const saldo = toNumber(existente.saldo) + p.valor;
  await ctx.db.cuota.update({
    where: { id: existente.id },
    data: { valorBase: { increment: p.valor }, saldo, estado: existente.aplicaciones.length ? "PARCIAL" : "PENDIENTE" },
  });
  await ctx.db.movimientoCartera.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      unidadId: p.unidadId,
      fecha: p.hoy,
      tipo: "DEBITO",
      valor: p.valor,
      conceptoTipo: "INTERES_MORA",
      cuotaId: existente.id,
      descripcion: `Intereses de mora causados al ${fmtFecha(p.hoy)} (${p.detalle})`,
    },
  });
}

/** Resumen de tasa para mostrar ("1,85 % mensual · 24,36 % E.A."). */
export function textoTasa(t: { tasaMensual: number; tasaEA: number }) {
  return `${pct(t.tasaMensual, 3)} mensual · ${pct(t.tasaEA, 2)} E.A.`;
}

export { tasaEADesdeMensual };
