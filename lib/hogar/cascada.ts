import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notificaciones";
import { ROLES_RESIDENCIALES } from "@/lib/permisos/catalog";

/**
 * Si el usuario ya no tiene vínculos activos ni pendientes en el conjunto y su rol es residencial,
 * suspende su membresía y cierra sus sesiones (sube `sessionVersion`). Devuelve true si lo desactivó.
 */
export async function desactivarSiSinVinculos(ctx: Ctx, usuarioId: string, motivo: string) {
  const restantes = await ctx.db.vinculoUnidad.count({
    where: { estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] }, persona: { usuarioId, deletedAt: null } },
  });
  if (restantes > 0) return false;
  const m = await ctx.db.membresiaConjunto.findFirst({ where: { usuarioId, estado: "ACTIVA", deletedAt: null }, include: { rol: true } });
  if (!m || !ROLES_RESIDENCIALES.has(m.rol.basadoEnClave ?? m.rol.clave)) return false;
  await ctx.db.membresiaConjunto.update({ where: { id: m.id }, data: { estado: "SUSPENDIDA" } });
  await prisma.usuario.update({ where: { id: usuarioId }, data: { sessionVersion: { increment: 1 } } });
  await audit(ctx, "suspender_membresia", "MembresiaConjunto", m.id, { estado: "ACTIVA" }, { estado: "SUSPENDIDA", motivo });
  return true;
}

/**
 * Cascada del acceso derivado: cuando un vínculo deja de estar activo (retiro, rechazo, supresión…), todos los
 * accesos que se derivaron de él terminan también (en varios niveles: propietario → arrendatario → su familia),
 * se revocan las invitaciones pendientes que otorgó, se avisa a cada persona y, si se quedó sin vínculos,
 * se suspende su membresía. Devuelve cuántos vínculos terminó.
 */
export async function terminarAccesosDerivados(ctx: Ctx, vinculoIds: string[], motivo: string): Promise<number> {
  const vistos = new Set(vinculoIds);
  let frontera = [...vistos];
  const afectados = new Map<string, Set<string>>(); // usuarioId → códigos de unidad
  let total = 0;
  while (frontera.length) {
    await ctx.db.invitacion.updateMany({ where: { derivadoDeId: { in: frontera }, estado: "PENDIENTE" }, data: { estado: "REVOCADA" } });
    const hijos = await ctx.db.vinculoUnidad.findMany({
      where: { derivadoDeId: { in: frontera }, estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] }, id: { notIn: [...vistos] } },
      select: {
        id: true,
        estado: true,
        unidadId: true,
        persona: { select: { usuarioId: true, nombres: true, apellidos: true } },
        unidad: { select: { codigo: true } },
      },
    });
    if (!hijos.length) break;
    await ctx.db.vinculoUnidad.updateMany({ where: { id: { in: hijos.map((h) => h.id) } }, data: { estado: "INACTIVO", fechaFin: new Date() } });
    for (const h of hijos) {
      vistos.add(h.id);
      total++;
      await audit(
        ctx,
        "terminar_acceso_derivado",
        "VinculoUnidad",
        h.id,
        { estado: h.estado },
        { estado: "INACTIVO", persona: `${h.persona.nombres} ${h.persona.apellidos}`, unidad: h.unidad.codigo, motivo },
      );
      if (h.persona.usuarioId) {
        const set = afectados.get(h.persona.usuarioId) ?? new Set<string>();
        set.add(h.unidad.codigo);
        afectados.set(h.persona.usuarioId, set);
      }
    }
    frontera = hijos.map((h) => h.id);
  }
  for (const [usuarioId, codigos] of afectados) {
    await desactivarSiSinVinculos(ctx, usuarioId, motivo);
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [usuarioId],
      titulo: "Tu acceso al hogar terminó",
      cuerpo: `Tu acceso a la unidad ${[...codigos].join(", ")} terminó porque el titular que te lo otorgó ya no está vinculado a ella. Si sigues viviendo allí, pídele al nuevo titular que te invite.`,
      enlace: "/inicio",
      tipo: "RESIDENTES",
      canales: ["push", "email"],
    });
  }
  return total;
}
