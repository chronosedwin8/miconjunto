import Link from "next/link";
import { Download } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spFlat, type SP } from "@/lib/pagination";
import { torreOptions } from "@/lib/conjunto/options";
import { datosTablero, filtroDesdeParams, PRESETS, tablerosVisibles, type TableroKey } from "@/lib/estadisticas/tableros";
import { indicadoresPublicos } from "@/lib/estadisticas/service";
import { fecha, isoDate } from "@/lib/format";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";
import { Tablero } from "./tablero";

export const metadata = { title: "Estadísticas" };

export default async function EstadisticasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["estadisticas.ver", "estadisticas.personal"]);
  const sp = spFlat(await searchParams);
  const visibles = tablerosVisibles(ctx);
  const tab = (visibles.find((t) => t.key === sp.tab)?.key ?? visibles[0]?.key) as TableroKey | undefined;
  const f = filtroDesdeParams(sp);
  const [datos, torres, publicos] = await Promise.all([tab ? datosTablero(ctx, tab, f) : null, torreOptions(ctx), can(ctx, "estadisticas.ver") ? Promise.resolve([]) : indicadoresPublicos(ctx)]);
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/estadisticas?${p.toString()}`;
  };
  const exportQs = new URLSearchParams(Object.entries({ ...sp, tab: tab ?? "" }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader
        titulo="Estadísticas"
        descripcion={`${fecha(f.desde)} – ${fecha(f.hasta)} · comparado con el periodo anterior`}
        acciones={
          tab && (
            <a href={`/api/estadisticas/export?${exportQs}`} className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm hover:bg-muted">
              <Download className="size-4" /> Exportar Excel
            </a>
          )
        }
      />
      {publicos.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {publicos.map((p) => (
            <div key={p.label} className="rounded-xl border bg-card p-3 text-sm">
              <p className="text-xs text-muted-foreground">{p.label}</p>
              <p className="text-xl font-bold">{p.valor}</p>
            </div>
          ))}
        </div>
      )}
      {/* Filtros en una fila */}
      <form action="/estadisticas" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tab ?? ""} />
        <label className="text-xs">
          Periodo
          <select name="rango" defaultValue={sp.rango ?? "180"} className="mt-1 block h-10 rounded-lg border bg-background px-2 text-sm">
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Desde
          <input type="date" name="desde" defaultValue={sp.desde ?? ""} max={isoDate(new Date())} className="mt-1 block h-10 rounded-lg border bg-background px-2 text-sm" />
        </label>
        <label className="text-xs">
          Hasta
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ""} className="mt-1 block h-10 rounded-lg border bg-background px-2 text-sm" />
        </label>
        {tab !== "personal" && (
          <label className="text-xs">
            Torre
            <select name="torre" defaultValue={sp.torre ?? ""} className="mt-1 block h-10 rounded-lg border bg-background px-2 text-sm">
              <option value="">Todas</option>
              {torres.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              <option value="casas">Casas</option>
            </select>
          </label>
        )}
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Aplicar</button>
      </form>
      <nav className="-mx-4 mb-4 overflow-x-auto border-b px-4 no-scrollbar lg:mx-0 lg:px-0" aria-label="Tableros">
        <ul className="flex gap-1">
          {visibles.map((t) => (
            <li key={t.key} className="shrink-0">
              <Link href={link({ tab: t.key })} className={cn("inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium", t.key === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {!tab || !datos ? <EmptyState titulo="No tienes tableros disponibles" descripcion="Pide a la administración acceso a estadísticas." /> : <Tablero tab={tab} datos={JSON.parse(JSON.stringify(datos))} />}
    </>
  );
}
