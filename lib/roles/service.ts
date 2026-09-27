import type { Ctx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { ALL_PERMS, ROLES_BASE, invalidateRolePerms } from "@/lib/permisos";
import { slugify } from "@/lib/conjunto/provision";

/** Permisos que el rol ADMINISTRADOR base no puede perder (evita quedar sin acceso a la configuración). */
const PROTEGIDOS_ADMIN = ["configuracion.ver", "configuracion.roles"];

export async function listarRoles(ctx: Ctx) {
  const roles = await ctx.db.rol.findMany({
    orderBy: [{ base: "desc" }, { nombre: "asc" }],
    include: { _count: { select: { membresias: { where: { deletedAt: null, estado: "ACTIVA" } }, permisos: true } } },
  });
  const orden = new Map<string, number>(ROLES_BASE.map((r, i) => [r, i]));
  return roles.sort((a, b) => (orden.get(a.clave) ?? 99) - (orden.get(b.clave) ?? 99));
}

export async function crearRolPersonalizado(ctx: Ctx, input: { nombre: string; basadoEnClave: string; descripcion?: string | null }) {
  const base = await ctx.db.rol.findFirst({ where: { clave: input.basadoEnClave }, include: { permisos: true } });
  if (!base) throw new AppError("El rol base no existe.");
  const clave = `P_${slugify(input.nombre).toUpperCase().replace(/-/g, "_")}`.slice(0, 40);
  if (await ctx.db.rol.findFirst({ where: { clave } })) throw new AppError("Ya existe un rol con ese nombre.");
  const rol = await ctx.db.rol.create({
    data: { conjuntoId: ctx.conjuntoId, clave, nombre: input.nombre, descripcion: input.descripcion, base: false, basadoEnClave: base.basadoEnClave ?? base.clave },
  });
  await ctx.db.rolPermiso.createMany({ data: base.permisos.map((p) => ({ conjuntoId: ctx.conjuntoId, rolId: rol.id, permisoClave: p.permisoClave })) });
  await audit(ctx, "crear", "Rol", rol.id, undefined, { nombre: rol.nombre, copiaDe: base.clave });
  return rol;
}

/** Reemplaza el conjunto de permisos de un rol (sólo claves del catálogo). */
export async function guardarPermisosRol(ctx: Ctx, rolId: string, permisos: string[], alcance?: "ACCION" | "VISIBILIDAD") {
  const rol = await ctx.db.rol.findUnique({ where: { id: rolId }, include: { permisos: true } });
  if (!rol) notFound("El rol");
  const validos = new Set<string>(ALL_PERMS);
  let nuevos = new Set(permisos.filter((p) => validos.has(p)));
  const actuales = new Set(rol.permisos.map((p) => p.permisoClave));
  // Si se edita solo una sección (acciones o visibilidad), se conservan los permisos de la otra.
  const esVis = (p: string) => p.startsWith("campos.") || p.startsWith("secciones.");
  if (alcance === "ACCION") for (const p of actuales) if (esVis(p)) nuevos.add(p);
  if (alcance === "VISIBILIDAD") {
    nuevos = new Set([...nuevos].filter(esVis));
    for (const p of actuales) if (!esVis(p)) nuevos.add(p);
  }
  if (rol.clave === "ADMINISTRADOR") PROTEGIDOS_ADMIN.forEach((p) => nuevos.add(p));
  const quitar = [...actuales].filter((p) => !nuevos.has(p));
  const agregar = [...nuevos].filter((p) => !actuales.has(p));
  if (quitar.length) await ctx.db.rolPermiso.deleteMany({ where: { rolId, permisoClave: { in: quitar } } });
  if (agregar.length) await ctx.db.rolPermiso.createMany({ data: agregar.map((p) => ({ conjuntoId: ctx.conjuntoId, rolId, permisoClave: p })), skipDuplicates: true });
  await ctx.db.rol.update({ where: { id: rolId }, data: { version: { increment: 1 } } });
  invalidateRolePerms(rolId);
  await audit(ctx, "editar_permisos", "Rol", rolId, { quitados: quitar }, { agregados: agregar });
  return { agregados: agregar.length, quitados: quitar.length };
}

export async function eliminarRol(ctx: Ctx, rolId: string) {
  const rol = await ctx.db.rol.findUnique({ where: { id: rolId }, include: { _count: { select: { membresias: true } } } });
  if (!rol) notFound("El rol");
  if (rol.base) throw new AppError("Los roles base no se pueden eliminar.");
  if (rol._count.membresias > 0) throw new AppError("Hay usuarios con este rol. Asígnales otro rol primero.");
  await ctx.db.rolPermiso.deleteMany({ where: { rolId } });
  await ctx.db.rol.update({ where: { id: rolId }, data: { deletedAt: new Date(), clave: `${rol.clave}__eliminado_${Date.now()}` } });
  await audit(ctx, "eliminar", "Rol", rolId);
}

export async function cambiarRolMiembro(ctx: Ctx, membresiaId: string, rolId: string) {
  const [m, rol] = await Promise.all([ctx.db.membresiaConjunto.findUnique({ where: { id: membresiaId } }), ctx.db.rol.findUnique({ where: { id: rolId } })]);
  if (!m || !rol) notFound("El usuario o el rol");
  if (m.usuarioId === ctx.userId && rol.clave !== "ADMINISTRADOR" && !ctx.esSuperAdmin) throw new AppError("No puedes quitarte a ti mismo el rol de administrador.");
  await ctx.db.membresiaConjunto.update({ where: { id: membresiaId }, data: { rolId } });
  await audit(ctx, "cambiar_rol", "MembresiaConjunto", membresiaId, { rolId: m.rolId }, { rolId });
}

export async function cambiarEstadoMiembro(ctx: Ctx, membresiaId: string, estado: "ACTIVA" | "SUSPENDIDA") {
  const m = await ctx.db.membresiaConjunto.findUnique({ where: { id: membresiaId } });
  if (!m) notFound("El usuario");
  if (m.usuarioId === ctx.userId) throw new AppError("No puedes suspender tu propia cuenta.");
  await ctx.db.membresiaConjunto.update({ where: { id: membresiaId }, data: { estado } });
  await audit(ctx, estado === "ACTIVA" ? "reactivar_usuario" : "suspender_usuario", "MembresiaConjunto", membresiaId);
}
