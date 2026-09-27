import type { EstadoGasto, Prisma, TipoRubro } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { emit } from "@/lib/events";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { insensitive } from "@/lib/pagination";
import { nowBogota, toNumber } from "@/lib/format";
import { acumular, ejecucionPresupuestal, rubroParaConcepto, type RubroBase } from "./calculos";
import { asientosDeGastos, OPCIONES_DEFECTO, type GastoContable, type OpcionesContables } from "./contable";

/** Límites del año en Bogotá (UTC−5). */
export function rangoAnio(anio: number) {
  return { desde: new Date(Date.UTC(anio, 0, 1, 5)), hasta: new Date(Date.UTC(anio + 1, 0, 1, 5)) };
}

/** Mes (0–11) de una fecha en Bogotá. */
export function mesBogota(d: Date) {
  return new Date(d.getTime() - 5 * 3_600_000).getUTCMonth();
}

// ───────────────────────────── Presupuesto y rubros ─────────────────────────────

export async function presupuestoDelAnio(ctx: Ctx, anio: number) {
  return ctx.db.presupuesto.findFirst({
    where: { anio },
    include: { rubros: { where: { deletedAt: null }, orderBy: [{ tipo: "desc" }, { cuentaContable: "asc" }, { nombre: "asc" }] } },
  });
}

export async function aniosConPresupuesto(ctx: Ctx) {
  const rows = await ctx.db.presupuesto.findMany({ select: { anio: true }, orderBy: { anio: "desc" } });
  return rows.map((r) => r.anio);
}

/** Crea el presupuesto del año; opcionalmente copia los rubros de otro año con un ajuste porcentual. */
export async function crearPresupuesto(ctx: Ctx, input: { anio: number; copiarDe?: number | null; incrementoPct?: number | null; notas?: string | null }) {
  if (await ctx.db.presupuesto.findFirst({ where: { anio: input.anio } })) throw new AppError(`Ya existe el presupuesto ${input.anio}.`);
  const p = await ctx.db.presupuesto.create({ data: { conjuntoId: ctx.conjuntoId, anio: input.anio, notas: input.notas ?? null } });
  if (input.copiarDe) {
    const origen = await presupuestoDelAnio(ctx, input.copiarDe);
    const f = 1 + (input.incrementoPct ?? 0) / 100;
    if (origen?.rubros.length) {
      await ctx.db.rubroPresupuesto.createMany({
        data: origen.rubros.map((r) => ({
          conjuntoId: ctx.conjuntoId,
          presupuestoId: p.id,
          tipo: r.tipo,
          nombre: r.nombre,
          cuentaContable: r.cuentaContable,
          valorAnual: Math.round((toNumber(r.valorAnual) * f) / 1000) * 1000,
        })),
      });
    }
  }
  await audit(ctx, "crear", "Presupuesto", p.id, undefined, input);
  return p;
}

export async function cambiarEstadoPresupuesto(ctx: Ctx, id: string, estado: "BORRADOR" | "APROBADO" | "CERRADO", notas?: string | null) {
  const antes = await ctx.db.presupuesto.findUnique({ where: { id } });
  if (!antes) notFound("El presupuesto");
  const p = await ctx.db.presupuesto.update({ where: { id }, data: { estado, ...(notas !== undefined ? { notas } : {}) } });
  await audit(ctx, estado === "APROBADO" ? "aprobar" : "cambiar_estado", "Presupuesto", id, { estado: antes.estado }, { estado, notas });
  return p;
}

export async function guardarRubro(ctx: Ctx, input: { id?: string | null; presupuestoId: string; tipo: TipoRubro; nombre: string; cuentaContable?: string | null; valorAnual: number }) {
  const p = await ctx.db.presupuesto.findUnique({ where: { id: input.presupuestoId } });
  if (!p) notFound("El presupuesto");
  if (p.estado === "CERRADO") throw new AppError("El presupuesto está cerrado.");
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.rubroPresupuesto.findUnique({ where: { id } });
    if (!antes) notFound("El rubro");
    const r = await ctx.db.rubroPresupuesto.update({ where: { id }, data });
    await audit(ctx, "editar", "RubroPresupuesto", id, antes, r);
    return r;
  }
  const r = await ctx.db.rubroPresupuesto.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "RubroPresupuesto", r.id, undefined, r);
  return r;
}

