import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { toActionError } from "@/lib/action";
import { actaAsambleaPdf } from "@/lib/asambleas/acta";

export const runtime = "nodejs";

/** GET /api/v1/asambleas/:id/acta — PDF del acta (borrador solo para quien gestiona; publicada para todos). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "asambleas.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    const { id } = await params;
    const a = await ctx.db.asamblea.findUnique({ where: { id }, select: { actaPublicadaEn: true } });
    if (!a) return NextResponse.json({ error: "No existe" }, { status: 404 });
    if (!a.actaPublicadaEn && !can(ctx, "asambleas.gestionar")) return NextResponse.json({ error: "El acta aún no está publicada" }, { status: 403 });
    const pdf = await actaAsambleaPdf(ctx, id);
    return new NextResponse(new Uint8Array(pdf.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.nombre}"` } });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
