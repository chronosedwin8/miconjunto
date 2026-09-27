import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { pazYSalvoPdf } from "@/lib/cartera/paz-y-salvo";
import { puedeVerCuentaUnidad, pdfResponse } from "@/lib/cartera/acceso";
import { toActionError } from "@/lib/action";

export const runtime = "nodejs";

/** GET /api/cartera/paz-y-salvo/<id> — certificado de paz y salvo en PDF con QR de verificación. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const c = await ctx.db.certificadoPazYSalvo.findUnique({ where: { id }, select: { unidadId: true, codigo: true } });
  if (!c) return NextResponse.json({ error: "El certificado no existe" }, { status: 404 });
  if (!(await puedeVerCuentaUnidad(ctx, c.unidadId, "paz_y_salvo.ver_todos", "paz_y_salvo.solicitar"))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    return pdfResponse(await pazYSalvoPdf(ctx, id), `paz-y-salvo-${c.codigo}.pdf`, new URL(req.url).searchParams.has("descargar"));
  } catch (e) {
    return NextResponse.json({ error: toActionError(e).error }, { status: 400 });
  }
}
