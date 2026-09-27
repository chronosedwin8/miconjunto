import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, saveFile, scanFile } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Subida de archivos (fotos desde la cámara, documentos). Valida tamaño y tipo. */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!rateLimit(`upload:${ctx.userId}`, 60, 60_000).ok) return NextResponse.json({ error: "Demasiadas subidas, espera un momento." }, { status: 429 });
  const fd = await req.formData();
  const file = fd.get("file");
  const folder = String(fd.get("folder") ?? "adjuntos").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "adjuntos";
  if (!(file instanceof File)) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "El archivo supera 10 MB." }, { status: 413 });
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.includes(mime)) return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 415 });
  const body = Buffer.from(await file.arrayBuffer());
  const scan = await scanFile(body);
  if (!scan.ok) return NextResponse.json({ error: "El archivo fue rechazado por el antivirus." }, { status: 422 });
  const saved = await saveFile({ conjuntoId: ctx.conjuntoId, folder, body, filename: file.name, mime });
  await prisma.adjunto.create({
    data: { conjuntoId: ctx.conjuntoId, entidad: folder, entidadId: "-", url: saved.url, nombre: file.name, mime, tamano: file.size, subidoPorId: ctx.userId },
  });
  return NextResponse.json({ url: saved.url, nombre: file.name, mime, tamano: file.size });
}