export async function eliminarRubro(ctx: Ctx, id: string) {
  const gastos = await ctx.db.gasto.count({ where: { rubroId: id } });
  if (gastos) throw new AppError(`El rubro tiene ${gastos} gastos asociados. Reasígnalos primero.`);
  await ctx.db.rubroPresupuesto.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "RubroPresupuesto", id);
  return true;
}

// ───────────────────────────── Ejecución ─────────────────────────────

/**
 * Ejecución vs presupuesto del año. Gastos: aprobados o pagados por fecha del gasto.
 * Ingresos: pagos aplicados (AplicacionPago) por concepto de la cuota, en la fecha del pago,
 * relacionados al rubro por cuenta contable (lectura de cartera, sin escribir).
 */
export async function ejecucion(ctx: Ctx, anio: number, hoy = new Date()) {
  const p = await presupuestoDelAnio(ctx, anio);
  if (!p) return null;
  const { desde, hasta } = rangoAnio(anio);
  const rubros: RubroBase[] = p.rubros.map((r) => ({ id: r.id, tipo: r.tipo, nombre: r.nombre, cuentaContable: r.cuentaContable, valorAnual: toNumber(r.valorAnual) }));
  const mapa = new Map<string, number[]>();

  const gastos = await ctx.db.gasto.findMany({ where: { fecha: { gte: desde, lt: hasta }, estado: { in: ["APROBADO", "PAGADO"] }, rubroId: { not: null } }, select: { rubroId: true, fecha: true, valor: true } });
  for (const g of gastos) if (g.rubroId) acumular(mapa, g.rubroId, mesBogota(g.fecha), toNumber(g.valor));

  const apps = await ctx.db.aplicacionPago.findMany({
    where: { pago: { estado: "APROBADO", fecha: { gte: desde, lt: hasta }, deletedAt: null } },
    select: { valor: true, pago: { select: { fecha: true } }, cuota: { select: { concepto: { select: { id: true, nombre: true, tipo: true, cuentaContable: true } } } } },
  });
  const cacheConcepto = new Map<string, string | null>();
  let sinRubro = 0;
  for (const a of apps) {
    const c = a.cuota.concepto;
    if (!cacheConcepto.has(c.id)) cacheConcepto.set(c.id, rubroParaConcepto(p.rubros, c));
    const rubroId = cacheConcepto.get(c.id);
    if (rubroId) acumular(mapa, rubroId, mesBogota(a.pago.fecha), toNumber(a.valor));
    else sinRubro += toNumber(a.valor);
  }
  const n = nowBogota(hoy);
  const meses = n.year > anio ? 12 : n.year < anio ? 1 : n.month;
  const r = ejecucionPresupuestal(rubros, mapa, meses);
  const [gastosSinRubro, pendientes] = await Promise.all([
    ctx.db.gasto.aggregate({ where: { fecha: { gte: desde, lt: hasta }, estado: { in: ["APROBADO", "PAGADO"] }, rubroId: null }, _sum: { valor: true } }),
    ctx.db.gasto.aggregate({ where: { estado: "PENDIENTE_APROBACION" }, _sum: { valor: true }, _count: true }),
  ]);
  return {
    presupuesto: { id: p.id, anio: p.anio, estado: p.estado, notas: p.notas },
    mesesTranscurridos: meses,
    ...r,
    ingresosSinRubro: Math.round(sinRubro),
    gastosSinRubro: toNumber(gastosSinRubro._sum.valor),
    pendientesAprobacion: { cantidad: pendientes._count, valor: toNumber(pendientes._sum.valor) },
  };
}

// ───────────────────────────── Gastos ─────────────────────────────

export type FiltrosGastos = { q?: string; estado?: string; rubroId?: string; proveedorId?: string; desde?: string; hasta?: string; anio?: string };

