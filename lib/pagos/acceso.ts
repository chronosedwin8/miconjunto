import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permisos";
import { AppError } from "@/lib/errors";

/**
 * Qué cuentas (unidades) puede ver y pagar el usuario:
 * - Propietario/copropietario: ve con `cartera.ver` o `pagos.pagar`; paga con `pagos.pagar`.
 * - Cualquier vínculo con `puedeVerCuenta` (p. ej. arrendatario autorizado por el propietario): ve y paga.
 * - Gestión con `cartera.ver_todos`: ve cualquier unidad (no aparece en su lista, pero puede consultarla).
 */
export type CuentaAccesible = { unidadId: string; codigo: string; relacion: "PROPIETARIO" | "AUTORIZADO"; puedePagar: boolean };

export async function cuentasAccesibles(
  ctx: Pick<Ctx, "conjuntoId" | "personaIds" | "permisos" | "esSuperAdmin" | "unidadIds" | "userId" | "rolBase">,
): Promise<CuentaAccesible[]> {
  if (!ctx.personaIds.length) return [];
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId: ctx.conjuntoId, personaId: { in: ctx.personaIds }, estado: "ACTIVO", deletedAt: null, unidad: { deletedAt: null } },
    select: { unidadId: true, tipo: true, puedeVerCuenta: true, unidad: { select: { codigo: true } } },
  });
  const verPropia = can(ctx, ["cartera.ver", "pagos.pagar"]);
  const pagar = can(ctx, "pagos.pagar");
  const out = new Map<string, CuentaAccesible>();
  for (const v of vinculos) {
    const propietario = v.tipo === "PROPIETARIO" || v.tipo === "COPROPIETARIO";
    let c: CuentaAccesible | null = null;
    if (propietario && verPropia) c = { unidadId: v.unidadId, codigo: v.unidad.codigo, relacion: "PROPIETARIO", puedePagar: pagar };
    else if (v.puedeVerCuenta) c = { unidadId: v.unidadId, codigo: v.unidad.codigo, relacion: "AUTORIZADO", puedePagar: true };
    if (!c) continue;
    const prev = out.get(v.unidadId);
    if (!prev || (c.relacion === "PROPIETARIO" && prev.relacion !== "PROPIETARIO") || (c.puedePagar && !prev.puedePagar)) out.set(v.unidadId, c);
  }
  return [...out.values()].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
}

/** Verifica que el usuario pueda ver la cuenta de la unidad. */
export async function assertVerCuenta(ctx: Ctx, unidadId: string) {
  if (can(ctx, "cartera.ver_todos")) return;
  const cuentas = await cuentasAccesibles(ctx);
  if (!cuentas.some((c) => c.unidadId === unidadId)) throw new AppError("No tienes acceso a la cuenta de esta unidad.", 403);
}

/** Verifica que el usuario pueda pagar la cuenta de la unidad (pagos.pagar y unidad propia, o autorizado). */
export async function assertPagarCuenta(ctx: Ctx, unidadId: string) {
  if (ctx.userId === "sistema") return;
  const cuentas = await cuentasAccesibles(ctx);
  if (!cuentas.some((c) => c.unidadId === unidadId && c.puedePagar)) throw new AppError("No tienes permiso para pagar la cuenta de esta unidad.", 403);
}
