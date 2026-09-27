import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { busquedaPorteria } from "@/lib/porteria/service";

export const runtime = "nodejs";

/** GET /api/porteria/buscar?q= — buscador universal de portería (unidad, nombre, placa, documento, código). */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "porteria.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ resultados: await busquedaPorteria(ctx, q) });
}
