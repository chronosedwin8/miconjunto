import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { diffDays, periodoActual, parseLocal, toNumber } from "@/lib/format";
import { RANGOS_MORA, rangoMora, round, sumarMeses } from "./calculos";
import { titularesPrincipales } from "./comun";

type TCtx = Pick<Ctx, "db" | "conjunto">;

export type FilaCartera = {
  unidadId: string;
  codigo: string;
  torreId: string | null;
  torre: string | null;
  propietario: string | null;
  total: number;
  vencido: number;
  porVencer: number;
  saldoAFavor: number;
  diasMora: number;
  rango: (typeof RANGOS_MORA)[number];
  aging: Record<(typeof RANGOS_MORA)[number], number>;
  enAcuerdo: boolean;
};

/** Saldos a favor por unidad (pagos aprobados − aplicaciones vigentes). */
export async function saldosAFavor(ctx: Pick<Ctx, "db">) {
  const pagos = await ctx.db.pago.findMany({ where: { estado: "APROBADO" }, select: { unidadId: true, valor: true, aplicaciones: { where: { deletedAt: null }, select: { valor: true } } } });
  const m = new Map<string, number>();
  for (const p of pagos) {
    const libre = toNumber(p.valor) - p.aplicaciones.reduce((a, x) => a + toNumber(x.valor), 0);
    if (libre > 0.5) m.set(p.unidadId, round((m.get(p.unidadId) ?? 0) + libre));
  }
  return m;
}

