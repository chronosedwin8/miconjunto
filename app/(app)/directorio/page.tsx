import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, MessageCircle, Phone, UserRoundCog, Wrench } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { waShareLink } from "@/lib/whatsapp";
import { directorioResidentes, miPersona } from "@/lib/directorio/service";
import { ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "Directorio de vecinos" };

export default async function DirectorioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "directorio.ver")) redirect("/directorio/proveedores");
  const sp = await searchParams;
  const servicios = spGet(sp, "servicios") === "1";
  const [fichas, yo] = await Promise.all([directorioResidentes(ctx, { q: spGet(sp, "q"), soloServicios: servicios }), miPersona(ctx)]);
  return (
    <>
      {yo && !yo.directorioOptIn && (
        <Link href="/directorio/mi-ficha" className="mb-3 flex min-h-12 items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 text-sm">
          <UserRoundCog className="size-5 text-primary" />
          <span>
            <b>¿Quieres aparecer en el directorio?</b> Tú eliges qué datos compartir.
          </span>
        </Link>
      )}
      <div className="mb-3 flex gap-2">
        {[
          { on: !servicios, href: "/directorio", text: "Todos" },
          { on: servicios, href: "/directorio?servicios=1", text: "Ofrecen servicios" },
        ].map((c) => (
          <Link key={c.text} href={c.href} aria-current={c.on ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3 text-sm", c.on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {c.text}
          </Link>
        ))}
      </div>
      <ListToolbar placeholder="Buscar por nombre, unidad o servicio…" />
      {fichas.length === 0 ? (
        <EmptyState titulo="Nadie coincide" descripcion="Solo aparecen los vecinos que activaron su ficha en el directorio." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {fichas.map((f) => (
            <li key={f.personaId} className="rounded-xl border bg-card p-3">
              <p className="font-medium">{f.nombre ?? "Vecino"}</p>
              {f.unidades.length > 0 && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Home className="size-3.5" /> {f.unidades.join(", ")}
                </p>
              )}
              {f.servicios && (
                <p className="mt-1 flex items-start gap-1 text-sm">
                  <Wrench className="mt-0.5 size-3.5 shrink-0 text-primary" /> {f.servicios}
                </p>
              )}
              {(f.telefono || f.whatsapp) && (
                <div className="mt-2 flex gap-2">
                  {f.telefono && (
                    <a href={`tel:${f.telefono}`} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm hover:bg-muted">
                      <Phone className="size-4" /> Llamar
                    </a>
                  )}
                  {f.whatsapp && (
                    <a href={waShareLink(`Hola, te escribo desde el directorio de ${ctx.conjunto.nombre}.`, f.whatsapp)} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm hover:bg-muted">
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