export function whereGastos(f: FiltrosGastos): Prisma.GastoWhereInput {
  const anio = f.anio ? Number(f.anio) : null;
  const rango = anio ? rangoAnio(anio) : null;
  return {
    ...(f.q ? { descripcion: insensitive(f.q) } : {}),
    ...(f.estado ? { estado: f.estado as EstadoGasto } : {}),
    ...(f.rubroId ? { rubroId: f.rubroId === "sin" ? null : f.rubroId } : {}),
    ...(f.proveedorId ? { proveedorId: f.proveedorId } : {}),
    ...(f.desde || f.hasta || rango
      ? {
          fecha: {
            ...(f.desde ? { gte: new Date(`${f.desde}T05:00:00Z`) } : rango ? { gte: rango.desde } : {}),
            ...(f.hasta ? { lt: new Date(new Date(`${f.hasta}T05:00:00Z`).getTime() + 86_400_000) } : rango ? { lt: rango.hasta } : {}),
          },
        }
      : {}),
  };
}

export async function listarGastos(ctx: Ctx, f: FiltrosGastos, page?: { skip: number; take: number }) {
  const where = whereGastos(f);
  const [items, total, suma] = await Promise.all([
    ctx.db.gasto.findMany({ where, include: { rubro: { select: { nombre: true, cuentaContable: true } } }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], ...(page ?? {}) }),
    ctx.db.gasto.count({ where }),
    ctx.db.gasto.aggregate({ where, _sum: { valor: true } }),
  ]);
  const provIds = [...new Set(items.map((g) => g.proveedorId).filter(Boolean) as string[])];
  const provs = provIds.length ? await ctx.db.proveedor.findMany({ where: { id: { in: provIds } }, select: { id: true, razonSocial: true, nit: true } }) : [];
  const pm = new Map(provs.map((p) => [p.id, p]));
  return { items: items.map((g) => ({ ...g, proveedor: g.proveedorId ? (pm.get(g.proveedorId) ?? null) : null })), total, suma: toNumber(suma._sum.valor) };
}

export type GastoInput = {
  id?: string | null;
  fecha: Date;
  descripcion: string;
  valor: number;
  rubroId?: string | null;
  proveedorId?: string | null;
  cuentaContable?: string | null;
  comprobanteUrl?: string | null;
};

export async function guardarGasto(ctx: Ctx, input: GastoInput) {
  if (input.rubroId) {
    const r = await ctx.db.rubroPresupuesto.findUnique({ where: { id: input.rubroId } });
    if (!r) throw new AppError("El rubro no existe.");
    if (r.tipo !== "GASTO") throw new AppError("Selecciona un rubro de gastos.", 400, { rubroId: "El rubro debe ser de gastos" });
  }
  if (input.proveedorId && !(await ctx.db.proveedor.findUnique({ where: { id: input.proveedorId } }))) throw new AppError("El proveedor no existe.");
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.gasto.findUnique({ where: { id } });
    if (!antes) notFound("El gasto");
    if (antes.estado === "PAGADO") throw new AppError("Un gasto pagado no se puede editar.");
    const g = await ctx.db.gasto.update({ where: { id }, data: { ...data, ...(antes.estado === "RECHAZADO" ? { estado: "PENDIENTE_APROBACION", aprobadoPorId: null } : {}) } });
    await audit(ctx, "editar", "Gasto", id, antes, g);
    return g;
  }
  const g = await ctx.db.gasto.create({ data: { ...data, conjuntoId: ctx.conjuntoId, estado: "PENDIENTE_APROBACION" } });
  await audit(ctx, "crear", "Gasto", g.id, undefined, g);
  await avisarGastoPendiente(ctx, g);
  return g;
}

