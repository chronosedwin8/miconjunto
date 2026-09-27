import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { archivoFactura, facturaVisible } from "@/lib/facturacion/service";

export const runtime = "nodejs";

/** GET /api/facturacion/:id/pdf | /xml — representación gráfica o XML de la factura (residente: solo las suyas). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; formato: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { id, formato } = await params;
  if (formato !== "pdf" && formato !== "xml") return NextResponse.json({ error: "Formato no válido" }, { status: 404 });
  if (!can(ctx, ["facturacion.ver", "reservas.ver", "reservas.ver_todos"])) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const f = await facturaVisible(ctx, id);
  if (!f) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const buf = await archivoFactura(f, formato).catch(() => null);
  if (!buf) return NextResponse.json({ error: "El archivo aún no está disponible" }, { status: 404 });
  await audit(ctx, "descargar", "FacturaElectronica", id, undefined, { formato });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/xml",
      "Content-Disposition": `${formato === "pdf" ? "inline" : "attachment"}; filename="${f.numero ?? f.referenceCode}.${formato}"`,
    },
  });
}
