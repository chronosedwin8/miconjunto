import type { DistribucionCuota } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig, type ConjuntoConfig } from "@/lib/conjunto/config";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { mesNombre, toNumber } from "@/lib/format";
import { aplicarSaldosAFavor, conceptoPorTipo, crearCargo, anularCargo } from "./core";
import { cuotaAdministracion, distribuirIgual, distribuirPorCoeficiente, fechaDelPeriodo, fechasPeriodo, fraccionar, periodoValido, round, sumarMeses } from "./calculos";

type GenCtx = Pick<Ctx, "db" | "conjuntoId" | "conjunto" | "userId" | "nombre">;

/** Valor de la cuota de administración de una unidad según la configuración (coeficiente o valor fijo). */
export function valorCuotaUnidad(cfg: ConjuntoConfig, u: { coeficiente: unknown; cuotaAdministracion: unknown }) {
  return cuotaAdministracion({
    modo: cfg.cartera.calculoCuota,
    presupuestoMensual: cfg.cartera.presupuestoMensual,
    coeficiente: toNumber(u.coeficiente as number),
    valorFijo: toNumber(u.cuotaAdministracion as number),
  });
}

export type FilaGeneracion = { unidadId: string; codigo: string; torre: string | null; valor: number; existente: boolean; motivo?: string };
export type PreviaGeneracion = {
  periodo: string;
  emision: Date;
  vencimiento: Date;
  prontoPago: Date | null;
  porcentajeProntoPago: number;
  modo: string;
  filas: FilaGeneracion[];
  nuevas: number;
  existentes: number;
  sinValor: number;
  totalNuevas: number;
};

