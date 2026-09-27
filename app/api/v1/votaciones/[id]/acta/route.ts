import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { toActionError } from "@/lib/action";
import { actaVotacionPdf } from "@/lib/votaciones/acta";

export const runtime = "nodejs";

/** GET /api/v1/votaciones/:id/acta — acta PDF de resultados (parcial si sigue abierta). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "votaciones.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    const { id } = await params;
    const pdf = await actaVotacionPdf(ctx, id);
    return new NextResponse(new Uint8Array(pdf.buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${pdf.nombre}"` } });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
