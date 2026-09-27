import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { exportarMisDatos } from "@/lib/perfil/service";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** GET /perfil/mis-datos — exporta en JSON todos los datos personales del titular (derecho de acceso, Ley 1581/2012). */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!rateLimit(`mis-datos:${ctx.userId}`, 10, 60 * 60_000).ok) return NextResponse.json({ error: "Demasiadas descargas. Intenta más tarde." }, { status: 429 });
  const datos = await exportarMisDatos(ctx);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(datos, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mis-datos-miconjunto-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
