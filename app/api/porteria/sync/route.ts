import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { sincronizar } from "@/lib/porteria/sync";

export const runtime = "nodejs";

/**
 * POST /api/porteria/sync {operaciones: [{clienteId, tipo, payload, creadoEn}]}
 * Sincroniza la cola offline de portería. Idempotente por clienteId.
 */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "porteria.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { operaciones?: unknown[] };
  if (!Array.isArray(body.operaciones)) return NextResponse.json({ error: "Formato no válido" }, { status: 400 });
  const resultados = await sincronizar(ctx, body.operaciones);
  return NextResponse.json({ resultados });
}
