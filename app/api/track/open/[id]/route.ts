import { registrarApertura } from "@/lib/pagos/tracking";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GIF transparente de 1×1
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Pixel de apertura de correos con seguimiento. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (rateLimit(`track:${clientIp(req.headers)}`, 300, 60_000).ok) await registrarApertura(id).catch(() => undefined);
  return new Response(new Uint8Array(PIXEL), {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, private", "Content-Length": String(PIXEL.length) },
  });
}
