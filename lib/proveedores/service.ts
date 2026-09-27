import type { EstadoContrato, Prisma, TipoDocProveedor } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { insensitive } from "@/lib/pagination";
import { startOfDayBogota, toNumber } from "@/lib/format";
import { cumplimiento, semaforoVencimiento } from "@/lib/mantenimiento/calculos";
import { estadoContrato, renovarContrato } from "./calculos";

export const CATEGORIAS_PROVEEDOR = [
  "Ascensores",
  "Aseo",
  "Vigilancia",
  "Plomería",
  "Electricidad",
  "Jardinería",
  "Piscinas",
  "Plantas eléctricas",
  "Extintores y seguridad",
  "CCTV y control de acceso",
  "Fumigación",
  "Pintura y obra civil",
  "Cerrajería",
  "Otro",
] as const;

export const TIPOS_DOC_PROVEEDOR = ["RUT", "CAMARA_COMERCIO", "POLIZA", "SEGURIDAD_SOCIAL", "CERTIFICACION", "OTRO"] as const;

export type FiltrosProveedores = { q?: string; categoria?: string; directorio?: string; estado?: string };

export function whereProveedores(f: FiltrosProveedores): Prisma.ProveedorWhereInput {
  return {
    ...(f.q ? { OR: [{ razonSocial: insensitive(f.q) }, { nit: insensitive(f.q) }, { contactoNombre: insensitive(f.q) }] } : {}),
    ...(f.categoria ? { categoria: f.categoria } : {}),
    ...(f.directorio === "si" ? { directorioComunitario: true } : f.directorio === "no" ? { directorioComunitario: false } : {}),
    ...(f.estado === "inactivos" ? { activo: false } : f.estado === "todos" ? {} : { activo: true }),
  };
}

export async function listarProveedores(ctx: Ctx, f: FiltrosProveedores, page?: { skip: number; take: number }) {
  const where = whereProveedores(f);
  const hoy = startOfDayBogota();
  const [items, total] = await Promise.all([
    ctx.db.proveedor.findMany({
      where,
      include: {
        documentos: { where: { deletedAt: null }, select: { tipo: true, vence: true } },
        contratos: { where: { deletedAt: null, estado: { not: "TERMINADO" } }, select: { fin: true, diasAlerta: true, estado: true } },
        _count: { select: { calificaciones: { where: { deletedAt: null } } } },
      },
      orderBy: { razonSocial: "asc" },
      ...(page ?? {}),
    }),
    ctx.db.proveedor.count({ where }),
  ]);
  return {
    items: items.map((p) => {
      const docsVencidos = p.documentos.filter((d) => semaforoVencimiento(d.vence, hoy, 30) === "VENCIDO").length;
      const docsPorVencer = p.documentos.filter((d) => semaforoVencimiento(d.vence, hoy, 30) === "POR_VENCER").length;
      const contratoAlerta = p.contratos.some((c) => estadoContrato(c, hoy) !== "VIGENTE");
      return { ...p, docsVencidos, docsPorVencer, contratoAlerta };
    }),
    total,
  };
}

export async function fichaProveedor(ctx: Ctx, id: string) {
  const p = await ctx.db.proveedor.findUnique({
    where: { id },
    include: {
      documentos: { where: { deletedAt: null }, orderBy: [{ tipo: "asc" }, { vence: "asc" }] },
      contratos: { where: { deletedAt: null }, orderBy: { fin: "desc" } },
      calificaciones: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 30 },
      activos: { where: { deletedAt: null }, select: { id: true, nombre: true, categoria: true, estado: true } },
    },
  });
  if (!p) notFound("El proveedor");
  const [ordenes, gastos] = await Promise.all([
    ctx.db.ordenTrabajo.findMany({ where: { proveedorId: id }, orderBy: { fechaProgramada: "desc" }, take: 40, include: { activo: { select: { nombre: true } } } }),
    ctx.db.gasto.aggregate({ where: { proveedorId: id, estado: { in: ["APROBADO", "PAGADO"] } }, _sum: { valor: true }, _count: true }),
  ]);
  const usuario = p.usuarioId ? await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId: p.usuarioId }, select: { usuario: { select: { email: true, nombre: true } } } }) : null;
  return {
    ...p,
    ordenes,
    desempeno: cumplimiento(ordenes),
    totalGastado: toNumber(gastos._sum.valor),
    numGastos: gastos._count,
    usuarioAcceso: usuario?.usuario ?? null,
  };
}

