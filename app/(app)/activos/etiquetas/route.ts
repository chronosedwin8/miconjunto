import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { whereActivos } from "@/lib/activos/service";
import { etiquetasPdf } from "@/lib/activos/etiquetas";

export const runtime = "nodejs";

/** PDF de etiquetas QR imprimibles: /activos/etiquetas?ids=a,b  (o con los filtros de la lista: q, categoria, estado). */
export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(ctx, "activos.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const where = ids.length ? { id: { in: ids } } : whereActivos({ q: sp.get("q") ?? undefined, categoria: sp.get("categoria") ?? undefined, estado: sp.get("estado") ?? undefined });
  const activos = await ctx.db.activo.findMany({
    where: { ...where, estado: ids.length ? undefined : { not: "DADO_DE_BAJA" } },
    select: { nombre: true, categoria: true, ubicacion: true, codigoQr: true, zona: { select: { nombre: true } } },
    orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    take: 300,
  });
  if (!activos.length) return NextResponse.json({ error: "No hay activos para imprimir" }, { status: 404 });
  const buf = await etiquetasPdf(
    activos.map((a) => ({ nombre: a.nombre, categoria: a.categoria, ubicacion: a.ubicacion ?? a.zona?.nombre ?? null, codigoQr: a.codigoQr })),
    { nombre: ctx.conjunto.nombre, colorPrimario: ctx.conjunto.colorPrimario },
  );
  await audit(ctx, "imprimir_etiquetas", "Activo", null, undefined, { cantidad: activos.length });
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="etiquetas-qr-activos.pdf"` },
  });
}
