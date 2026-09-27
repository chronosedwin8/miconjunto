import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { toNumber } from "@/lib/format";

/** Suma de coeficientes con tolerancia (Ley 675: deben sumar 100 %). */
export function validarCoeficientes(coefs: (number | string | Prisma.Decimal)[]) {
  const suma = Math.round(coefs.reduce<number>((a, c) => a + toNumber(c), 0) * 1e6) / 1e6;
  return { suma, ok: Math.abs(suma - 100) < 0.0005, diferencia: Math.round((100 - suma) * 1e6) / 1e6 };
}

/** Cuota de administración por coeficiente: presupuesto mensual × coeficiente / 100, redondeada a la centena. */
export function cuotaPorCoeficiente(presupuestoMensual: number, coeficiente: number) {
  return Math.round((presupuestoMensual * coeficiente) / 100 / 100) * 100;
}

export async function resumenEstructura(ctx: Ctx) {
  const db = ctx.db;
  const [torres, unidades, parqueaderos, bodegas, zonas, coefs] = await Promise.all([
    db.torre.count(),
    db.unidad.groupBy({ by: ["tipo"], _count: true }),
    db.parqueadero.groupBy({ by: ["tipo"], _count: true }),
    db.bodega.count(),
    db.zonaComun.count(),
    db.unidad.findMany({ select: { coeficiente: true } }),
  ]);
  return {
    torres,
    unidades: unidades.reduce((a, u) => a + u._count, 0),
    unidadesPorTipo: unidades.map((u) => ({ tipo: u.tipo, total: u._count })),
    parqueaderos: parqueaderos.reduce((a, u) => a + u._count, 0),
    parqueaderosPorTipo: parqueaderos.map((p) => ({ tipo: p.tipo, total: p._count })),
    bodegas,
    zonas,
    coeficientes: validarCoeficientes(coefs.map((c) => c.coeficiente)),
  };
}

// ── Torres ──
export async function guardarTorre(ctx: Ctx, input: { id?: string | null; nombre: string; pisos: number; unidadesPorPiso?: number | null; ascensores: boolean; notas?: string | null }) {
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.torre.findUnique({ where: { id } });
    if (!antes) notFound("La torre");
    const t = await ctx.db.torre.update({ where: { id }, data });
    await audit(ctx, "editar", "Torre", id, antes, t);
    return t;
  }
  const t = await ctx.db.torre.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Torre", t.id, undefined, t);
  return t;
}

export async function eliminarTorre(ctx: Ctx, id: string) {
  const unidades = await ctx.db.unidad.count({ where: { torreId: id } });
  if (unidades > 0) throw new AppError(`La torre tiene ${unidades} unidades. Muévelas o elimínalas primero.`);
  await ctx.db.torre.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Torre", id);
}

/** Genera unidades de una torre en bloque (pisos × unidades por piso). */
export async function generarUnidadesTorre(ctx: Ctx, torreId: string, opts: { desdePiso: number; hastaPiso: number; porPiso: number; area: number; prefijo?: string }) {
  const torre = await ctx.db.torre.findUnique({ where: { id: torreId } });
  if (!torre) notFound("La torre");
  const prefijo = opts.prefijo ?? torre.nombre.replace(/[^0-9A-Za-z]/g, "").replace(/^Torre/i, "T");
  let creadas = 0;
  for (let piso = opts.desdePiso; piso <= opts.hastaPiso; piso++) {
    for (let n = 1; n <= opts.porPiso; n++) {
      const codigo = `${prefijo}-${piso}${String(n).padStart(2, "0")}`;
      const existe = await ctx.db.unidad.findFirst({ where: { codigo } });
      if (existe) continue;
      await ctx.db.unidad.create({ data: { conjuntoId: ctx.conjuntoId, torreId, codigo, piso, tipo: "APARTAMENTO", areaPrivada: opts.area, coeficiente: 0 } });
      creadas++;
    }
  }
  await audit(ctx, "generar_unidades", "Torre", torreId, undefined, { creadas, ...opts });
  return creadas;
}

