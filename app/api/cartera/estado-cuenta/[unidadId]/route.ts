import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { estadoCuentaPdf } from "@/lib/cartera/estado-cuenta";
import { puedeVerCuentaUnidad, pdfResponse } from "@/lib/cartera/acceso";
import { toActionError } from "@/lib/action";

export const runtime = "nodejs";

/** GET /api/cartera/estado-cuenta/<unidadId> — PDF del estado de cuenta (admin o propietario de la unidad). */
export async function GET(req: Request, { params }: { params: Promise<{ unidadId: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { unidadId } = await params;
  if (!(await puedeVerCuentaUnidad(ctx, unidadId))) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    const u = await ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { codigo: true } });
    if (!u) return NextResponse.json({ error: "No existe" }, { status: 404 });
    const buf = await estadoCuentaPdf(ctx, unidadId);
    await audit(ctx, "descargar_estado_cuenta", "Unidad", unidadId);
    return pdfResponse(buf, `estado-cuenta-${u.codigo}.pdf`, new URL(req.url).searchParams.has("descargar"));
  } catch (e) {
    return NextResponse.json({ error: toActionError(e).error }, { status: 400 });
  }
}
