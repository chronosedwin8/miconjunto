import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { reciboPdf } from "@/lib/cartera/documentos";
import { puedeVerCuentaUnidad, pdfResponse } from "@/lib/cartera/acceso";
import { toActionError } from "@/lib/action";

export const runtime = "nodejs";

/** GET /api/cartera/recibo/<pagoId> — recibo de caja en PDF (con consecutivo). */
export async function GET(req: Request, { params }: { params: Promise<{ pagoId: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { pagoId } = await params;
  const p = await ctx.db.pago.findUnique({ where: { id: pagoId }, select: { unidadId: true, numeroRecibo: true } });
  if (!p || !p.numeroRecibo) return NextResponse.json({ error: "El recibo no existe" }, { status: 404 });
  if (!(await puedeVerCuentaUnidad(ctx, p.unidadId, "pagos.ver_todos", "pagos.ver"))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    return pdfResponse(await reciboPdf(ctx, pagoId), `recibo-${p.numeroRecibo}.pdf`, new URL(req.url).searchParams.has("descargar"));
  } catch (e) {
    return NextResponse.json({ error: toActionError(e).error }, { status: 400 });
  }
}
