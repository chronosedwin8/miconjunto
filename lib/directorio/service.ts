import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { insensitive } from "@/lib/pagination";
import { textoPlano } from "@/lib/muro/contenido";

/**
 * Directorios de la comunidad:
 * - Residentes OPT-IN: cada persona decide si aparece y qué campos comparte (nunca se muestran otros datos).
 * - Proveedores comunitarios (Proveedor.directorioComunitario) con calificaciones de los residentes.
 */
export const CAMPOS_DIRECTORIO = [
  { value: "nombre", label: "Nombre" },
  { value: "unidad", label: "Unidad" },
  { value: "telefono", label: "Teléfono" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "servicios", label: "Servicios que ofrezco" },
] as const;
export type CampoDirectorio = (typeof CAMPOS_DIRECTORIO)[number]["value"];

const RESIDENCIALES = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] as const;

export type FichaDirectorio = { personaId: string; nombre: string | null; unidades: string[]; telefono: string | null; whatsapp: string | null; servicios: string | null };

/** Solo expone los campos que la persona eligió compartir. */
export function fichaPublica(p: { id: string; nombres: string; apellidos: string; telefono: string | null; serviciosOfrecidos: string | null; directorioCampos: string[] }, unidades: string[]): FichaDirectorio {
  const c = new Set(p.directorioCampos);
  return {
    personaId: p.id,
    nombre: c.has("nombre") ? `${p.nombres} ${p.apellidos}`.trim() : null,
    unidades: c.has("unidad") ? unidades : [],
    telefono: c.has("telefono") ? p.telefono : null,
    whatsapp: c.has("whatsapp") ? p.telefono : null,
    servicios: c.has("servicios") ? p.serviciosOfrecidos : null,
  };
}

export async function directorioResidentes(ctx: Ctx, f: { q?: string | null; soloServicios?: boolean } = {}) {
  const personas = await ctx.db.persona.findMany({
    where: {
      directorioOptIn: true,
      anonimizada: false,
      vinculos: { some: { estado: "ACTIVO", deletedAt: null, tipo: { in: [...RESIDENCIALES] } } },
      ...(f.soloServicios ? { serviciosOfrecidos: { not: null }, directorioCampos: { has: "servicios" } } : {}),
    },
    select: {
      id: true,
      nombres: true,
      apellidos: true,
      telefono: true,
      serviciosOfrecidos: true,
      directorioCampos: true,
      vinculos: { where: { estado: "ACTIVO", deletedAt: null, tipo: { in: [...RESIDENCIALES] } }, select: { unidad: { select: { codigo: true } } } },
    },
    orderBy: [{ nombres: "asc" }, { apellidos: "asc" }],
  });
  let fichas = personas
    .map((p) => fichaPublica(p, [...new Set(p.vinculos.map((v) => v.unidad.codigo))]))
    // Una ficha sin ningún dato visible no aporta.
    .filter((f2) => f2.nombre || f2.telefono || f2.whatsapp || f2.servicios);
  if (f.q) {
    const q = f.q.toLowerCase();
    fichas = fichas.filter((x) => [x.nombre, x.unidades.join(" "), x.servicios].some((v) => v?.toLowerCase().includes(q)));
  }
  return fichas;
}

/** Persona del usuario actual (la principal con cuenta vinculada). */
export async function miPersona(ctx: Ctx) {
  return ctx.db.persona.findFirst({ where: { usuarioId: ctx.userId }, orderBy: { createdAt: "asc" } });
}

export async function guardarMiFicha(ctx: Ctx, input: { optIn: boolean; campos: string[]; servicios?: string | null; telefono?: string | null }) {
  const p = await miPersona(ctx);
  if (!p) throw new AppError("Tu cuenta no está vinculada a una persona del conjunto. Pide a la administración que te vincule.");
  const permitidos = new Set(CAMPOS_DIRECTORIO.map((c) => c.value as string));
  const campos = [...new Set(input.campos.filter((c) => permitidos.has(c)))];
  if (input.optIn && !campos.length) throw new AppError("Elige al menos un dato para compartir.", 400, { campos: "Elige al menos uno" });
  const servicios = input.servicios ? textoPlano(input.servicios).slice(0, 300) : null;
  const telefono = input.telefono?.replace(/[^\d+ ]/g, "").trim() || null;
  if ((campos.includes("telefono") || campos.includes("whatsapp")) && !(telefono ?? p.telefono)) throw new AppError("Escribe el teléfono que quieres compartir.", 400, { telefono: "Obligatorio" });
  const data = { directorioOptIn: input.optIn, directorioCampos: campos, serviciosOfrecidos: servicios, ...(telefono ? { telefono } : {}) };
  await ctx.db.persona.update({ where: { id: p.id }, data });
  await audit(ctx, "directorio_optin", "Persona", p.id, { optIn: p.directorioOptIn, campos: p.directorioCampos }, { optIn: input.optIn, campos });
  return true;
}

// ── Proveedores ──