// ── Unidades ──
export type UnidadInput = {
  id?: string | null;
  torreId?: string | null;
  codigo: string;
  tipo: Prisma.UnidadCreateInput["tipo"];
  piso?: number | null;
  areaPrivada?: number | null;
  areaConstruida?: number | null;
  coeficiente?: number | null;
  matriculaInmobiliaria?: string | null;
  numeroCatastral?: string | null;
  estrato?: number | null;
  habitaciones?: number | null;
  banos?: number | null;
  balconTerraza?: boolean;
  estadoOcupacion?: Prisma.UnidadCreateInput["estadoOcupacion"];
  plataformaRentaCorta?: string | null;
  registroRnt?: string | null;
  cuotaAdministracion?: number | null;
  notasEstructura?: string | null;
  medidores?: Record<string, string>;
  tienePersonaMovilidadReducida?: boolean;
  requiereAsistenciaEvacuacion?: boolean;
  motivoCambioCoeficiente?: string | null;
};

export async function guardarUnidad(ctx: Ctx, input: UnidadInput, puedeCoeficientes: boolean) {
  const { id, motivoCambioCoeficiente, ...raw } = input;
  const data: Record<string, unknown> = { ...raw };
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  if (!puedeCoeficientes) {
    delete data.coeficiente;
    delete data.cuotaAdministracion;
  }
  if (data.estadoOcupacion !== "AIRBNB_O_SIMILAR") {
    data.plataformaRentaCorta = data.plataformaRentaCorta ?? null;
  }
  if (id) {
    const antes = await ctx.db.unidad.findUnique({ where: { id } });
    if (!antes) notFound("La unidad");
    const u = await ctx.db.unidad.update({ where: { id }, data: data as Prisma.UnidadUncheckedUpdateInput });
    if (data.coeficiente !== undefined && data.coeficiente !== null && toNumber(antes.coeficiente) !== toNumber(data.coeficiente as number)) {
      await ctx.db.historialCoeficiente.create({
        data: { conjuntoId: ctx.conjuntoId, unidadId: id, anterior: antes.coeficiente, nuevo: data.coeficiente as number, motivo: motivoCambioCoeficiente ?? null, usuarioId: ctx.userId },
      });
    }
    await audit(ctx, "editar", "Unidad", id, antes, u);
    return u;
  }
  const cfg = conjuntoConfig(ctx);
  const coef = (data.coeficiente as number | undefined) ?? 0;
  const u = await ctx.db.unidad.create({
    data: {
      ...(data as Prisma.UnidadUncheckedCreateInput),
      conjuntoId: ctx.conjuntoId,
      coeficiente: coef,
      cuotaAdministracion: (data.cuotaAdministracion as number | undefined) ?? (cfg.cartera.calculoCuota === "COEFICIENTE" ? cuotaPorCoeficiente(cfg.cartera.presupuestoMensual, coef) : 0),
    },
  });
  await audit(ctx, "crear", "Unidad", u.id, undefined, u);
  return u;
}

export async function eliminarUnidad(ctx: Ctx, id: string) {
  const [cuotas, vinculos] = await Promise.all([
    ctx.db.cuota.count({ where: { unidadId: id, estado: { in: ["PENDIENTE", "PARCIAL"] } } }),
    ctx.db.vinculoUnidad.count({ where: { unidadId: id, estado: "ACTIVO" } }),
  ]);
  if (cuotas > 0) throw new AppError("La unidad tiene saldo pendiente; no se puede eliminar.");
  if (vinculos > 0) throw new AppError("La unidad tiene personas vinculadas activas; retíralas primero.");
  await ctx.db.unidad.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Unidad", id);
}

/** Recalcula la cuota de administración de todas las unidades según coeficiente y presupuesto. */
export async function recalcularCuotas(ctx: Ctx, presupuestoMensual: number) {
  const unidades = await ctx.db.unidad.findMany({ select: { id: true, coeficiente: true, cuotaAdministracion: true } });
  let n = 0;
  for (const u of unidades) {
    const nueva = cuotaPorCoeficiente(presupuestoMensual, toNumber(u.coeficiente));
    if (nueva !== toNumber(u.cuotaAdministracion)) {
      await ctx.db.unidad.update({ where: { id: u.id }, data: { cuotaAdministracion: nueva } });
      n++;
    }
  }
  await audit(ctx, "recalcular_cuotas", "Conjunto", ctx.conjuntoId, undefined, { presupuestoMensual, actualizadas: n });
  return n;
}

