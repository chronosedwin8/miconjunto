import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Ctx } from "@/lib/auth/context";
import { ALL_PERMS, ROLES_RESIDENCIALES, type PermKey } from "./catalog";

export * from "./catalog";

type Subject = Pick<Ctx, "esSuperAdmin" | "permisos" | "unidadIds" | "userId" | "rolBase">;

/** Recurso opcional para validación de pertenencia (p. ej. un ticket o una unidad). */
export type Recurso = { unidadId?: string | null; usuarioId?: string | null } | null | undefined;

/**
 * Autorización central. `perm` es `modulo.accion`.
 * Si se pasa un recurso y el usuario no tiene `modulo.ver_todos`, el recurso debe ser suyo.
 */
export function can(user: Subject | null | undefined, perm: PermKey | PermKey[], recurso?: Recurso): boolean {
  if (!user) return false;
  if (user.esSuperAdmin) return true;
  const perms = Array.isArray(perm) ? perm : [perm];
  const ok = perms.some((p) => user.permisos.has(p));
  if (!ok) return false;
  if (recurso) {
    const modulo = perms[0].split(".")[0];
    if (user.permisos.has(`${modulo}.ver_todos` as PermKey)) return true;
    return ownsResource(user, recurso);
  }
  return true;
}

export function ownsResource(user: Pick<Ctx, "unidadIds" | "userId">, recurso: NonNullable<Recurso>) {
  if (recurso.usuarioId && recurso.usuarioId === user.userId) return true;
  if (recurso.unidadId && user.unidadIds.includes(recurso.unidadId)) return true;
  return false;
}

/** Lanza error 403 si no tiene permiso. Usar en toda mutación. */
export function assertCan(user: Subject | null | undefined, perm: PermKey | PermKey[], recurso?: Recurso) {
  if (!can(user, perm, recurso)) {
    throw new AppError("No tienes permiso para realizar esta acción.", 403);
  }
}

/** ¿El usuario ve todo el módulo o solo lo propio? */
export function seesAll(user: Subject, modulo: string) {
  return user.esSuperAdmin || user.permisos.has(`${modulo}.ver_todos` as PermKey);
}

export function isResidencial(user: Pick<Ctx, "rolBase">) {
  return ROLES_RESIDENCIALES.has(user.rolBase);
}

// ── carga de permisos con caché en memoria (se invalida con Rol.version) ──
const permCache = new Map<string, { version: number; perms: Set<string>; at: number }>();

export async function loadRolePerms(rolId: string, version: number): Promise<Set<string>> {
  const hit = permCache.get(rolId);
  if (hit && hit.version === version && Date.now() - hit.at < 5 * 60_000) return hit.perms;
  const rows = await prisma.rolPermiso.findMany({ where: { rolId, deletedAt: null }, select: { permisoClave: true } });
  const perms = new Set(rows.map((r) => r.permisoClave));
  permCache.set(rolId, { version, perms, at: Date.now() });
  return perms;
}

export function invalidateRolePerms(rolId?: string) {
  if (rolId) permCache.delete(rolId);
  else permCache.clear();
}

export const SUPERADMIN_PERMS = new Set<string>(ALL_PERMS);
