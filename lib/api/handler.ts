import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx, type Ctx } from "@/lib/auth/context";
import { prisma, withTenant } from "@/lib/db";
import { can, type PermKey } from "@/lib/permisos";
import { toActionError } from "@/lib/action";
import { rateLimit } from "@/lib/rate-limit";
import { tokenFromHeader } from "./tokens";

/**
 * Manejador REST /api/v1: autentica con sesión o con `Authorization: Bearer <token de API>`,
 * verifica permiso, valida con zod (query para GET, JSON para el resto) y delega al servicio.
 *
 *   export const GET = apiHandler({ perm: "tickets.ver" }, async ({ ctx, query }) => listarTickets(ctx, query));
 */
export type ApiArgs<S extends z.ZodType> = { ctx: Ctx; input: z.output<S>; params: Record<string, string>; req: Request };

async function ctxFromToken(req: Request): Promise<Ctx | null> {
  const t = await tokenFromHeader(req.headers.get("authorization"));
  if (!t) return null;
  const conjunto = await prisma.conjunto.findUnique({ where: { id: t.conjuntoId } });
  if (!conjunto) return null;
  return {
    userId: `api:${t.id}`,
    nombre: `API: ${t.nombre}`,
    email: "api@miconjunto.co",
    fotoUrl: null,
    textoGrande: false,
    esSuperAdmin: false,
    impersonadoPor: null,
    conjuntoId: t.conjuntoId,
    conjunto: { id: conjunto.id, nombre: conjunto.nombre, slug: conjunto.slug, colorPrimario: conjunto.colorPrimario, logoUrl: conjunto.logoUrl, config: conjunto.config, modulosActivos: conjunto.modulosActivos, ciudad: conjunto.ciudad, nit: conjunto.nit },
    rolId: null,
    rolClave: "API",
    rolBase: "API",
    rolNombre: "Token de API",
    permisos: new Set(t.permisos),
    unidadIds: [],
    unidadesPropias: [],
    personaIds: [],
    db: withTenant(prisma, t.conjuntoId),
  };
}

export function apiHandler<S extends z.ZodType = z.ZodObject<Record<string, never>>>(
  cfg: { perm?: PermKey | PermKey[]; schema?: S },
  fn: (a: ApiArgs<S>) => Promise<unknown>,
) {
  return async (req: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const ctx = req.headers.get("authorization")?.startsWith("Bearer ") ? await ctxFromToken(req) : await getCtx();
      if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
      if (!rateLimit(`api:${ctx.userId}`, 300, 60_000).ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
      if (cfg.perm && !can(ctx, cfg.perm)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
      let raw: unknown = {};
      if (req.method === "GET" || req.method === "DELETE") raw = Object.fromEntries(new URL(req.url).searchParams.entries());
      else raw = await req.json().catch(() => ({}));
      const input = cfg.schema ? cfg.schema.parse(raw) : raw;
      const params = (await context.params) ?? {};
      const data = await fn({ ctx, input: input as z.output<S>, params, req });
      return NextResponse.json({ data });
    } catch (e) {
      const r = toActionError(e);
      const status = (e as { status?: number }).status ?? (r.fieldErrors ? 422 : 400);
      return NextResponse.json({ error: r.error, fieldErrors: r.fieldErrors }, { status });
    }
  };
}
