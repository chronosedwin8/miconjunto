import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/auth/context";
import { toActionError } from "@/lib/action";
import { can } from "@/lib/permisos";
import { rateLimit } from "@/lib/rate-limit";
import { responderSolicitud } from "@/lib/porteria/solicitudes";

export const runtime = "nodejs";

const schema = z.object({ decision: z.enum(["AUTORIZADA", "RECHAZADA"]) });

/**
 * POST /api/porteria/solicitudes/:id/responder {decision: "AUTORIZADA" | "RECHAZADA"}
 * Lo llama el service worker desde los botones de la notificación push y el banner del residente.
 * Solo usuarios vinculados a la unidad de la solicitud.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!rateLimit(`responder:${ctx.userId}`, 30, 60_000).ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  if (!can(ctx, "visitantes.autorizar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    const { id } = await params;
    const body = schema.parse(await req.json().catch(() => ({})));
    const r = await responderSolicitud(ctx, id, body.decision);
    return NextResponse.json({ data: r });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
