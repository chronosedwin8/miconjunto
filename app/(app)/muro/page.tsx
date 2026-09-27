import Link from "next/link";
import { Plus, ShieldCheck, Store } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spFlat, spGet, type SP } from "@/lib/pagination";
import { CATEGORIAS_MURO, feedMuro } from "@/lib/muro/service";
import { PageHeader } from "@/components/app/page-header";
import { ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState } from "@/components/app/empty-state";
import { Pager } from "@/components/app/data-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TarjetaMuro } from "./_components/tarjeta";

export const metadata = { title: "Muro" };

const PLURAL: Record<string, string> = { AVISO: "Avisos", NOTICIA: "Noticias", EVENTO: "Eventos", EMERGENCIA: "Emergencias", CLASIFICADO: "Clasificados", PERDIDO_ENCONTRADO: "Perdidos" };

export default async function MuroPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("comunicaciones.ver");
  const sp = await searchParams;
  const categoria = spGet(sp, "categoria") ?? null;
  const page = Math.max(1, Number(spGet(sp, "page") ?? 1) || 1);
  const feed = await feedMuro(ctx, { categoria, q: spGet(sp, "q"), page, pageSize: 12 });
  const pendientes = can(ctx, ["clasificados.moderar", "comunicaciones.moderar"]) ? await ctx.db.publicacion.count({ where: { estado: "PENDIENTE_MODERACION" } }) : 0;
  const chip = (value: string | null, text: string) => {
    const href = value ? `/muro?categoria=${value}` : "/muro";
    const on = (categoria ?? null) === value;
    return (
      <Link key={text} href={href} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
        {text}
      </Link>
    );
  };
  return (
    <>
      <PageHeader
        titulo="Muro"
        descripcion={`Avisos, noticias y comunidad de ${ctx.conjunto.nombre}`}
        acciones={
          <>
            {pendientes > 0 && (
              <Button variant="outline" render={<Link href="/clasificados/moderacion" />}>
                <ShieldCheck /> Por moderar ({pendientes})
              </Button>
            )}
            {can(ctx, "comunicaciones.publicar") && (
              <Button render={<Link href="/muro/nueva" />}>
                <Plus /> Publicar
              </Button>
            )}
          </>
        }
      />
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0" aria-label="Filtrar por categoría">
        {chip(null, "Todo")}
        {CATEGORIAS_MURO.map((c) => chip(c, PLURAL[c]))}
      </div>
      <ListToolbar placeholder="Buscar en el muro…" />
      {(categoria === "CLASIFICADO" || categoria === "PERDIDO_ENCONTRADO") && can(ctx, "clasificados.ver") && (
        <Link href={categoria === "CLASIFICADO" ? "/clasificados" : "/clasificados/perdidos"} className="mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary">
          <Store className="size-4" /> {categoria === "CLASIFICADO" ? "Ir al marketplace vecinal" : "Ver objetos perdidos y encontrados"}
        </Link>
      )}
      {feed.items.length === 0 ? (
        <EmptyState titulo="No hay publicaciones" descripcion={categoria ? "No hay publicaciones en esta categoría." : "Cuando la administración publique avisos, aparecerán aquí."} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {feed.items.map((p) => (
            <li key={p.id}>
              <TarjetaMuro p={p} />
            </li>
          ))}
        </ul>
      )}
      <Pager page={feed.page} pageSize={feed.pageSize} total={feed.total} searchParams={spFlat(sp)} basePath="/muro" />
    </>
  );
}