export async function proveedoresComunitarios(ctx: Ctx, f: { q?: string | null; categoria?: string | null } = {}) {
  const provs = await ctx.db.proveedor.findMany({
    where: {
      directorioComunitario: true,
      activo: true,
      ...(f.categoria ? { categoria: f.categoria } : {}),
      ...(f.q ? { OR: [{ razonSocial: insensitive(f.q) }, { categoria: insensitive(f.q) }, { tarifas: insensitive(f.q) }] } : {}),
    },
    select: { id: true, razonSocial: true, categoria: true, contactoNombre: true, telefono: true, email: true, tarifas: true, beneficioComunidad: true, calificacionPromedio: true, _count: { select: { calificaciones: { where: { deletedAt: null } } } } },
    orderBy: [{ calificacionPromedio: "desc" }, { razonSocial: "asc" }],
  });
  return provs.map((p) => ({ ...p, calificacionPromedio: Number(p.calificacionPromedio), totalCalificaciones: p._count.calificaciones }));
}

export async function categoriasProveedores(ctx: Ctx) {
  const rows = await ctx.db.proveedor.findMany({ where: { directorioComunitario: true, activo: true }, select: { categoria: true }, distinct: ["categoria"], orderBy: { categoria: "asc" } });
  return rows.map((r) => r.categoria);
}

export async function fichaProveedor(ctx: Ctx, id: string) {
  const p = await ctx.db.proveedor.findFirst({ where: { id, directorioComunitario: true, activo: true } });
  if (!p) notFound("El proveedor");
  const calificaciones = await ctx.db.calificacionProveedor.findMany({ where: { proveedorId: id }, orderBy: { createdAt: "desc" }, take: 100 });
  const mia = calificaciones.find((c) => c.usuarioId === ctx.userId) ?? null;
  const distribucion = [5, 4, 3, 2, 1].map((n) => ({ puntaje: n, total: calificaciones.filter((c) => c.puntaje === n).length }));
  return {
    proveedor: { ...p, calificacionPromedio: Number(p.calificacionPromedio) },
    calificaciones: calificaciones.map((c) => ({ ...c, usuarioNombre: primerNombre(c.usuarioNombre) })),
    mia,
    distribucion,
  };
}

/** Nombre corto para reseñas públicas ("Laura G."), para no exponer el nombre completo. */
export function primerNombre(n: string | null | undefined) {
  if (!n) return "Vecino";
  const [a, b] = n.trim().split(/\s+/);
  return b ? `${a} ${b[0]}.` : a;
}

/** Recalcula el promedio del proveedor a partir de las calificaciones vigentes. */
export async function recalcularPromedio(ctx: Pick<Ctx, "db">, proveedorId: string) {
  const agg = await ctx.db.calificacionProveedor.aggregate({ where: { proveedorId }, _avg: { puntaje: true } });
  const prom = Math.round((agg._avg.puntaje ?? 0) * 100) / 100;
  await ctx.db.proveedor.update({ where: { id: proveedorId }, data: { calificacionPromedio: prom } });
  return prom;
}

/** Una calificación por usuario (1–5 estrellas + comentario opcional); volver a calificar la actualiza. */
export async function calificarProveedor(ctx: Ctx, proveedorId: string, input: { puntaje: number; comentario?: string | null }) {
  const p = await ctx.db.proveedor.findFirst({ where: { id: proveedorId, directorioComunitario: true, activo: true } });
  if (!p) notFound("El proveedor");
  if (!Number.isInteger(input.puntaje) || input.puntaje < 1 || input.puntaje > 5) throw new AppError("La calificación debe estar entre 1 y 5 estrellas.", 400, { puntaje: "Entre 1 y 5" });
  const comentario = input.comentario ? textoPlano(input.comentario).slice(0, 500) || null : null;
  const existente = await ctx.db.calificacionProveedor.findFirst({ where: { proveedorId, usuarioId: ctx.userId, deletedAt: undefined } });
  if (existente) {
    await ctx.db.calificacionProveedor.update({ where: { id: existente.id }, data: { puntaje: input.puntaje, comentario, usuarioNombre: ctx.nombre, deletedAt: null } });
  } else {
    await ctx.db.calificacionProveedor.create({ data: { conjuntoId: ctx.conjuntoId, proveedorId, usuarioId: ctx.userId, usuarioNombre: ctx.nombre, puntaje: input.puntaje, comentario } });
  }
  const promedio = await recalcularPromedio(ctx, proveedorId);
  return { promedio };
}

export async function eliminarCalificacion(ctx: Ctx, proveedorId: string) {
  const c = await ctx.db.calificacionProveedor.findFirst({ where: { proveedorId, usuarioId: ctx.userId } });
  if (!c) notFound("Tu calificación");
  await ctx.db.calificacionProveedor.update({ where: { id: c.id }, data: { deletedAt: new Date() } });
  return { promedio: await recalcularPromedio(ctx, proveedorId) };
}
