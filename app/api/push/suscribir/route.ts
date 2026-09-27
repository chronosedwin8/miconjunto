import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/context";
import { eliminarSuscripcionPush, guardarSuscripcionPush } from "@/lib/perfil/service";
import { rateLimit } from "@/lib/rate-limit";

const subSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

/** POST: guarda la suscripción Web Push del navegador para el usuario de la sesión. */
export async function POST(req: Request) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!rateLimit(`push:${su.userId}`, 20, 60_000).ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  const parsed = subSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Suscripción no válida" }, { status: 400 });
  const id = await guardarSuscripcionPush(su.userId, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: req.headers.get("user-agent")?.slice(0, 250) ?? null,
  });
  return NextResponse.json({ ok: true, id });
}

/** DELETE: elimina la suscripción de este navegador (o todas si no se envía endpoint). */
export async function DELETE(req: Request) {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  const n = await eliminarSuscripcionPush(su.userId, typeof body.endpoint === "string" ? body.endpoint : null);
  return NextResponse.json({ ok: true, eliminadas: n });
}
