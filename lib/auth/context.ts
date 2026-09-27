import { cache } from "react";
import { redirect } from "next/navigation";
import type { Conjunto } from "@prisma/client";
import { prisma, withTenant, type TenantClient } from "@/lib/db";
import { loadRolePerms, SUPERADMIN_PERMS } from "@/lib/permisos";
import { AppError } from "@/lib/errors";
import { auth } from "./index";

export type Ctx = {
  userId: string;
  nombre: string;
  email: string;
  fotoUrl: string | null;
  textoGrande: boolean;
  esSuperAdmin: boolean;
  impersonadoPor: string | null;
  conjuntoId: string;
  conjunto: Pick<Conjunto, "id" | "nombre" | "slug" | "colorPrimario" | "logoUrl" | "config" | "modulosActivos" | "ciudad" | "nit">;
  rolId: string | null;
  rolClave: string;
  /** Rol base que define el alcance (para roles personalizados, el rol del que se copió). */
  rolBase: string;
  rolNombre: string;
  permisos: Set<string>;
  /** Unidades a las que el usuario está vinculado (activo). */
  unidadIds: string[];
  /** Unidades de las que es propietario/copropietario. */
  unidadesPropias: string[];
  personaIds: string[];
  db: TenantClient;
};

export type SessionUser = {
  userId: string;
  nombre: string;
  email: string;
  esSuperAdmin: boolean;
  conjuntoId: string | null;
  impersonadoPor: string | null;
};

/** Sesión básica validada contra BD (versión de sesión para revocación). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.usuario.findUnique({ where: { id: session.user.id } });
  if (!user || user.deletedAt || user.estado === "BLOQUEADO" || user.estado === "INACTIVO") return null;
  if (user.sessionVersion !== session.sv) return null; // sesión revocada ("cerrar en todos los dispositivos")
  return {
    userId: user.id,
    nombre: user.nombre,
    email: user.email,
    esSuperAdmin: user.esSuperAdmin,
    conjuntoId: session.conjuntoId,
    impersonadoPor: session.impersonadoPor,
  };
});

export async function buildCtx(userId: string, conjuntoId: string, opts?: { impersonadoPor?: string | null }): Promise<Ctx | null> {
  const user = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!user) return null;
  const conjunto = await prisma.conjunto.findFirst({ where: { id: conjuntoId, deletedAt: null } });
  if (!conjunto) return null;
  const membresia = await prisma.membresiaConjunto.findFirst({
    where: { usuarioId: userId, conjuntoId, estado: "ACTIVA", deletedAt: null },
    include: { rol: true },
  });
  if (!membresia && !user.esSuperAdmin) return null;

  let permisos: Set<string>;
  let rolClave = "SUPERADMIN";
  let rolBase = "ADMINISTRADOR";
  let rolNombre = "SuperAdmin MiConjunto";
  if (membresia) {
    rolClave = membresia.rol.clave;
    rolBase = membresia.rol.basadoEnClave ?? membresia.rol.clave;
    rolNombre = membresia.rol.nombre;
    permisos = await loadRolePerms(membresia.rolId, membresia.rol.version);
    if (user.esSuperAdmin) permisos = SUPERADMIN_PERMS;
  } else {
    permisos = SUPERADMIN_PERMS;
  }

  const vinculos = await prisma.vinculoUnidad.findMany({
    where: {
      conjuntoId,
      estado: "ACTIVO",
      deletedAt: null,
      persona: { usuarioId: userId, deletedAt: null },
    },
    select: { unidadId: true, personaId: true, tipo: true },
  });

  return {
    userId: user.id,
    nombre: user.nombre,
    email: user.email,
    fotoUrl: user.fotoUrl,
    textoGrande: user.textoGrande,
    esSuperAdmin: user.esSuperAdmin,
    impersonadoPor: opts?.impersonadoPor ?? null,
    conjuntoId,
    conjunto: {
      id: conjunto.id,
      nombre: conjunto.nombre,
      slug: conjunto.slug,
      colorPrimario: conjunto.colorPrimario,
      logoUrl: conjunto.logoUrl,
      config: conjunto.config,
      modulosActivos: conjunto.modulosActivos,
      ciudad: conjunto.ciudad,
      nit: conjunto.nit,
    },
    rolId: membresia?.rolId ?? null,
    rolClave,
    rolBase,
    rolNombre,
    permisos,
    unidadIds: [...new Set(vinculos.map((v) => v.unidadId))],
    unidadesPropias: [
      ...new Set(vinculos.filter((v) => v.tipo === "PROPIETARIO" || v.tipo === "COPROPIETARIO").map((v) => v.unidadId)),
    ],
    personaIds: [...new Set(vinculos.map((v) => v.personaId))],
    db: withTenant(prisma, conjuntoId),
  };
}

/** Contexto del request: usuario + conjunto activo + permisos + cliente BD aislado. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const su = await getSessionUser();
  if (!su || !su.conjuntoId) return null;
  return buildCtx(su.userId, su.conjuntoId, { impersonadoPor: su.impersonadoPor });
});

/** Para páginas: redirige al login o a la selección de conjunto si hace falta. */
export async function requireCtx(): Promise<Ctx> {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  if (!su.conjuntoId) redirect(su.esSuperAdmin ? "/superadmin" : "/seleccionar-conjunto");
  const ctx = await getCtx();
  if (!ctx) redirect("/seleccionar-conjunto");
  return ctx;
}

/** Para acciones y API: lanza 401 en lugar de redirigir. */
export async function ctxOrThrow(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new AppError("Tu sesión expiró. Vuelve a iniciar sesión.", 401);
  return ctx;
}

export { conjuntoConfig } from "@/lib/conjunto/config";
