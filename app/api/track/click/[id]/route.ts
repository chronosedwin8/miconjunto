import { NextResponse } from "next/server";
import { registrarClic } from "@/lib/pagos/tracking";
import { appUrl } from "@/lib/email";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirección de clics de correos con seguimiento (`?u=<url>`). Evita redirecciones abiertas. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url).searchParams.get("u");
  if (!rateLimit(`track:${clientIp(req.headers)}`, 300, 60_000).ok) return NextResponse.redirect(appUrl("/"), 302);
  const destino = await registrarClic(id, u).catch(() => appUrl("/"));
  return NextResponse.redirect(destino, 302);
}
