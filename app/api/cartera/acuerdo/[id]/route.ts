import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { acuerdoPdf } from "@/lib/cartera/documentos";
import { puedeVerCuentaUnidad, pdfResponse } from "@/lib/cartera/acceso";
import { toActionError } from "@/lib/action";

export const runtime = "nodejs";

/** GET /api/cartera/acuerdo/<id> — documento del acuerdo de pago (para firma). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const a = await ctx.db.acuerdoPago.findUnique({ where: { id }, select: { unidadId: true } });
  if (!a) return NextResponse.json({ error: "El acuerdo no existe" }, { status: 404 });
  if (!(await puedeVerCuentaUnidad(ctx, a.unidadId))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    return pdfResponse(await acuerdoPdf(ctx, id), `acuerdo-de-pago.pdf`);
  } catch (e) {
    return NextResponse.json({ error: toActionError(e).error }, { status: 400 });
  }
}