export type ProveedorInput = {
  id?: string | null;
  nit: string;
  razonSocial: string;
  categoria: string;
  contactoNombre?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  tarifas?: string | null;
  directorioComunitario: boolean;
  beneficioComunidad?: string | null;
  activo: boolean;
  /** Usuario con rol PROVEEDOR que verá y ejecutará las órdenes asignadas a este proveedor. */
  usuarioId?: string | null;
};

export async function guardarProveedor(ctx: Ctx, input: ProveedorInput) {
  const { id, ...data } = input;
  if (data.usuarioId) {
    const m = await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId: data.usuarioId, estado: "ACTIVA" }, include: { rol: true } });
    if (!m || (m.rol.basadoEnClave ?? m.rol.clave) !== "PROVEEDOR") throw new AppError("El usuario debe tener el rol Proveedor en el conjunto.", 400, { usuarioId: "Usuario no válido" });
  }
  const dup = await ctx.db.proveedor.findFirst({ where: { nit: data.nit, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw new AppError(`Ya existe un proveedor con NIT ${data.nit} (${dup.razonSocial}).`, 400, { nit: "NIT duplicado" });
  if (id) {
    const antes = await ctx.db.proveedor.findUnique({ where: { id } });
    if (!antes) notFound("El proveedor");
    const p = await ctx.db.proveedor.update({ where: { id }, data });
    await audit(ctx, "editar", "Proveedor", id, antes, p);
    return p;
  }
  const p = await ctx.db.proveedor.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "Proveedor", p.id, undefined, p);
  return p;
}

export async function eliminarProveedor(ctx: Ctx, id: string) {
  const abiertas = await ctx.db.ordenTrabajo.count({ where: { proveedorId: id, estado: { in: ["PENDIENTE", "PROGRAMADA", "EN_PROCESO"] } } });
  if (abiertas) throw new AppError(`El proveedor tiene ${abiertas} órdenes abiertas.`);
  await ctx.db.proveedor.update({ where: { id }, data: { deletedAt: new Date(), activo: false, directorioComunitario: false } });
  await audit(ctx, "eliminar", "Proveedor", id);
  return true;
}

// ── Documentos ──

export async function guardarDocumento(ctx: Ctx, input: { id?: string | null; proveedorId: string; tipo: TipoDocProveedor; archivoUrl?: string | null; vence?: Date | null }) {
  if (!(await ctx.db.proveedor.findUnique({ where: { id: input.proveedorId } }))) notFound("El proveedor");
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.documentoProveedor.findUnique({ where: { id } });
    if (!antes) notFound("El documento");
    const d = await ctx.db.documentoProveedor.update({ where: { id }, data });
    await audit(ctx, "editar", "DocumentoProveedor", id, antes, d);
    return d;
  }
  const d = await ctx.db.documentoProveedor.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "DocumentoProveedor", d.id, undefined, d);
  return d;
}

export async function eliminarDocumento(ctx: Ctx, id: string) {
  await ctx.db.documentoProveedor.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "DocumentoProveedor", id);
  return true;
}

/** Documentos vencidos o por vencer de todos los proveedores activos. */
export async function documentosPorVencer(ctx: Ctx, ventanaDias = 60) {
  const hoy = startOfDayBogota();
  const limite = new Date(hoy.getTime() + ventanaDias * 86_400_000);
  const docs = await ctx.db.documentoProveedor.findMany({
    where: { vence: { not: null, lte: limite }, proveedor: { activo: true, deletedAt: null } },
    include: { proveedor: { select: { id: true, razonSocial: true, categoria: true } } },
    orderBy: { vence: "asc" },
  });
  return docs.map((d) => ({ ...d, semaforo: semaforoVencimiento(d.vence, hoy, 30) }));
}

