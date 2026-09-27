import { manejarWebhook } from "@/lib/pagos/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Webhook de MERCADOPAGO (verifica firma, idempotente). Ver docs/modulos/pagos.md. */
export async function POST(req: Request) {
  return manejarWebhook("MERCADOPAGO", req);
}
