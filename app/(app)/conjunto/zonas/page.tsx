import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop } from "@/lib/format";
import { label } from "@/lib/labels";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Zonas comunes" };

export default async function ZonasPage() {
  const ctx = await requirePage("zonas.ver");
  const zonas = await ctx.db.zonaComun.findMany({ orderBy: { nombre: "asc" } });
  return (
    <>
      {can(ctx, "zonas.crear") && (
        <div className="mb-4">
          <Button render={<Link href="/conjunto/zonas/nueva" />}>
            <Plus /> Nueva zona común
          </Button>
        </div>
      )}
      {zonas.length === 0 && <EmptyState titulo="Aún no hay zonas comunes" descripcion="Crea el salón social, la piscina, el gimnasio…" />}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {zonas.map((z) => (
          <li key={z.id}>
            <Link href={`/conjunto/zonas/${z.id}`} className="block overflow-hidden rounded-xl border bg-card hover:bg-muted/50">
              {z.fotos[0] ? <img src={z.fotos[0]} alt="" className="h-32 w-full object-cover" /> : <div className="grid h-20 place-items-center bg-primary/10 text-sm text-primary">{label(z.categoria)}</div>}
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{z.nombre}</p>
                  <StatusBadge value={z.estado} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {z.capacidad ? `${z.capacidad} personas · ` : ""}
                  {Number(z.tarifa) > 0 ? cop(z.tarifa) : "Incluida en la cuota"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {!z.reservable && <Badge variant="secondary">No reservable</Badge>}
                  {z.requiereAprobacion && <Badge variant="info">Requiere aprobación</Badge>}
                  {z.gravaIva && <Badge variant="warning">IVA {Number(z.tarifaIva)} %</Badge>}
                  {z.generaFactura && <Badge variant="outline">Factura electrónica</Badge>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