/** Previsualiza la generación de cuotas de administración de un periodo (sin escribir). */
export async function previsualizarGeneracion(ctx: GenCtx, periodo: string): Promise<PreviaGeneracion> {
  if (!periodoValido(periodo)) throw new AppError("El periodo debe tener el formato AAAA-MM.");
  const cfg = conjuntoConfig(ctx);
  const concepto = await conceptoPorTipo(ctx, "ADMINISTRACION");
  const [unidades, existentes] = await Promise.all([
    ctx.db.unidad.findMany({ select: { id: true, codigo: true, coeficiente: true, cuotaAdministracion: true, torre: { select: { nombre: true } } }, orderBy: [{ torreId: "asc" }, { codigo: "asc" }] }),
    ctx.db.cuota.findMany({ where: { periodo, conceptoId: concepto.id, origen: "GENERACION_MENSUAL", estado: { not: "ANULADA" } }, select: { unidadId: true } }),
  ]);
  const ya = new Set(existentes.map((e) => e.unidadId));
  const filas: FilaGeneracion[] = unidades.map((u) => {
    const valor = valorCuotaUnidad(cfg, u);
    return { unidadId: u.id, codigo: u.codigo, torre: u.torre?.nombre ?? null, valor, existente: ya.has(u.id), motivo: ya.has(u.id) ? "Ya generada" : valor <= 0 ? "Sin cuota de administración" : undefined };
  });
  filas.sort((a, b) => (a.torre ?? "~").localeCompare(b.torre ?? "~") || a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  const f = fechasPeriodo(periodo, cfg.cartera);
  const nuevas = filas.filter((x) => !x.existente && x.valor > 0);
  return {
    periodo,
    emision: f.emision,
    vencimiento: f.vencimiento,
    prontoPago: cfg.cartera.porcentajeProntoPago > 0 ? f.prontoPago : null,
    porcentajeProntoPago: cfg.cartera.porcentajeProntoPago,
    modo: cfg.cartera.calculoCuota,
    filas,
    nuevas: nuevas.length,
    existentes: filas.filter((x) => x.existente).length,
    sinValor: filas.filter((x) => !x.existente && x.valor <= 0).length,
    totalNuevas: round(nuevas.reduce((a, x) => a + x.valor, 0)),
  };
}

export type ResultadoGeneracion = { periodo: string; creadas: number; omitidas: number; total: number; saldosAplicados: number };

/**
 * Genera las cuotas de administración del periodo para todas las unidades (idempotente por
 * unidad + periodo + concepto: no duplica si ya existe una cuota no anulada). Luego aplica saldos a favor.
 * La usa el job mensual, la pantalla /cartera/generar y el módulo de Pagos antes de la campaña de cobro.
 */
export async function generarCuotasMes(ctx: GenCtx, periodo: string, opts?: { unidadIds?: string[] }): Promise<ResultadoGeneracion> {
  const previa = await previsualizarGeneracion(ctx, periodo);
  const cfg = conjuntoConfig(ctx);
  const concepto = await conceptoPorTipo(ctx, "ADMINISTRACION");
  const filtro = opts?.unidadIds ? new Set(opts.unidadIds) : null;
  let creadas = 0;
  let total = 0;
  const unidadesCreadas: string[] = [];
  for (const f of previa.filas) {
    if (f.existente || f.valor <= 0) continue;
    if (filtro && !filtro.has(f.unidadId)) continue;
    // Doble verificación justo antes de crear (evita duplicados si dos procesos corren a la vez).
    const dup = await ctx.db.cuota.count({ where: { unidadId: f.unidadId, periodo, conceptoId: concepto.id, origen: "GENERACION_MENSUAL", estado: { not: "ANULADA" } } });
    if (dup > 0) continue;
    await crearCargo(ctx, {
      unidadId: f.unidadId,
      conceptoId: concepto.id,
      valorBase: f.valor,
      periodo,
      fechaEmision: previa.emision,
      fechaVencimiento: previa.vencimiento,
      fechaProntoPago: previa.prontoPago,
      porcentajeProntoPago: cfg.cartera.porcentajeProntoPago,
      origen: "GENERACION_MENSUAL",
      descripcion: `Cuota de administración ${mesNombre(periodo)}`,
    });
    creadas++;
    total += f.valor;
    unidadesCreadas.push(f.unidadId);
  }
  // Saldos a favor (anticipos) se cruzan con las cuotas nuevas.
  let saldosAplicados = 0;
  if (unidadesCreadas.length) {
    const conFavor = await unidadesConSaldoAFavor(ctx, unidadesCreadas);
    for (const u of conFavor) saldosAplicados += await aplicarSaldosAFavor(ctx, u);
  }
  if (creadas > 0) {
    await audit(ctx as Ctx, "generar_cuotas", "Cuota", null, undefined, { periodo, creadas, total, saldosAplicados });
    await emit({ tipo: "cartera.cuotas_generadas", conjuntoId: ctx.conjuntoId, data: { id: periodo, periodo, creadas, total }, actorId: ctx.userId });
  }
  return { periodo, creadas, omitidas: previa.filas.length - creadas, total: round(total), saldosAplicados: round(saldosAplicados) };
}

/** Unidades (de la lista) con pagos aprobados no aplicados totalmente (saldo a favor). */
export async function unidadesConSaldoAFavor(ctx: Pick<Ctx, "db" | "conjuntoId">, unidadIds?: string[]) {
  const pagos = await ctx.db.pago.findMany({
    where: { estado: "APROBADO", ...(unidadIds ? { unidadId: { in: unidadIds } } : {}) },
    select: { unidadId: true, valor: true, aplicaciones: { where: { deletedAt: null }, select: { valor: true } } },
  });
  const favor = new Map<string, number>();
  for (const p of pagos) {
    const libre = toNumber(p.valor) - p.aplicaciones.reduce((a, x) => a + toNumber(x.valor), 0);
    if (libre > 0.5) favor.set(p.unidadId, (favor.get(p.unidadId) ?? 0) + libre);
  }
  return [...favor.keys()];
}

/** ¿Hoy corresponde generar? (día >= día de generación y aún no se generó el periodo). Lo usa el job diario. */
export function debeGenerarHoy(cfg: ConjuntoConfig, diaHoy: number) {
  return diaHoy >= cfg.cartera.diaGeneracion;
}

// ─────────────── Cuotas extraordinarias ───────────────

export type ExtraordinariaInput = {
  nombre: string;
  motivo?: string | null;
  asambleaId?: string | null;
  valorTotal: number;
  distribucion: DistribucionCuota;
  numeroCuotas: number;
  primerPeriodo: string;
  diaVencimiento: number;
  /** Para distribución MANUAL: valor total por unidad. */
  manual?: { unidadId: string; valor: number }[];
};

export type ReparticionExtra = { unidadId: string; codigo: string; total: number; cuotas: number[] };

/** Calcula cuánto le corresponde a cada unidad y sus fracciones (sin escribir). */
export async function calcularExtraordinaria(ctx: Pick<Ctx, "db">, input: Pick<ExtraordinariaInput, "valorTotal" | "distribucion" | "numeroCuotas" | "manual">): Promise<ReparticionExtra[]> {
  if (input.numeroCuotas < 1 || input.numeroCuotas > 36) throw new AppError("El número de cuotas debe estar entre 1 y 36.");
  const unidades = await ctx.db.unidad.findMany({ select: { id: true, codigo: true, coeficiente: true }, orderBy: [{ torreId: "asc" }, { codigo: "asc" }] });
  const cod = new Map(unidades.map((u) => [u.id, u.codigo]));
  let valores: { id: string; valor: number }[];
  if (input.distribucion === "POR_COEFICIENTE") {
    valores = distribuirPorCoeficiente(round(input.valorTotal), unidades.map((u) => ({ id: u.id, coeficiente: toNumber(u.coeficiente) })));
  } else if (input.distribucion === "IGUAL_POR_UNIDAD") {
    valores = distribuirIgual(round(input.valorTotal), unidades.map((u) => u.id));
  } else {
    const m = (input.manual ?? []).filter((x) => x.valor > 0 && cod.has(x.unidadId));
    if (!m.length) throw new AppError("Indica el valor por unidad (una línea por unidad: código;valor).");
    valores = m.map((x) => ({ id: x.unidadId, valor: round(x.valor) }));
  }
  return valores.filter((v) => v.valor > 0).map((v) => ({ unidadId: v.id, codigo: cod.get(v.id) ?? v.id, total: v.valor, cuotas: fraccionar(v.valor, input.numeroCuotas) }));
}

/** Convierte "T1-101;250000" (una por línea) en valores por unidad. */
export async function parsearDistribucionManual(ctx: Pick<Ctx, "db">, texto: string) {
  const unidades = await ctx.db.unidad.findMany({ select: { id: true, codigo: true } });
  const byCode = new Map(unidades.map((u) => [u.codigo.trim().toUpperCase(), u.id]));
  const out: { unidadId: string; valor: number }[] = [];
  const errores: string[] = [];
  texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((l, i) => {
      const [codigo, valorTxt] = l.split(/[;\t,]/).map((s) => s.trim());
      const id = byCode.get((codigo ?? "").toUpperCase());
      const valor = Number((valorTxt ?? "").replace(/[$.\s]/g, "").replace(",", "."));
      if (!id) errores.push(`Línea ${i + 1}: la unidad "${codigo}" no existe`);
      else if (!Number.isFinite(valor) || valor <= 0) errores.push(`Línea ${i + 1}: valor no válido`);
      else out.push({ unidadId: id, valor });
    });
  if (errores.length) throw new AppError(errores.slice(0, 5).join(". "));
  return out;
}

/** Crea la cuota extraordinaria y genera sus cuotas por unidad (N fracciones mensuales). */
export async function crearCuotaExtraordinaria(ctx: GenCtx, input: ExtraordinariaInput, hoy = new Date()) {
  if (!periodoValido(input.primerPeriodo)) throw new AppError("El primer periodo debe tener el formato AAAA-MM.");
  if (input.valorTotal <= 0 && input.distribucion !== "MANUAL") throw new AppError("El valor total debe ser mayor a cero.");
  const reparto = await calcularExtraordinaria(ctx, input);
  const valorTotal = round(reparto.reduce((a, r) => a + r.total, 0));
  const concepto = await conceptoPorTipo(ctx, "EXTRAORDINARIA");
  const extra = await ctx.db.cuotaExtraordinaria.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      nombre: input.nombre,
      motivo: input.motivo ?? null,
      asambleaId: input.asambleaId ?? null,
      valorTotal,
      distribucion: input.distribucion,
      numeroCuotas: input.numeroCuotas,
      fechaPrimeraCuota: fechaDelPeriodo(input.primerPeriodo, input.diaVencimiento),
      diaVencimiento: input.diaVencimiento,
      distribucionManual: input.distribucion === "MANUAL" ? (input.manual as object) : undefined,
    },
  });
  let n = 0;
  for (const r of reparto) {
    for (let i = 0; i < r.cuotas.length; i++) {
      const periodo = sumarMeses(input.primerPeriodo, i);
      await crearCargo(ctx, {
        unidadId: r.unidadId,
        conceptoId: concepto.id,
        valorBase: r.cuotas[i],
        periodo,
        fechaEmision: i === 0 ? hoy : fechaDelPeriodo(periodo, 1),
        fechaVencimiento: fechaDelPeriodo(periodo, input.diaVencimiento),
        origen: input.asambleaId ? "ASAMBLEA" : "MANUAL",
        cuotaExtraordinariaId: extra.id,
        descripcion: `${input.nombre}${input.numeroCuotas > 1 ? ` (${i + 1}/${input.numeroCuotas})` : ""}`,
      });
      n++;
    }
  }
  await ctx.db.cuotaExtraordinaria.update({ where: { id: extra.id }, data: { generada: true } });
  const conFavor = await unidadesConSaldoAFavor(ctx, reparto.map((r) => r.unidadId));
  for (const u of conFavor) await aplicarSaldosAFavor(ctx, u);
  await audit(ctx as Ctx, "crear_cuota_extraordinaria", "CuotaExtraordinaria", extra.id, undefined, { ...input, manual: undefined, valorTotal, cuotasGeneradas: n });
  return { id: extra.id, cuotas: n, unidades: reparto.length, valorTotal };
}

/** Anula una cuota extraordinaria: anula todas sus cuotas sin pagos. Falla si alguna ya tiene pagos. */
export async function anularCuotaExtraordinaria(ctx: Ctx, id: string, motivo: string) {
  const extra = await ctx.db.cuotaExtraordinaria.findUnique({ where: { id } });
  if (!extra) notFound("La cuota extraordinaria");
  const cuotas = await ctx.db.cuota.findMany({ where: { cuotaExtraordinariaId: id, estado: { not: "ANULADA" } }, include: { aplicaciones: { where: { deletedAt: null }, select: { id: true } } } });
  const conPagos = cuotas.filter((c) => c.aplicaciones.length > 0).length;
  if (conPagos > 0) throw new AppError(`${conPagos} cuota(s) ya tienen pagos aplicados. Anula primero esos pagos.`);
  for (const c of cuotas) await anularCargo(ctx, c.id, motivo);
  await ctx.db.cuotaExtraordinaria.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "anular", "CuotaExtraordinaria", id, extra, { motivo, cuotasAnuladas: cuotas.length });
  return { anuladas: cuotas.length };
}
