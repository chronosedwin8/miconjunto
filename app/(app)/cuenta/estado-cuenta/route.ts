import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { toActionError } from "@/lib/action";
import { assertVerCuenta } from "@/lib/pagos/acceso";
import { estadoCuentaPdf } from "@/lib/pagos/cartera-bridge";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** GET /cuenta/estado-cuenta?unidad=<id> — estado de cuenta PDF de una unidad propia o autorizada. */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  const unidadId = new URL(req.url).searchParams.get("unidad") ?? "";
  try {
    await assertVerCuenta(ctx, unidadId);
    const unidad = await ctx.db.unidad.findUniqueOrThrow({ where: { id: unidadId }, select: { codigo: true } });
    const pdf = await estadoCuentaPdf(ctx, unidadId);
    await audit(ctx, "descargar_estado_cuenta", "Unidad", unidadId);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="estado-cuenta-${unidad.codigo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
