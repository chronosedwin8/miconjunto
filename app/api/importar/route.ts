import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { readSheet } from "@/lib/export/xlsx";
import { prepararImportacion, TIPOS_IMPORTACION, type TipoImportacion } from "@/lib/importacion/service";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

/** Recibe un Excel/CSV, lo valida fila por fila y deja la importación lista para aplicar. */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, ["conjunto.importar", "configuracion.editar"])) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const fd = await req.formData();
  const file = fd.get("file");
  const tipo = String(fd.get("tipo") ?? "") as TipoImportacion;
  if (!(file instanceof File)) return NextResponse.json({ error: "Adjunta un archivo" }, { status: 400 });
  if (!(tipo in TIPOS_IMPORTACION)) return NextResponse.json({ error: "Tipo de importación no válido" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Máximo 8 MB" }, { status: 413 });
  try {
    const filas = await readSheet(Buffer.from(await file.arrayBuffer()), file.name);
    const r = await prepararImportacion(ctx, tipo, file.name, filas);
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof AppError ? e.message : "No se pudo leer el archivo. Usa la plantilla en formato .xlsx o .csv.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
