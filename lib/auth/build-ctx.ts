import type { Conjunto } from "@prisma/client";
import { prisma, withTenant, type TenantClient } from "@/lib/db";
import { loadRolePerms, ROLES_RESIDENCIALES, SUPERADMIN_PERMS } from "@/lib/permisos";
import { resolverAcceso } from "@/lib/hogar/capacidades";

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
  /** Unidades a las que el usuario está vinculado (activo y con acceso no pausado). */
  unidadIds: string[];
  /** Unidades de las que es propietario/copropietario. */
  unidadesPropias: string[];
  personaIds: string[];
  /** Entra solo con acceso derivado del titular: sus permisos están limitados por capacidades (lib/hogar). */
  accesoDerivado?: boolean;
  db: TenantClient;
};

/**
 * Construye el contexto de un usuario en un conjunto (sin depender de next-auth, para poder probarlo).
 * Se ejecuta en cada request: 4 consultas (usuario, conjunto, membresía, vínculos con su titular).
 */
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
    select: {
      unidadId: true,
      personaId: true,
      tipo: true,
      derivadoDeId: true,
      capacidadesHogar: true,
      accesoPausado: true,
      derivadoDe: { select: { estado: true, accesoPausado: true, deletedAt: true } },
    },
  });
  const acceso = resolverAcceso({ rolResidencial: !user.esSuperAdmin && ROLES_RESIDENCIALES.has(rolBase), permisosRol: permisos, vinculos });

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
    permisos: acceso.permisos,
    unidadIds: acceso.unidadIds,
    unidadesPropias: acceso.unidadesPropias,
    personaIds: acceso.personaIds,
    accesoDerivado: acceso.accesoDerivado,
    db: withTenant(prisma, conjuntoId),
  };
}
