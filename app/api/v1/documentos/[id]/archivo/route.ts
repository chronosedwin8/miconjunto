import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { readFileByUrl } from "@/lib/storage";
import { puedeVerDocumento } from "@/lib/documentos/service";

export const runtime = "nodejs";

/**
 * GET /api/v1/documentos/:id/archivo?version=N — descarga validando la visibilidad por rol del documento
 * (además del control por conjunto de /api/files).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "documentos.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const { id } = await params;
  const d = await ctx.db.documento.findUnique({ where: { id }, include: { carpeta: true } });
  if (!d || !puedeVerDocumento(ctx, d)) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const v = Number(new URL(req.url).searchParams.get("version")) || d.versionActual;
  const version = await ctx.db.versionDocumento.findFirst({ where: { documentoId: id, version: v } });
  if (!version) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  const buf = await readFileByUrl(version.archivoUrl);
  if (!buf) return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  const nombre = version.nombreArchivo.replace(/["\r\n]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": version.mime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${nombre.replace(/[^ -~]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
