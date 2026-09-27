import Link from "next/link";
import { requireCtx } from "@/lib/auth/context";
import { visibleNav } from "@/lib/nav";
import { iaDisponible } from "@/lib/ia/disponible";
import { NavIcon } from "@/components/layout/icons";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Más" };

export default async function MasPage() {
  const ctx = await requireCtx();
  const groups = visibleNav(ctx, iaDisponible(ctx));
  return (
    <>
      <PageHeader titulo="Todos los módulos" />
      {groups.map((g) => (
        <section key={g.titulo} className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {g.items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} className="flex h-full min-h-24 flex-col items-center justify-center gap-2 rounded-xl border bg-card p-2 text-center text-xs font-medium hover:bg-muted">
                  <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
                    <NavIcon name={it.icon} className="size-5" />
                  </span>
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mi cuenta</h2>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/perfil" className="rounded-xl border bg-card p-4 text-sm font-medium hover:bg-muted">Mi perfil y privacidad</Link>
          <Link href="/notificaciones" className="rounded-xl border bg-card p-4 text-sm font-medium hover:bg-muted">Notificaciones</Link>
        </div>
      </section>
    </>
  );
}
