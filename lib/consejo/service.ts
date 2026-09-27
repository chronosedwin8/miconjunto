import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permisos";
import { toNumber } from "@/lib/format";

/** Consejo de administración: miembros vigentes, reuniones con acta y panel de aprobaciones pendientes. */

export type CargoConsejo = "PRESIDENTE" | "SECRETARIO" | "VOCAL" | "SUPLENTE";
export const CARGOS: CargoConsejo[] = ["PRESIDENTE", "SECRETARIO", "VOCAL", "SUPLENTE"];
const ORDEN_CARGO: Record<string, number> = { PRESIDENTE: 0, SECRETARIO: 1, VOCAL: 2, SUPLENTE: 3 };

export async function listarMiembros(ctx: Ctx, opts?: { incluirInactivos?: boolean }) {
  const ahora = new Date();
  const miembros = await ctx.db.miembroConsejo.findMany({ where: opts?.incluirInactivos ? {} : { activo: true }, orderBy: { periodoInicio: "desc" } });
  return miembros
    .map((m) => ({ ...m, vigente: m.activo && m.periodoInicio <= ahora && m.periodoFin >= ahora }))
    .sort((a, b) => Number(b.vigente) - Number(a.vigente) || ORDEN_CARGO[a.cargo] - ORDEN_CARGO[b.cargo] || a.nombre.localeCompare(b.nombre, "es"));
}

export type MiembroInput = {
  id?: string | null;
  personaId?: string | null;
  nombre?: string | null;
  cargo: CargoConsejo;
  periodoInicio: Date;
  periodoFin: Date;
  activo: boolean;
};

export async function guardarMiembro(ctx: Ctx, input: MiembroInput) {
  if (input.periodoFin <= input.periodoInicio) throw new AppError("El fin del periodo debe ser posterior al inicio.", 400, { periodoFin: "Fecha no válida" });
  let nombre = input.nombre?.trim() || null;
  let usuarioId: string | null = null;
  let unidadCodigo: string | null = null;
  if (input.personaId) {
    const p = await ctx.db.persona.findUnique({ where: { id: input.personaId }, include: { vinculos: { where: { estado: "ACTIVO", deletedAt: null }, include: { unidad: { select: { codigo: true } } }, take: 1 } } });
    if (!p) notFound("La persona");
    nombre = `${p.nombres} ${p.apellidos}`;
    usuarioId = p.usuarioId;
    unidadCodigo = p.vinculos[0]?.unidad.codigo ?? null;
  }
  if (!nombre) throw new AppError("Elige la persona o escribe el nombre.", 400, { nombre: "Obligatorio" });
  if (input.cargo === "PRESIDENTE" && input.activo) {
    const otro = await ctx.db.miembroConsejo.findFirst({
      where: { cargo: "PRESIDENTE", activo: true, periodoFin: { gte: new Date() }, ...(input.id ? { id: { not: input.id } } : {}) },
    });
    if (otro) throw new AppError(`${otro.nombre} ya es presidente del consejo en el periodo vigente. Cámbialo de cargo o desactívalo primero.`);
  }
  const data = { nombre, cargo: input.cargo, periodoInicio: input.periodoInicio, periodoFin: input.periodoFin, activo: input.activo, ...(input.personaId ? { personaId: input.personaId, usuarioId, unidadCodigo } : {}) };
  if (input.id) {
    const antes = await ctx.db.miembroConsejo.findUnique({ where: { id: input.id } });
    if (!antes) notFound("El miembro");
    const m = await ctx.db.miembroConsejo.update({ where: { id: input.id }, data });
    await audit(ctx, "editar", "MiembroConsejo", m.id, antes, m);
    return m;
  }
  const m = await ctx.db.miembroConsejo.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "MiembroConsejo", m.id, undefined, m);
  return m;
}

export async function retirarMiembro(ctx: Ctx, id: string) {
  const m = await ctx.db.miembroConsejo.findUnique({ where: { id } });
  if (!m) notFound("El miembro");
  await ctx.db.miembroConsejo.update({ where: { id }, data: { activo: false } });
  await audit(ctx, "retirar", "MiembroConsejo", id, { activo: m.activo }, { activo: false });
  return true;
}

// ── Reuniones ──

