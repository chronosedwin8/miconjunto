import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { auth } from "./index";
import { buildCtx, type Ctx } from "./build-ctx";

export { buildCtx };
export type { Ctx };

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