// ── Plano lógico ──
export type EstadoPlano = "AL_DIA" | "MORA" | "ARRENDADA" | "AIRBNB" | "DESOCUPADA" | "MOVILIDAD";

export async function planoLogico(ctx: Ctx, verFinanciero: boolean) {
  const [torres, unidades, saldos, movilidad] = await Promise.all([
    ctx.db.torre.findMany({ orderBy: { nombre: "asc" } }),
    ctx.db.unidad.findMany({ orderBy: [{ piso: "desc" }, { codigo: "asc" }], select: { id: true, codigo: true, torreId: true, piso: true, tipo: true, estadoOcupacion: true, tienePersonaMovilidadReducida: true } }),
    verFinanciero
      ? ctx.db.cuota.groupBy({ by: ["unidadId"], where: { estado: { in: ["PENDIENTE", "PARCIAL"] }, fechaVencimiento: { lt: new Date() } }, _sum: { saldo: true } })
      : Promise.resolve([]),
    ctx.db.vinculoUnidad.findMany({ where: { estado: "ACTIVO", persona: { movilidadReducida: true, deletedAt: null } }, select: { unidadId: true } }),
  ]);
  const mora = new Map(saldos.map((s) => [s.unidadId, toNumber(s._sum.saldo)]));
  const mov = new Set(movilidad.map((m) => m.unidadId));
  const estado = (u: (typeof unidades)[number]): EstadoPlano[] => {
    const e: EstadoPlano[] = [];
    if (verFinanciero) e.push((mora.get(u.id) ?? 0) > 1000 ? "MORA" : "AL_DIA");
    if (u.estadoOcupacion === "ARRENDADA") e.push("ARRENDADA");
    if (u.estadoOcupacion === "AIRBNB_O_SIMILAR") e.push("AIRBNB");
    if (u.estadoOcupacion === "DESOCUPADA") e.push("DESOCUPADA");
    if (u.tienePersonaMovilidadReducida || mov.has(u.id)) e.push("MOVILIDAD");
    return e;
  };
  const bloques = torres.map((t) => {
    const us = unidades.filter((u) => u.torreId === t.id);
    const pisos = [...new Set(us.map((u) => u.piso ?? 0))].sort((a, b) => b - a);
    return { id: t.id, nombre: t.nombre, pisos: pisos.map((p) => ({ piso: p, unidades: us.filter((u) => (u.piso ?? 0) === p).map((u) => ({ id: u.id, codigo: u.codigo, estados: estado(u), mora: mora.get(u.id) ?? 0 })) })) };
  });
  const sueltas = unidades.filter((u) => !u.torreId).sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
  if (sueltas.length) bloques.push({ id: "casas", nombre: "Casas y otras unidades", pisos: [{ piso: 0, unidades: sueltas.map((u) => ({ id: u.id, codigo: u.codigo, estados: estado(u), mora: mora.get(u.id) ?? 0 })) }] });
  return bloques;
}

// ── Parqueaderos y bodegas ──
export async function guardarParqueadero(ctx: Ctx, input: { id?: string | null; codigo: string; tipo: Prisma.ParqueaderoCreateInput["tipo"]; ubicacion?: string | null; unidadId?: string | null; estado: Prisma.ParqueaderoCreateInput["estado"]; tarifaHora?: number | null; tarifaDia?: number | null; notas?: string | null }) {
  const { id, ...data } = input;
  if (data.unidadId && data.estado === "DISPONIBLE") data.estado = "ASIGNADO";
  if (id) {
    const antes = await ctx.db.parqueadero.findUnique({ where: { id } });
    if (!antes) notFound("El parqueadero");
    const p = await ctx.db.parqueadero.update({ where: { id }, data });
    await audit(ctx, "editar", "Parqueadero", id, antes, p);
    return p;
  }
  const p = await ctx.db.parqueadero.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Parqueadero", p.id, undefined, p);
  return p;
}