export async function listarReuniones(ctx: Ctx) {
  return ctx.db.reunionConsejo.findMany({ orderBy: { fecha: "desc" }, take: 100 });
}

export async function obtenerReunion(ctx: Ctx, id: string) {
  const r = await ctx.db.reunionConsejo.findUnique({ where: { id } });
  if (!r) notFound("La reunión");
  return r;
}

export type ReunionInput = { id?: string | null; fecha: Date; tema: string; asistentes: string[]; actaTexto?: string | null; decisiones?: string | null };

export async function guardarReunion(ctx: Ctx, input: ReunionInput) {
  const data = { fecha: input.fecha, tema: input.tema, asistentes: [...new Set(input.asistentes.map((a) => a.trim()).filter(Boolean))], actaTexto: input.actaTexto ?? null, decisiones: input.decisiones ?? null };
  if (input.id) {
    const antes = await obtenerReunion(ctx, input.id);
    const r = await ctx.db.reunionConsejo.update({ where: { id: input.id }, data });
    await audit(ctx, "editar", "ReunionConsejo", r.id, antes, r);
    return r;
  }
  const r = await ctx.db.reunionConsejo.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "ReunionConsejo", r.id, undefined, r);
  return r;
}

export async function eliminarReunion(ctx: Ctx, id: string) {
  const r = await obtenerReunion(ctx, id);
  await ctx.db.reunionConsejo.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "ReunionConsejo", id, r);
  return true;
}

// ── Aprobaciones pendientes (solo lectura; las acciones viven en cada módulo) ──

export type Pendiente = { id: string; titulo: string; detalle: string; fecha: Date; valor?: number | null; estado: string; href: string };
export type Aprobaciones = { multas: Pendiente[]; reservas: Pendiente[]; gastos: Pendiente[]; total: number };

export async function aprobacionesPendientes(ctx: Ctx): Promise<Aprobaciones> {
  const verMultas = can(ctx, ["convivencia.ver_todos", "convivencia.decidir"]);
  const verReservas = can(ctx, ["reservas.ver_todos", "reservas.aprobar"]);
  const verGastos = can(ctx, ["presupuesto.ver", "presupuesto.aprobar_gastos"]);
  const [multas, reservas, gastos] = await Promise.all([
    verMultas
      ? ctx.db.multa.findMany({ where: { estado: { in: ["NOTIFICADA", "EN_DESCARGOS"] } }, include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "asc" }, take: 50 })
      : Promise.resolve([]),
    verReservas
      ? ctx.db.reserva.findMany({ where: { estado: "SOLICITADA" }, include: { unidad: { select: { codigo: true } }, zona: { select: { nombre: true } } }, orderBy: { createdAt: "asc" }, take: 50 })
      : Promise.resolve([]),
    verGastos ? ctx.db.gasto.findMany({ where: { estado: "PENDIENTE_APROBACION" }, orderBy: { fecha: "asc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const m: Pendiente[] = multas.map((x) => ({
    id: x.id,
    titulo: `Multa ${x.unidad.codigo}`,
    detalle: x.estado === "EN_DESCARGOS" ? `Descargos presentados${x.descargosEn ? "" : " (en plazo)"} · ${x.descripcion}` : `Notificada, plazo de descargos ${x.plazoDescargos ? "hasta " + x.plazoDescargos.toLocaleDateString("es-CO", { timeZone: "America/Bogota" }) : "abierto"} · ${x.descripcion}`,
    fecha: x.notificadaEn ?? x.fecha,
    valor: toNumber(x.valor),
    estado: x.estado,
    href: `/convivencia`,
  }));
  const r: Pendiente[] = reservas.map((x) => ({ id: x.id, titulo: `${x.zona.nombre} · ${x.unidad.codigo}`, detalle: "Reserva por aprobar", fecha: x.inicio, valor: null, estado: x.estado, href: `/reservas/admin` }));
  const g: Pendiente[] = gastos.map((x) => ({ id: x.id, titulo: x.descripcion, detalle: "Gasto por aprobar", fecha: x.fecha, valor: toNumber(x.valor), estado: x.estado, href: `/presupuesto` }));
  return { multas: m, reservas: r, gastos: g, total: m.length + r.length + g.length };
}
