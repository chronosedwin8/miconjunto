import type { Ctx } from "@/lib/auth/context";
import { can, type PermKey } from "@/lib/permisos";

/**
 * ¿Puede el usuario ver la información financiera de la unidad? Quien tiene `<modulo>.ver_todos` ve todas;
 * el propietario ve las suyas; el arrendatario/residente solo si el propietario lo autorizó (puedeVerCuenta).
 */
export async function puedeVerCuentaUnidad(ctx: Ctx, unidadId: string, permTodos: PermKey = "cartera.ver_todos", permPropio: PermKey = "cartera.ver") {
  if (can(ctx, permTodos)) return true;
  if (!can(ctx, permPropio)) return false;
  if (ctx.unidadesPropias.includes(unidadId)) return true;
  const v = await ctx.db.vinculoUnidad.count({ where: { unidadId, personaId: { in: ctx.personaIds }, estado: "ACTIVO", puedeVerCuenta: true } });
  return v > 0;
}

export function pdfResponse(buf: Buffer, nombre: string, descargar = false) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
