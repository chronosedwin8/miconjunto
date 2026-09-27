import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { toActionError } from "@/lib/action";
import { consultarPago } from "@/lib/pagos/service";
import { reciboPagoPdf } from "@/lib/pagos/cartera-bridge";

export const runtime = "nodejs";

/** GET /cuenta/pagos/<referencia>/recibo — recibo de caja PDF de un pago aprobado. */
export async function GET(req: Request, { params }: { params: Promise<{ referencia: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  const { referencia } = await params;
  try {
    const pago = await consultarPago(ctx, referencia);
    if (pago.estado !== "APROBADO") return NextResponse.json({ error: "El pago aún no está aprobado." }, { status: 409 });
    const pdf = await reciboPagoPdf(ctx, pago.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="recibo-${pago.numeroRecibo ?? referencia}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
