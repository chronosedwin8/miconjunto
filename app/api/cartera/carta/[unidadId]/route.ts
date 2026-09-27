import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { appUrl } from "@/lib/email";
import { cartasCobroPdf } from "@/lib/cartera/documentos";
import { pdfResponse } from "@/lib/cartera/acceso";
import { toActionError } from "@/lib/action";

export const runtime = "nodejs";

/** GET /api/cartera/carta/<unidadId> — vista previa de la carta de cobro (no registra gestión). */
export async function GET(_req: Request, { params }: { params: Promise<{ unidadId: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "cartera.gestionar_cobro")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { unidadId } = await params;
  try {
    return pdfResponse(await cartasCobroPdf(ctx, [unidadId], undefined, appUrl("/cuenta")), "carta-de-cobro.pdf");
  } catch (e) {
    return NextResponse.json({ error: toActionError(e).error }, { status: 400 });
  }
}
