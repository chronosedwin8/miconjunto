import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { historialUnidad } from "@/lib/informes/service";
import { fecha } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Historial de la unidad" };

export default async function HistorialUnidadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("informes.historial_unidad");
  const { id } = await params;
  const { unidad, eventos } = await historialUnidad(ctx, id, can(ctx, ["cartera.ver_todos", "campos.unidad_financiero"]));
  return (
    <>
      <PageHeader titulo={`Historial de ${unidad.codigo}`} descripcion={unidad.torre?.nombre ?? "Casa"} volver="/informes" />
      {eventos.length === 0 && <EmptyState titulo="Sin eventos registrados" />}
      <ol className="relative ml-3 border-l pl-5">
        {eventos.map((e, i) => (
          <li key={i} className="mb-4">
            <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-primary" />
            <p className="text-xs text-muted-foreground">
              {fecha(e.fecha)} · <Badge variant="outline">{e.tipo}</Badge>
            </p>
            <p className="font-medium">{e.href ? <Link className="text-primary hover:underline" href={e.href}>{e.titulo}</Link> : e.titulo}</p>
            {e.detalle && <p className="text-sm text-muted-foreground">{e.detalle}</p>}
          </li>
        ))}
      </ol>
    </>
  );
}
