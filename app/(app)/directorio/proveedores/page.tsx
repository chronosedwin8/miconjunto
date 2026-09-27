import Link from "next/link";
import { Gift, Star } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { num } from "@/lib/format";
import { spGet, type SP } from "@/lib/pagination";
import { categoriasProveedores, proveedoresComunitarios } from "@/lib/directorio/service";
import { ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState } from "@/components/app/empty-state";
import { Estrellas } from "../_components/estrellas";

export const metadata = { title: "Proveedores recomendados" };

export default async function ProveedoresComunidadPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("directorio.proveedores");
  const sp = await searchParams;
  const [provs, cats] = await Promise.all([proveedoresComunitarios(ctx, { q: spGet(sp, "q"), categoria: spGet(sp, "categoria") }), categoriasProveedores(ctx)]);
  return (
    <>
      <ListToolbar placeholder="Buscar plomero, cerrajero, mudanzas…" filters={cats.length ? [{ name: "categoria", label: "Categoría", options: cats.map((c) => ({ value: c, label: c })) }] : []} />
      {provs.length === 0 ? (
        <EmptyState titulo="Sin proveedores" descripcion="La administración aún no ha publicado proveedores para la comunidad." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {provs.map((p) => (
            <li key={p.id}>
              <Link href={`/directorio/proveedores/${p.id}`} className="block h-full rounded-2xl border bg-card p-4 hover:bg-muted/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.razonSocial}</p>
                    <p className="text-sm text-muted-foreground">{p.categoria}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                    <Star className="size-3.5 fill-current" /> {p.totalCalificaciones ? num(p.calificacionPromedio, 1) : "—"}
                  </span>
                </div>
                <div className="mt-1">
                  <Estrellas valor={p.calificacionPromedio} />
                  <span className="ml-1 text-xs text-muted-foreground">({p.totalCalificaciones})</span>
                </div>
                {p.tarifas && <p className="mt-2 line-clamp-2 text-sm">{p.tarifas}</p>}
                {p.beneficioComunidad && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-success/10 p-2 text-sm text-success">
                    <Gift className="mt-0.5 size-4 shrink-0" /> {p.beneficioComunidad}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
