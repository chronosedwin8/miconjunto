import { NextResponse } from "next/server";
import type { Pasarela } from "@prisma/client";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { proveedorPorPasarela } from "./providers";
import { procesarEventoPago } from "./service";
import { FirmaInvalidaError } from "./types";

const MAX_BODY = 256 * 1024;

/** Conjunto dueño del webhook: Wompi por la referencia del cuerpo, Mercado Pago por `?c=`, el simulador no lo necesita. */
async function conjuntoDelWebhook(pasarela: Pasarela, rawBody: string, url: URL): Promise<string | null | undefined> {
  if (pasarela === "MERCADOPAGO") return url.searchParams.get("c");
  if (pasarela === "WOMPI") {
    try {
      const ref = (JSON.parse(rawBody) as { data?: { transaction?: { reference?: string } } }).data?.transaction?.reference;
      if (!ref) return undefined;
      const pago = await prisma.pago.findUnique({ where: { referencia: ref }, select: { conjuntoId: true } });
      return pago?.conjuntoId;
    } catch {
      return undefined;
    }
  }
  return null;
}

/**
 * Manejador común de webhooks de pasarelas: rate limit, verificación de firma con las credenciales del
 * conjunto, normalización y procesamiento idempotente. Responde 200 a eventos ya procesados o ajenos para
 * que la pasarela no reintente; 401 si la firma no es válida; 500 ante errores (la pasarela reintenta).
 */
export async function manejarWebhook(pasarela: Pasarela, req: Request) {
  const ip = clientIp(req.headers);
  if (!rateLimit(`webhook:${pasarela}:${ip}`, 120, 60_000).ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY) return NextResponse.json({ error: "Cuerpo demasiado grande" }, { status: 413 });
  const url = new URL(req.url);
  try {
    const conjuntoId = await conjuntoDelWebhook(pasarela, rawBody, url);
    if (conjuntoId === undefined) return NextResponse.json({ ok: true, resultado: "IGNORADO" });
    const provider = await proveedorPorPasarela(conjuntoId, pasarela);
    if (!provider) return NextResponse.json({ error: "Pasarela no configurada" }, { status: 400 });
    const evento = await provider.verificarWebhook({ rawBody, headers: req.headers, url });
    if (!evento) return NextResponse.json({ ok: true, resultado: "IGNORADO" });
    if (conjuntoId) {
      const pago = await prisma.pago.findUnique({ where: { referencia: evento.referencia }, select: { conjuntoId: true } });
      if (!pago || pago.conjuntoId !== conjuntoId) return NextResponse.json({ ok: true, resultado: "IGNORADO" });
    }
    const r = await procesarEventoPago(pasarela, evento);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof FirmaInvalidaError) {
      console.warn(`[webhook ${pasarela}] firma inválida desde ${ip}`);
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }
    console.error(`[webhook ${pasarela}] error:`, (e as Error).message);
    return NextResponse.json({ error: "Error procesando el evento" }, { status: 500 });
  }
}
