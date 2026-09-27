import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { ctxOrThrow, type Ctx } from "@/lib/auth/context";
import { assertCan, type PermKey } from "@/lib/permisos";
import { zodEs } from "@/lib/validation";

zodEs();

export type ActionResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function toActionError(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  if (e instanceof AppError) return { ok: false, error: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of e.issues) {
      const k = issue.path.join(".");
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, error: "Ya existe un registro con esos datos (duplicado)." };
    if (e.code === "P2025") return { ok: false, error: "El registro no existe o ya fue modificado." };
    if (e.code === "P2003") return { ok: false, error: "No se puede completar: hay registros relacionados." };
  }
  // Redirecciones de Next deben propagarse
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  console.error("[accion] error inesperado:", e);
  return { ok: false, error: "Ocurrió un error inesperado. Intenta de nuevo." };
}

/**
 * Envoltorio de Server Actions: valida sesión, permiso y datos (zod), y traduce errores
 * a mensajes claros. Las acciones solo validan, autorizan y delegan al servicio del módulo.
 */
export function action<S extends z.ZodType, R>(
  cfg: { perm?: PermKey | PermKey[]; schema: S },
  handler: (input: z.output<S>, ctx: Ctx) => Promise<R>,
): (input: z.input<S>) => Promise<ActionResult<R>> {
  return async (raw: z.input<S>) => {
    try {
      const ctx = await ctxOrThrow();
      if (cfg.perm) assertCan(ctx, cfg.perm);
      const input = cfg.schema.parse(raw);
      const data = await handler(input, ctx);
      return { ok: true, data };
    } catch (e) {
      return toActionError(e);
    }
  };
}