async function avisarGastoPendiente(ctx: Ctx, g: { id: string; descripcion: string; valor: Prisma.Decimal | number }) {
  const aprobadores = (await usuariosConPermiso(ctx.conjuntoId, ["presupuesto.aprobar_gastos"])).filter((u) => u !== ctx.userId);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: aprobadores,
    titulo: "Gasto pendiente de aprobación",
    cuerpo: `${g.descripcion} · $ ${Math.round(toNumber(g.valor)).toLocaleString("es-CO")}`,
    enlace: "/presupuesto/gastos?estado=PENDIENTE_APROBACION",
    tipo: "PRESUPUESTO",
  });
}

/** Rubro de gasto sugerido para mantenimiento: cuenta 5145 (mantenimiento y reparaciones) o nombre "mantenimiento". */
async function rubroMantenimiento(ctx: Ctx, fecha: Date) {
  const anio = nowBogota(fecha).year;
  const p = await presupuestoDelAnio(ctx, anio);
  const gastos = p?.rubros.filter((r) => r.tipo === "GASTO") ?? [];
  return (
    gastos.find((r) => r.cuentaContable?.startsWith("5145")) ??
    gastos.find((r) => /mantenimiento|reparaci/i.test(r.nombre)) ??
    null
  );
}

/**
 * Gasto a partir de una orden de trabajo cerrada con costo (idempotente: uno por orden).
 * Queda PENDIENTE_APROBACION para que el consejo o la administración lo apruebe.
 */
export async function gastoDesdeOrden(ctx: Ctx, orden: { id: string; numero: number; titulo: string; proveedorId: string | null; costo: number; fechaCierre: Date | null }) {
  const existente = await ctx.db.gasto.findFirst({ where: { ordenTrabajoId: orden.id } });
  if (existente) {
    if (existente.estado === "PENDIENTE_APROBACION" && toNumber(existente.valor) !== orden.costo) {
      return ctx.db.gasto.update({ where: { id: existente.id }, data: { valor: orden.costo } });
    }
    return existente;
  }
  const fecha = orden.fechaCierre ?? new Date();
  const rubro = await rubroMantenimiento(ctx, fecha);
  const g = await ctx.db.gasto.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      fecha,
      descripcion: `OT #${orden.numero}: ${orden.titulo}`.slice(0, 200),
      valor: orden.costo,
      rubroId: rubro?.id ?? null,
      cuentaContable: rubro?.cuentaContable ?? null,
      proveedorId: orden.proveedorId,
      ordenTrabajoId: orden.id,
      estado: "PENDIENTE_APROBACION",
    },
  });
  await audit(ctx, "crear_desde_orden", "Gasto", g.id, undefined, { ordenId: orden.id, valor: orden.costo });
  await avisarGastoPendiente(ctx, g);
  return g;
}

/** Aprobación / rechazo / pago de gastos (con auditoría). */
export async function cambiarEstadoGasto(ctx: Ctx, input: { id: string; estado: "APROBADO" | "RECHAZADO" | "PAGADO"; comprobanteUrl?: string | null; motivo?: string | null; rubroId?: string | null }) {
  const antes = await ctx.db.gasto.findUnique({ where: { id: input.id } });
  if (!antes) notFound("El gasto");
  const valido: Record<string, string[]> = {
    APROBADO: ["PENDIENTE_APROBACION", "RECHAZADO"],
    RECHAZADO: ["PENDIENTE_APROBACION", "APROBADO"],
    PAGADO: ["APROBADO"],
  };
  if (!valido[input.estado].includes(antes.estado)) {
    throw new AppError(input.estado === "PAGADO" ? "Solo se pueden pagar gastos aprobados." : `No se puede pasar de ${antes.estado.toLowerCase().replace(/_/g, " ")} a ${input.estado.toLowerCase()}.`);
  }
  if (input.rubroId) {
    const r = await ctx.db.rubroPresupuesto.findUnique({ where: { id: input.rubroId } });
    if (!r || r.tipo !== "GASTO") throw new AppError("Selecciona un rubro de gastos.");
  }
  const g = await ctx.db.gasto.update({
    where: { id: input.id },
    data: {
      estado: input.estado,
      ...(input.estado !== "PAGADO" ? { aprobadoPorId: ctx.userId } : {}),
      ...(input.comprobanteUrl ? { comprobanteUrl: input.comprobanteUrl } : {}),
      ...(input.rubroId ? { rubroId: input.rubroId } : {}),
    },
  });
  await audit(ctx, input.estado === "APROBADO" ? "aprobar" : input.estado === "RECHAZADO" ? "rechazar" : "pagar", "Gasto", g.id, { estado: antes.estado }, { estado: g.estado, motivo: input.motivo ?? null, valor: toNumber(g.valor) });
  await emit({ tipo: `gasto.${input.estado.toLowerCase()}`, conjuntoId: ctx.conjuntoId, actorId: ctx.userId, data: { id: g.id, valor: toNumber(g.valor), ordenTrabajoId: g.ordenTrabajoId } });
  return g;
}