// ── Contratos ──

export type ContratoInput = {
  id?: string | null;
  proveedorId: string;
  objeto: string;
  valor: number;
  inicio: Date;
  fin: Date;
  renovacionAutomatica: boolean;
  diasAlerta: number;
  documentoUrl?: string | null;
};

export async function listarContratos(ctx: Ctx, f: { q?: string; estado?: string; proveedorId?: string }) {
  const where: Prisma.ContratoWhereInput = {
    ...(f.q ? { OR: [{ objeto: insensitive(f.q) }, { proveedor: { razonSocial: insensitive(f.q) } }] } : {}),
    ...(f.estado ? { estado: f.estado as EstadoContrato } : {}),
    ...(f.proveedorId ? { proveedorId: f.proveedorId } : {}),
  };
  const rows = await ctx.db.contrato.findMany({ where, include: { proveedor: { select: { id: true, razonSocial: true, nit: true } } }, orderBy: [{ fin: "asc" }] });
  const hoy = startOfDayBogota();
  return rows.map((c) => ({ ...c, estadoCalculado: estadoContrato(c, hoy), diasRestantes: Math.round((c.fin.getTime() - hoy.getTime()) / 86_400_000) }));
}

export async function guardarContrato(ctx: Ctx, input: ContratoInput) {
  if (input.fin <= input.inicio) throw new AppError("La fecha de fin debe ser posterior al inicio.", 400, { fin: "Debe ser posterior al inicio" });
  if (!(await ctx.db.proveedor.findUnique({ where: { id: input.proveedorId } }))) notFound("El proveedor");
  const { id, ...data } = input;
  const hoy = startOfDayBogota();
  if (id) {
    const antes = await ctx.db.contrato.findUnique({ where: { id } });
    if (!antes) notFound("El contrato");
    const estado = estadoContrato({ ...data, estado: antes.estado }, hoy);
    const c = await ctx.db.contrato.update({ where: { id }, data: { ...data, estado } });
    await audit(ctx, "editar", "Contrato", id, antes, c);
    return c;
  }
  const c = await ctx.db.contrato.create({ data: { ...data, conjuntoId: ctx.conjuntoId, estado: estadoContrato(data, hoy) } });
  await audit(ctx, "crear", "Contrato", c.id, undefined, c);
  return c;
}

export async function terminarContrato(ctx: Ctx, id: string, motivo: string) {
  const antes = await ctx.db.contrato.findUnique({ where: { id } });
  if (!antes) notFound("El contrato");
  const c = await ctx.db.contrato.update({ where: { id }, data: { estado: "TERMINADO", renovacionAutomatica: false } });
  await audit(ctx, "terminar", "Contrato", id, { estado: antes.estado }, { estado: "TERMINADO", motivo });
  return c;
}

export async function eliminarContrato(ctx: Ctx, id: string) {
  await ctx.db.contrato.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "Contrato", id);
  return true;
}

/**
 * Recalcula el estado de los contratos (job diario) y renueva los vencidos con renovación automática.
 * Devuelve los contratos renovados y los que cambiaron de estado.
 */
export async function actualizarEstadosContratos(ctx: Ctx, hoy = new Date()) {
  const contratos = await ctx.db.contrato.findMany({ where: { estado: { not: "TERMINADO" } }, include: { proveedor: { select: { razonSocial: true } } } });
  const renovados: { id: string; objeto: string; proveedor: string; fin: Date }[] = [];
  const cambios: { id: string; de: string; a: string }[] = [];
  for (const c of contratos) {
    let { inicio, fin } = c;
    if (c.renovacionAutomatica && estadoContrato(c, hoy) === "VENCIDO") {
      const r = renovarContrato(c, hoy);
      inicio = r.inicio;
      fin = r.fin;
      renovados.push({ id: c.id, objeto: c.objeto, proveedor: c.proveedor.razonSocial, fin });
    }
    const estado = estadoContrato({ fin, diasAlerta: c.diasAlerta, estado: c.estado }, hoy);
    if (estado !== c.estado || fin.getTime() !== c.fin.getTime()) {
      await ctx.db.contrato.update({ where: { id: c.id }, data: { inicio, fin, estado } });
      if (estado !== c.estado) cambios.push({ id: c.id, de: c.estado, a: estado });
      await audit(ctx, fin.getTime() !== c.fin.getTime() ? "renovar" : "cambiar_estado", "Contrato", c.id, { estado: c.estado, inicio: c.inicio, fin: c.fin }, { estado, inicio, fin });
    }
  }
  return { renovados, cambios };
}