export async function guardarBodega(ctx: Ctx, input: { id?: string | null; codigo: string; ubicacion?: string | null; area?: number | null; unidadId?: string | null; estado: Prisma.BodegaCreateInput["estado"]; notas?: string | null }) {
  const { id, ...data } = input;
  if (data.unidadId && data.estado === "DISPONIBLE") data.estado = "ASIGNADO";
  if (id) {
    const antes = await ctx.db.bodega.findUnique({ where: { id } });
    if (!antes) notFound("La bodega");
    const b = await ctx.db.bodega.update({ where: { id }, data });
    await audit(ctx, "editar", "Bodega", id, antes, b);
    return b;
  }
  const b = await ctx.db.bodega.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Bodega", b.id, undefined, b);
  return b;
}

// ── Zonas comunes ──
export type HorarioZona = Record<string, { abre: string; cierra: string } | null>;

export type ZonaInput = {
  id?: string | null;
  nombre: string;
  tipo?: string | null;
  categoria: Prisma.ZonaComunCreateInput["categoria"];
  descripcion?: string | null;
  fotos?: string[];
  capacidad?: number | null;
  horario: HorarioZona;
  reservable: boolean;
  requiereAprobacion: boolean;
  tarifa: number;
  deposito: number;
  duracionMinimaMin: number;
  duracionMaximaMin: number;
  anticipacionMinimaHoras: number;
  anticipacionMaximaDias: number;
  maxReservasMesUnidad: number;
  reglasUso?: string | null;
  bloqueoPorMora: boolean;
  gravaIva: boolean;
  tarifaIva: number;
  generaFactura: boolean;
  politicaCancelacion?: string | null;
  horasCancelacionReembolso: number;
  estado: Prisma.ZonaComunCreateInput["estado"];
};

export async function guardarZona(ctx: Ctx, input: ZonaInput) {
  const { id, ...data } = input;
  if (data.tarifa <= 0) {
    // Incluida en la cuota de administración: no hay IVA ni factura (DIAN).
    data.gravaIva = false;
    data.generaFactura = false;
  }
  if (data.duracionMaximaMin < data.duracionMinimaMin) throw new AppError("La duración máxima no puede ser menor que la mínima.", 400, { duracionMaximaMin: "Debe ser mayor o igual a la mínima" });
  if (id) {
    const antes = await ctx.db.zonaComun.findUnique({ where: { id } });
    if (!antes) notFound("La zona");
    const z = await ctx.db.zonaComun.update({ where: { id }, data: data as Prisma.ZonaComunUncheckedUpdateInput });
    await audit(ctx, "editar", "ZonaComun", id, antes, z);
    return z;
  }
  const z = await ctx.db.zonaComun.create({ data: { ...(data as Prisma.ZonaComunUncheckedCreateInput), conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "ZonaComun", z.id, undefined, z);
  return z;
}

export async function eliminarRegistro(ctx: Ctx, modelo: "parqueadero" | "bodega" | "zonaComun", id: string) {
  const delegate = ctx.db[modelo] as unknown as { update: (a: { where: { id: string }; data: { deletedAt: Date } }) => Promise<unknown> };
  await delegate.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", modelo, id);
}

/** Ficha completa de la unidad (lo que ve el admin y, filtrado, el residente). */
export async function fichaUnidad(ctx: Ctx, id: string) {
  const u = await ctx.db.unidad.findUnique({
    where: { id },
    include: {
      torre: true,
      parqueaderos: { where: { deletedAt: null } },
      bodegas: { where: { deletedAt: null } },
      vinculos: { where: { deletedAt: null }, include: { persona: true }, orderBy: [{ principal: "desc" }, { tipo: "asc" }] },
      vehiculos: { where: { deletedAt: null } },
      mascotas: { where: { deletedAt: null } },
      historialCoef: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!u) notFound("La unidad");
  return u;
}
