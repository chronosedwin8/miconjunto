import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha } from "@/lib/format";
import { historialUnidad } from "@/lib/convivencia/service";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { NuevoLlamado } from "../../formularios";

export const metadata = { title: "Historial de convivencia" };

export default async function HistorialUnidadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  const { id } = await params;
  const h = await historialUnidad(ctx, id);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Historial de {h.unidad.codigo}</h2>
        {can(ctx, "convivencia.crear") && <NuevoLlamado ctx={ctx} unidadId={h.unidad.id} />}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Llamados" value={h.totales.llamados} />
        <StatCard label="Multas" value={h.totales.multas} />
        <StatCard label="Ratificadas" value={h.totales.ratificadas} tone={h.totales.ratificadas ? "warning" : "default"} />
        <StatCard label="Incidentes" value={h.totales.incidentes} />
      </div>
      {h.eventos.length === 0 ? (
        <EmptyState titulo="Sin antecedentes" descripcion="Esta unidad no tiene llamados, multas ni incidentes registrados." />
      ) : (
        <ol className="relative space-y-3 border-l-2 border-muted pl-5">
          {h.eventos.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[27px] top-3 size-3 rounded-full border-2 border-background bg-primary" />
              <Link href={e.href} className="block rounded-xl border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {e.tipo} · {fecha(e.fecha)}
                  {e.valor ? ` · ${cop(e.valor)}` : ""}
                </p>
                <p className="line-clamp-2 font-medium">{e.titulo}</p>
                <StatusBadge value={e.estado} className="mt-1" />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
