import Link from "next/link";
import { HandHelping, SearchX } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { label } from "@/lib/labels";
import { zonaOptions } from "@/lib/conjunto/options";
import { CATEGORIAS_OBJETO, categoriaLabel } from "@/lib/objetos-perdidos/reglas";
import { VISTAS, conteosObjetos, esGestorObjetos, listarObjetos, resumenObjetosGestion, type Vista } from "@/lib/objetos-perdidos/service";
import { PageHeader } from "@/components/app/page-header";
import { ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CategoriaIcono, TarjetaObjeto } from "./_components/ui";

export const metadata = { title: "Objetos perdidos" };

const VISTA_LABEL: Record<Vista, string> = {
  abiertos: "Todos",
  perdidos: "Perdidos",
  encontrados: "Encontrados",
  custodia: "En custodia",
  mis: "Mis reportes",
  historial: "Historial",
  atender: "Por atender",
};

const VACIO: Record<Vista, { titulo: string; descripcion: string }> = {
  abiertos: { titulo: "No hay reportes abiertos", descripcion: "Si perdiste o encontraste algo, repórtalo para que los vecinos y portería te ayuden." },
  perdidos: { titulo: "Nadie ha reportado pérdidas", descripcion: "Cuando un vecino pierda algo aparecerá aquí." },
  encontrados: { titulo: "No hay objetos encontrados", descripcion: "Los objetos que se encuentren en el conjunto aparecerán aquí." },
  custodia: { titulo: "Nada en custodia", descripcion: "Portería y administración no tienen objetos guardados en este momento." },
  mis: { titulo: "Aún no tienes reportes", descripcion: "Tus reportes y reclamos aparecerán aquí." },
  historial: { titulo: "Sin historial", descripcion: "Aquí verás los objetos devueltos, donados o cerrados." },
  atender: { titulo: "Todo al día", descripcion: "No hay reclamos por revisar ni objetos pendientes de recibir o disponer." },
};

export default async function ObjetosPerdidosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("objetos.ver");
  const sp = await searchParams;
  const gestor = esGestorObjetos(ctx);
  const vistaRaw = spGet(sp, "vista");
  const vista: Vista = (VISTAS as readonly string[]).includes(vistaRaw ?? "") && (vistaRaw !== "atender" || gestor) ? (vistaRaw as Vista) : "abiertos";
  const categoria = spGet(sp, "categoria");
  const dias = Number(spGet(sp, "dias")) || null;
  const [{ items, total }, conteos, zonas, resumen] = await Promise.all([
    listarObjetos(ctx, { vista, q: spGet(sp, "q"), categoria, estado: spGet(sp, "estado"), zonaId: spGet(sp, "zonaId"), dias }),
    conteosObjetos(ctx),
    zonaOptions(ctx),
    gestor ? resumenObjetosGestion(ctx) : Promise.resolve(null),
  ]);
  const reportar = can(ctx, ["objetos.reportar", "objetos.gestionar"]);

  const href = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) p.set(k, v);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return `/objetos-perdidos${s ? `?${s}` : ""}`;
  };
  const vistas: Vista[] = gestor ? ["abiertos", "atender", "perdidos", "encontrados", "custodia", "mis", "historial"] : ["abiertos", "perdidos", "encontrados", "custodia", "mis", "historial"];
  const conteo: Partial<Record<Vista, number>> = { abiertos: conteos.abiertos, custodia: conteos.custodia, atender: conteos.atender };

  return (
    <>
      <PageHeader titulo="Objetos perdidos" descripcion="Reporta y busca artículos extraviados en el conjunto" />

      {resumen && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 text-sm no-scrollbar lg:mx-0 lg:px-0">
          <span className="shrink-0 rounded-full border bg-card px-3 py-1">En custodia: <b>{resumen.enCustodia}</b></span>
          <span className="shrink-0 rounded-full border bg-card px-3 py-1">Devueltos (30 días): <b>{resumen.devueltosMes}</b></span>
          <span className="shrink-0 rounded-full border bg-card px-3 py-1">Reportes (30 días): <b>{resumen.reportadosMes}</b></span>
        </div>
      )}

      {reportar && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button size="lg" className="h-12" render={<Link href="/objetos-perdidos/nuevo?tipo=PERDIDO" />}>
            <SearchX /> Perdí algo
          </Button>
          <Button size="lg" variant="outline" className="h-12" render={<Link href="/objetos-perdidos/nuevo?tipo=ENCONTRADO" />}>
            <HandHelping /> Encontré algo
          </Button>
        </div>
      )}

      <nav className="-mx-4 mb-3 overflow-x-auto border-b px-4 no-scrollbar lg:mx-0 lg:px-0" aria-label="Vistas">
        <ul className="flex gap-1">
          {vistas.map((v) => (
            <li key={v} className="shrink-0">
              <Link
                href={href({ vista: v === "abiertos" ? null : v, estado: null })}
                aria-current={v === vista ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium",
                  v === vista ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {VISTA_LABEL[v]}
                {conteo[v] !== undefined && conteo[v]! > 0 && <span className={cn("rounded-full px-1.5 text-[11px]", v === "atender" ? "bg-warning/20 text-warning" : "bg-muted")}>{conteo[v]}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0" aria-label="Categorías">
        <Link
          href={href({ categoria: null })}
          aria-current={!categoria ? "page" : undefined}
          className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", !categoria ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
        >
          Todas
        </Link>
        {CATEGORIAS_OBJETO.map((c) => (
          <Link
              key={c}
            href={href({ categoria: c === categoria ? null : c })}
            aria-current={c === categoria ? "page" : undefined}
            className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm", c === categoria ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
          >
            <CategoriaIcono categoria={c} className="size-4" />
            {categoriaLabel(c)}
          </Link>
        ))}
      </nav>

      <ListToolbar
        placeholder="Buscar: llaves, cédula, AirPods, color…"
        exportRecurso={gestor ? "objetos-perdidos" : undefined}
        pdf={false}
        filters={[
          { name: "dias", label: "Fecha", options: [{ value: "7", label: "Últimos 7 días" }, { value: "30", label: "Últimos 30 días" }, { value: "90", label: "Últimos 3 meses" }] },
          ...(zonas.length ? [{ name: "zonaId", label: "Zona", options: zonas }] : []),
          ...(vista === "historial" ? [{ name: "estado", label: "Estado", options: (["DEVUELTO", "DONADO", "CERRADO"] as const).map((e) => ({ value: e, label: label(e) })) }] : []),
        ]}
      />

      {items.length === 0 ? (
        <EmptyState
          titulo={VACIO[vista].titulo}
          descripcion={VACIO[vista].descripcion}
          accion={
            reportar && (vista === "abiertos" || vista === "mis") ? (
              <Button render={<Link href="/objetos-perdidos/nuevo" />}>Hacer un reporte</Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((o) => (
              <TarjetaObjeto key={o.id} o={o} />
            ))}
          </ul>
          {total > items.length && <p className="mt-4 text-center text-sm text-muted-foreground">Mostrando {items.length} de {total}. Usa la búsqueda o los filtros para encontrar más.</p>}
        </>
      )}
    </>
  );
}
