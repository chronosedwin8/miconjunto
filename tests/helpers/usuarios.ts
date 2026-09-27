import { prisma, withTenant } from "@/lib/db";
import { loadRolePerms } from "@/lib/permisos";
import type { Ctx } from "@/lib/auth/context";

/**
 * Crea un usuario con rol en el conjunto (y vínculo a una unidad si se indica) y devuelve un contexto
 * equivalente al de `buildCtx` (sin importar next-auth, que no carga fuera de Next).
 */
export async function makeUsuario(conjuntoId: string, rolId: string, unidadId?: string, tipo: "PROPIETARIO" | "ARRENDATARIO" = "PROPIETARIO"): Promise<Ctx> {
  const tag = Math.random().toString(36).slice(2, 9);
  const u = await prisma.usuario.create({ data: { email: `u-${tag}@prueba.co`, nombre: `Usuario ${tag}` } });
  await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId, rolId } });
  let personaId: string | null = null;
  if (unidadId) {
    const p = await prisma.persona.create({ data: { conjuntoId, numeroDocumento: tag, nombres: "Persona", apellidos: tag, usuarioId: u.id } });
    await prisma.vinculoUnidad.create({ data: { conjuntoId, personaId: p.id, unidadId, tipo } });
    personaId = p.id;
  }
  const rol = await prisma.rol.findUniqueOrThrow({ where: { id: rolId } });
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  return {
    userId: u.id,
    nombre: u.nombre,
    email: u.email,
    fotoUrl: null,
    textoGrande: false,
    esSuperAdmin: false,
    impersonadoPor: null,
    conjuntoId,
    conjunto: { id: conjunto.id, nombre: conjunto.nombre, slug: conjunto.slug, colorPrimario: conjunto.colorPrimario, logoUrl: conjunto.logoUrl, config: conjunto.config, modulosActivos: conjunto.modulosActivos, ciudad: conjunto.ciudad, nit: conjunto.nit },
    rolId,
    rolClave: rol.clave,
    rolBase: rol.basadoEnClave ?? rol.clave,
    rolNombre: rol.nombre,
    permisos: await loadRolePerms(rolId, rol.version),
    unidadIds: unidadId ? [unidadId] : [],
    unidadesPropias: unidadId && tipo === "PROPIETARIO" ? [unidadId] : [],
    personaIds: personaId ? [personaId] : [],
    db: withTenant(prisma, conjuntoId),
  };
}
