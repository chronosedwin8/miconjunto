import { prisma, withTenant } from "@/lib/db";
import { SUPERADMIN_PERMS } from "@/lib/permisos";
import type { Ctx } from "./context";

/**
 * Contexto de sistema para jobs, webhooks y seed: todos los permisos dentro del conjunto,
 * sin sesión HTTP. Las operaciones quedan auditadas como "Sistema".
 */
export async function systemCtx(conjuntoId: string, opts?: { userId?: string; nombre?: string }): Promise<Ctx> {
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  return {
    userId: opts?.userId ?? "sistema",
    nombre: opts?.nombre ?? "Sistema MiConjunto",
    email: "sistema@miconjunto.co",
    fotoUrl: null,
    textoGrande: false,
    esSuperAdmin: true,
    impersonadoPor: null,
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
    rolId: null,
    rolClave: "SISTEMA",
    rolBase: "ADMINISTRADOR",
    rolNombre: "Sistema",
    permisos: SUPERADMIN_PERMS,
    unidadIds: [],
    unidadesPropias: [],
    personaIds: [],
    db: withTenant(prisma, conjuntoId),
  };
}
