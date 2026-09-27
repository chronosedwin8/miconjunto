import { headers } from "next/headers";
import { prisma } from "@/lib/db";

type Actor = { userId?: string | null; nombre?: string | null; conjuntoId?: string | null; impersonadoPor?: string | null };

const SENSITIVE = /password|hash|secret|token|mfa|cifrad|firma/i;

/** Quita campos sensibles antes de guardar en auditoría o logs. */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[oculto]" : redact(v);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

async function requestMeta() {
  try {
    const h = await headers();
    return {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
      userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}

/** Registro inmutable de auditoría. Nunca lanza: una falla de auditoría no debe tumbar la operación. */
export async function audit(
  actor: Actor,
  accion: string,
  entidad: string,
  entidadId?: string | null,
  antes?: unknown,
  despues?: unknown,
) {
  try {
    const meta = await requestMeta();
    await prisma.auditoria.create({
      data: {
        conjuntoId: actor.conjuntoId ?? null,
        usuarioId: actor.userId ?? null,
        usuarioNombre: actor.nombre ?? null,
        impersonadoPorId: actor.impersonadoPor ?? null,
        accion,
        entidad,
        entidadId: entidadId ?? null,
        antes: antes === undefined ? undefined : (JSON.parse(JSON.stringify(redact(antes))) as object),
        despues: despues === undefined ? undefined : (JSON.parse(JSON.stringify(redact(despues))) as object),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  } catch (e) {
    console.error("[auditoria] no se pudo registrar", accion, entidad, (e as Error).message);
  }
}
