import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { toActionError } from "@/lib/action";
import { notFound } from "@/lib/errors";
import { assertVerCuenta } from "@/lib/pagos/acceso";
import { certificadoPazYSalvoPdf } from "@/lib/pagos/cartera-bridge";

export const runtime = "nodejs";

/** GET /cuenta/paz-y-salvo/<id> — PDF del certificado de paz y salvo (generado por Cartera). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  const { id } = await params;
  try {
    const cert = await ctx.db.certificadoPazYSalvo.findUnique({ where: { id }, select: { unidadId: true, codigo: true } });
    if (!cert) notFound("El certificado");
    await assertVerCuenta(ctx, cert.unidadId);
    const pdf = await certificadoPazYSalvoPdf(ctx, id);
    if (!pdf) return NextResponse.json({ error: "El PDF del certificado no está disponible." }, { status: 404 });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="paz-y-salvo-${cert.codigo}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
