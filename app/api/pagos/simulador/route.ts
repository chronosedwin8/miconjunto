import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { toNumber } from "@/lib/format";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { simuladorVerificarTokenCheckout } from "@/lib/pagos/firmas";
import { enviarWebhookSimulado, simuladorHabilitado } from "@/lib/pagos/providers/simulador";
import { MEDIOS_EN_LINEA, type MedioEnLinea } from "@/lib/pagos/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Botones "Aprobar" / "Rechazar" del checkout simulado (/pagar/simulador/[referencia]).
 * Verifica el token del checkout y envía a la app un webhook FIRMADO igual al de una pasarela real;
 * luego redirige a la URL de retorno del pago.
 */
export async function POST(req: Request) {
  if (!simuladorHabilitado()) return NextResponse.json({ error: "Simulador deshabilitado" }, { status: 404 });
  if (!rateLimit(`simulador:${clientIp(req.headers)}`, 30, 60_000).ok) return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  const fd = await req.formData();
  const referencia = String(fd.get("referencia") ?? "");
  const t = String(fd.get("t") ?? "");
  const decision = fd.get("decision") === "APROBADO" ? "APROBADO" : "RECHAZADO";
  const medioRaw = String(fd.get("medio") ?? "PSE");
  const medio: MedioEnLinea = (MEDIOS_EN_LINEA as readonly string[]).includes(medioRaw) ? (medioRaw as MedioEnLinea) : "PSE";
  if (!simuladorVerificarTokenCheckout(referencia, t)) return NextResponse.json({ error: "Checkout no válido" }, { status: 403 });
  const pago = await prisma.pago.findUnique({ where: { referencia } });
  if (!pago || pago.pasarela !== "SIMULADOR") return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });
  const datos = (pago.datosPasarela ?? {}) as Record<string, unknown>;
  const destino =
    typeof datos.redirectUrl === "string" && datos.redirectUrl.startsWith(appUrl("/")) ? datos.redirectUrl : appUrl(`/cuenta/pagos/${referencia}`);
  if (pago.estado === "PENDIENTE") {
    try {
      await enviarWebhookSimulado({ referencia, estado: decision, medio, valor: toNumber(pago.valor) });
    } catch (e) {
      console.error("[simulador] no se pudo enviar el webhook:", (e as Error).message);
    }
  }
  return NextResponse.redirect(destino, 303);
}