/** Cartera por unidad (aging) — base del tablero, la lista de morosos, las cartas y la exportación. */
export async function carteraPorUnidad(ctx: TCtx, opts?: { torreId?: string | null; hoy?: Date; conPropietario?: boolean }): Promise<FilaCartera[]> {
  const hoy = opts?.hoy ?? new Date();
  const whereUnidad = opts?.torreId ? (opts.torreId === "casas" ? { torreId: null } : { torreId: opts.torreId }) : {};
  const [unidades, cuotas, favor, acuerdos] = await Promise.all([
    ctx.db.unidad.findMany({ where: whereUnidad, select: { id: true, codigo: true, torreId: true, torre: { select: { nombre: true } } } }),
    ctx.db.cuota.findMany({ where: { estado: { in: ["PENDIENTE", "PARCIAL", "EN_ACUERDO"] }, saldo: { gt: 0 }, unidad: whereUnidad }, select: { unidadId: true, saldo: true, fechaVencimiento: true } }),
    saldosAFavor(ctx),
    ctx.db.acuerdoPago.findMany({ where: { estado: "VIGENTE" }, select: { unidadId: true } }),
  ]);
  const enAcuerdo = new Set(acuerdos.map((a) => a.unidadId));
  const props = opts?.conPropietario === false ? new Map() : await titularesPrincipales(ctx, unidades.map((u) => u.id));
  const filas = new Map<string, FilaCartera>(
    unidades.map((u) => [
      u.id,
      {
        unidadId: u.id,
        codigo: u.codigo,
        torreId: u.torreId,
        torre: u.torre?.nombre ?? null,
        propietario: props.get(u.id)?.nombre ?? null,
        total: 0,
        vencido: 0,
        porVencer: 0,
        saldoAFavor: favor.get(u.id) ?? 0,
        diasMora: 0,
        rango: "AL_DIA",
        aging: Object.fromEntries(RANGOS_MORA.map((r) => [r, 0])) as FilaCartera["aging"],
        enAcuerdo: enAcuerdo.has(u.id),
      },
    ]),
  );
  for (const c of cuotas) {
    const f = filas.get(c.unidadId);
    if (!f) continue;
    const s = toNumber(c.saldo);
    const dias = Math.max(0, diffDays(hoy, c.fechaVencimiento));
    f.total += s;
    if (dias > 0) {
      f.vencido += s;
      f.diasMora = Math.max(f.diasMora, dias);
    } else f.porVencer += s;
    f.aging[rangoMora(dias)] += s;
  }
  for (const f of filas.values()) {
    f.total = round(f.total);
    f.vencido = round(f.vencido);
    f.porVencer = round(f.porVencer);
    f.rango = rangoMora(f.diasMora);
  }
  return [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

export type SerieMes = { periodo: string; facturado: number; recaudado: number };

/** Facturado (cuotas emitidas, sin intereses ni anuladas) vs. recaudado (pagos aprobados) de los últimos N meses. */
export async function serieRecaudo(ctx: Pick<Ctx, "db">, meses = 6, hoy = new Date(), torreId?: string | null): Promise<SerieMes[]> {
  const actual = periodoActual(hoy);
  const periodos = Array.from({ length: meses }, (_, i) => sumarMeses(actual, i - meses + 1));
  const desde = parseLocal(`${periodos[0]}-01`);
  const unidadWhere = torreId ? { unidad: torreId === "casas" ? { torreId: null } : { torreId } } : {};
  const [cuotas, pagos] = await Promise.all([
    ctx.db.cuota.groupBy({ by: ["periodo"], where: { periodo: { in: periodos }, estado: { not: "ANULADA" }, origen: { notIn: ["INTERES", "APERTURA"] }, acuerdoId: null, ...unidadWhere }, _sum: { valorBase: true, iva: true, descuento: true } }),
    ctx.db.pago.findMany({ where: { estado: "APROBADO", fecha: { gte: desde }, ...unidadWhere }, select: { fecha: true, valor: true } }),
  ]);
  const fact = new Map(cuotas.map((c) => [c.periodo, toNumber(c._sum.valorBase) + toNumber(c._sum.iva) - toNumber(c._sum.descuento)]));
  const rec = new Map<string, number>();
  for (const p of pagos) {
    const k = periodoActual(p.fecha);
    rec.set(k, (rec.get(k) ?? 0) + toNumber(p.valor));
  }
  return periodos.map((p) => ({ periodo: p, facturado: round(fact.get(p) ?? 0), recaudado: round(rec.get(p) ?? 0) }));
}

export type ResumenCartera = {
  periodo: string;
  recaudoMes: number;
  esperadoMes: number;
  pctRecaudo: number;
  carteraTotal: number;
  carteraVencida: number;
  unidades: number;
  unidadesEnMora: number;
  pctUnidadesMora: number;
  pctMora: number;
  aging: Record<(typeof RANGOS_MORA)[number], number>;
  topMorosos: FilaCartera[];
  proyeccion: { dias: number; porVencer: number; tasaRecaudo: number; esperadoPorVencer: number; recuperacionVencida: number; acuerdos: number; total: number };
  serie: SerieMes[];
  acuerdosVigentes: number;
};

/**
 * Indicadores del tablero de cartera: recaudo del mes vs. esperado, % de mora, aging, top morosos, proyección de
 * recaudo a 30 días (por vencer × tasa histórica de recaudo + recuperación de vencida + cuotas de acuerdos).
 */
export async function resumenCartera(ctx: TCtx, opts?: { torreId?: string | null; hoy?: Date; top?: number }): Promise<ResumenCartera> {
  const hoy = opts?.hoy ?? new Date();
  const cfg = conjuntoConfig(ctx);
  const [filas, serie] = await Promise.all([carteraPorUnidad(ctx, { torreId: opts?.torreId, hoy }), serieRecaudo(ctx, 6, hoy, opts?.torreId)]);
  const periodo = periodoActual(hoy);
  const mes = serie[serie.length - 1];
  const aging = Object.fromEntries(RANGOS_MORA.map((r) => [r, round(filas.reduce((s, f) => s + f.aging[r], 0))])) as ResumenCartera["aging"];
  const carteraTotal = round(filas.reduce((s, f) => s + f.total, 0));
  const carteraVencida = round(filas.reduce((s, f) => s + Math.max(0, f.vencido - f.saldoAFavor), 0));
  const morosos = filas.filter((f) => f.vencido - f.saldoAFavor > cfg.bloqueoMora.montoMinimo);
  // Tasa histórica de recaudo: recaudado / facturado de los 3 meses anteriores (acotada a 0–100 %).
  const previos = serie.slice(-4, -1);
  const fact3 = previos.reduce((s, x) => s + x.facturado, 0);
  const rec3 = previos.reduce((s, x) => s + x.recaudado, 0);
  const tasaRecaudo = fact3 > 0 ? Math.min(1, rec3 / fact3) : 0.85;
  const en30 = new Date(hoy.getTime() + 30 * 86_400_000);
  const [porVencer30, acuerdos30, acuerdosVigentes] = await Promise.all([
    ctx.db.cuota.aggregate({ where: { estado: { in: ["PENDIENTE", "PARCIAL"] }, acuerdoId: null, fechaVencimiento: { gte: hoy, lte: en30 }, ...(opts?.torreId ? { unidad: opts.torreId === "casas" ? { torreId: null } : { torreId: opts.torreId } } : {}) }, _sum: { saldo: true } }),
    ctx.db.cuota.aggregate({ where: { estado: { in: ["PENDIENTE", "PARCIAL"] }, acuerdoId: { not: null }, fechaVencimiento: { gte: hoy, lte: en30 } }, _sum: { saldo: true } }),
    ctx.db.acuerdoPago.count({ where: { estado: "VIGENTE" } }),
  ]);
  const pv = toNumber(porVencer30._sum.saldo);
  const esperadoPorVencer = round(pv * tasaRecaudo);
  const recuperacionVencida = round(carteraVencida * 0.1); // supuesto conservador: 10 % de la vencida se recupera en 30 días
  const acuerdos = round(toNumber(acuerdos30._sum.saldo) * 0.8);
  return {
    periodo,
    recaudoMes: mes?.recaudado ?? 0,
    esperadoMes: mes?.facturado ?? 0,
    pctRecaudo: mes && mes.facturado > 0 ? (mes.recaudado / mes.facturado) * 100 : 0,
    carteraTotal,
    carteraVencida,
    unidades: filas.length,
    unidadesEnMora: morosos.length,
    pctUnidadesMora: filas.length ? (morosos.length / filas.length) * 100 : 0,
    pctMora: mes && mes.facturado > 0 ? (carteraVencida / mes.facturado) * 100 : 0,
    aging,
    topMorosos: [...morosos].sort((a, b) => b.vencido - a.vencido).slice(0, opts?.top ?? 10),
    proyeccion: { dias: 30, porVencer: round(pv), tasaRecaudo, esperadoPorVencer, recuperacionVencida, acuerdos, total: esperadoPorVencer + recuperacionVencida + acuerdos },
    serie,
    acuerdosVigentes,
  };
}
