import * as React from "react";
import { NextResponse } from "next/server";
import { renderPdf } from "@/lib/pdf/kit";
import { cotizacionPorToken } from "@/lib/comercial/service";
import { CotizacionPdf } from "@/lib/comercial/pdf";

export const runtime = "nodejs";

/** PDF público de una cotización comercial; se accede con el token aleatorio del enlace (no con el número). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await cotizacionPorToken(token);
  if (!c) return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 });
  const pdf = await renderPdf(React.createElement(CotizacionPdf, { c }));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Conjunto360-${c.numero}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
