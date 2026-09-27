import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { label } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";
import { listarClasificados, SUBCATEGORIAS_CLASIFICADO } from "@/lib/clasificados/service";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ListToolbar } from "@/components/app/list-toolbar";
import { cn } from "@/lib/utils";
import { TarjetaMuro } from "@/app/(app)/muro/_components/tarjeta";
import { CamposClasificado } from "./_components/campos";
import { guardarClasificadoAction } from "./actions";

export const metadata = { title: "Clasificados" };

export default async function ClasificadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["clasificados.ver", "clasificados.moderar"]);
  const sp = await searchParams;
  const sub = spGet(sp, "sub");
  const mis = spGet(sp, "mis") === "1";
  const items = await listarClasificados(ctx, { subcategoria: sub, q: spGet(sp, "q"), mis });
  const chip = (value: string | null, text: string, extra?: string) => {
    const params = new URLSearchParams();
    if (value) params.set("sub", value);
    if (extra) params.set("mis", "1");
    const on = extra ? mis : !mis && (sub ?? null) === value;
    return (
      <Link key={text} href={`/clasificados${params.size ? `?${params}` : ""}`} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
        {text}
      </Link>
    );
  };
  return (
    <>
      {can(ctx, "clasificados.publicar") && (
        <div className="mb-3">
          <FormDialog titulo="Publicar clasificado" descripcion="Vende, ofrece un servicio o busca ayuda entre vecinos." action={guardarClasificadoAction} triggerLabel="Publicar clasificado" successMessage="Enviado a revisión" redirectTo="/muro/{id}">
            <CamposClasificado />
          </FormDialog>
        </div>
      )}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0">
        {chip(null, "Todos")}
        {SUBCATEGORIAS_CLASIFICADO.filter((s) => s !== "OTRO").map((s) => chip(s, label(s)))}
        {can(ctx, "clasificados.publicar") && chip(null, "Mis publicaciones", "mis")}
      </div>
      <ListToolbar placeholder="Buscar clasificados…" />
      {items.length === 0 ? (
        <EmptyState titulo={mis ? "Aún no has publicado" : "No hay clasificados"} descripcion="Publica lo que vendes o los servicios que ofreces a tus vecinos." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <li key={p.id}>
              <TarjetaMuro p={p} mostrarEstado={mis} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
