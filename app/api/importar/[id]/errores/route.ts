import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { toXlsx } from "@/lib/export/xlsx";
import type { ErrorFila } from "@/lib/importacion/service";

export const runtime = "nodejs";

/** Reporte descargable de errores por fila de una importación. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id } = await params;
  const imp = await ctx.db.importacionApertura.findUnique({ where: { id } });
  if (!imp) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const buf = await toXlsx(
    `Errores ${imp.archivoNombre}`,
    [
      { header: "Fila", key: "fila", width: 8 },
      { header: "Campo", key: "campo", width: 22 },
      { header: "Error", key: "mensaje", width: 70 },
    ],
    (imp.errores as ErrorFila[]) ?? [],
    "Errores",
  );
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="errores-${imp.tipo.toLowerCase()}.xlsx"` },
  });
}
