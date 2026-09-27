import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { storage, mimeFromName } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Sirve archivos del almacenamiento. Solo usuarios del mismo conjunto (o SuperAdmin).
 * Carpetas "publico" se sirven sin sesión (logos, fotos de zonas para la página pública).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.map(decodeURIComponent).join("/");
  if (key.includes("..")) return new NextResponse("Ruta inválida", { status: 400 });
  const [conjuntoId, folder] = parts;
  const publico = folder === "publico" || conjuntoId === "global";
  if (!publico) {
    const su = await getSessionUser();
    if (!su) return new NextResponse("No autenticado", { status: 401 });
    if (!su.esSuperAdmin) {
      const m = await prisma.membresiaConjunto.findFirst({ where: { usuarioId: su.userId, conjuntoId, deletedAt: null, estado: "ACTIVA" } });
      if (!m) return new NextResponse("Sin acceso", { status: 403 });
    }
  }
  const buf = await storage().get(key);
  if (!buf) return new NextResponse("No encontrado", { status: 404 });
  const name = key.split("/").pop() ?? "archivo";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFromName(name),
      "Cache-Control": publico ? "public, max-age=86400" : "private, max-age=3600",
      "Content-Disposition": `inline; filename="${name.replace(/^[a-f0-9]{16}-/, "")}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