// ── Desempeño ──

/** Desempeño por proveedor: órdenes cerradas, % a tiempo, costo total y calificación de residentes. */
export async function desempenoProveedores(ctx: Ctx, desde?: Date, hasta?: Date) {
  const proveedores = await ctx.db.proveedor.findMany({ where: { activo: true }, select: { id: true, razonSocial: true, categoria: true, calificacionPromedio: true } });
  const ordenes = await ctx.db.ordenTrabajo.findMany({
    where: { proveedorId: { not: null }, ...(desde || hasta ? { fechaProgramada: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lt: hasta } : {}) } } : {}) },
    select: { proveedorId: true, estado: true, fechaProgramada: true, fechaCierre: true, costo: true },
  });
  return proveedores
    .map((p) => {
      const os = ordenes.filter((o) => o.proveedorId === p.id);
      const c = cumplimiento(os);
      const costo = os.filter((o) => o.estado === "COMPLETADA").reduce((a, o) => a + toNumber(o.costo), 0);
      return { id: p.id, razonSocial: p.razonSocial, categoria: p.categoria, calificacion: toNumber(p.calificacionPromedio), ordenes: c.total, completadas: c.completadas, pctATiempo: c.pctATiempo, costo };
    })
    .filter((p) => p.ordenes > 0 || p.calificacion > 0)
    .sort((a, b) => b.ordenes - a.ordenes);
}

export async function resumenProveedores(ctx: Ctx) {
  const hoy = startOfDayBogota();
  const [activos, directorio, contratos, docs] = await Promise.all([
    ctx.db.proveedor.count({ where: { activo: true } }),
    ctx.db.proveedor.count({ where: { activo: true, directorioComunitario: true } }),
    ctx.db.contrato.findMany({ where: { estado: { not: "TERMINADO" } }, select: { fin: true, diasAlerta: true, estado: true, valor: true } }),
    ctx.db.documentoProveedor.findMany({ where: { vence: { not: null }, proveedor: { activo: true, deletedAt: null } }, select: { vence: true } }),
  ]);
  const est = contratos.map((c) => estadoContrato(c, hoy));
  return {
    activos,
    directorio,
    contratosVigentes: est.filter((e) => e === "VIGENTE" || e === "POR_VENCER").length,
    contratosPorVencer: est.filter((e) => e === "POR_VENCER").length,
    contratosVencidos: est.filter((e) => e === "VENCIDO").length,
    valorContratos: contratos.filter((_, i) => est[i] !== "VENCIDO").reduce((a, c) => a + toNumber(c.valor), 0),
    docsVencidos: docs.filter((d) => semaforoVencimiento(d.vence, hoy) === "VENCIDO").length,
    docsPorVencer: docs.filter((d) => semaforoVencimiento(d.vence, hoy) === "POR_VENCER").length,
  };
}

/** Usuarios con rol Proveedor (para vincular el acceso externo a un proveedor). */
export async function usuariosProveedorOptions(ctx: Ctx) {
  const ms = await ctx.db.membresiaConjunto.findMany({
    where: { estado: "ACTIVA", rol: { OR: [{ clave: "PROVEEDOR" }, { basadoEnClave: "PROVEEDOR" }] } },
    select: { usuario: { select: { id: true, nombre: true, email: true } } },
  });
  return ms.map((m) => ({ value: m.usuario.id, label: `${m.usuario.nombre} (${m.usuario.email})` }));
}