export async function eliminarGasto(ctx: Ctx, id: string) {
  const g = await ctx.db.gasto.findUnique({ where: { id } });
  if (!g) notFound("El gasto");
  if (g.estado === "PAGADO" || g.estado === "APROBADO") throw new AppError("Solo se eliminan gastos pendientes o rechazados.");
  await ctx.db.gasto.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Gasto", id, g);
  return true;
}

export async function rubroOptions(ctx: Ctx, anio: number, tipo: TipoRubro = "GASTO") {
  const p = await presupuestoDelAnio(ctx, anio);
  return (p?.rubros ?? []).filter((r) => r.tipo === tipo).map((r) => ({ value: r.id, label: `${r.cuentaContable ? r.cuentaContable + " · " : ""}${r.nombre}` }));
}

// ───────────────────────────── Exportación contable ─────────────────────────────

/** Gastos del periodo listos para la exportación contable. */
export async function gastosParaContabilidad(ctx: Ctx, f: FiltrosGastos) {
  const where = whereGastos({ ...f, estado: undefined });
  const estados: EstadoGasto[] = f.estado === "PAGADO" ? ["PAGADO"] : f.estado === "APROBADO" ? ["APROBADO"] : ["APROBADO", "PAGADO"];
  const gastos = await ctx.db.gasto.findMany({ where: { ...where, estado: { in: estados } }, include: { rubro: { select: { nombre: true, cuentaContable: true } } }, orderBy: { fecha: "asc" } });
  const provIds = [...new Set(gastos.map((g) => g.proveedorId).filter(Boolean) as string[])];
  // `deletedAt: undefined` desactiva el filtro de borrado lógico: un proveedor retirado conserva su NIT contable.
  const provs = provIds.length ? await ctx.db.proveedor.findMany({ where: { id: { in: provIds }, deletedAt: undefined }, select: { id: true, nit: true, razonSocial: true } }) : [];
  const pm = new Map(provs.map((p) => [p.id, p]));
  return gastos.map<GastoContable>((g) => ({
    id: g.id,
    fecha: g.fecha,
    descripcion: g.descripcion,
    valor: toNumber(g.valor),
    estado: g.estado,
    cuentaContable: g.cuentaContable,
    rubroCuenta: g.rubro?.cuentaContable ?? null,
    rubroNombre: g.rubro?.nombre ?? null,
    proveedorNit: g.proveedorId ? (pm.get(g.proveedorId)?.nit ?? null) : null,
    proveedorNombre: g.proveedorId ? (pm.get(g.proveedorId)?.razonSocial ?? null) : null,
  }));
}

export async function lineasContables(ctx: Ctx, f: FiltrosGastos, opciones: Partial<OpcionesContables> = {}) {
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId }, select: { nit: true, nombre: true } });
  const gastos = await gastosParaContabilidad(ctx, f);
  const opts: OpcionesContables = {
    ...OPCIONES_DEFECTO,
    nitConjunto: conjunto.nit ?? "",
    nombreConjunto: conjunto.nombre,
    ...Object.fromEntries(Object.entries(opciones).filter(([, v]) => v !== undefined && v !== null && v !== "")),
  };
  return { lineas: asientosDeGastos(gastos, opts), gastos: gastos.length };
}
