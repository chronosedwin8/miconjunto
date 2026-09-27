import Link from "next/link";
import { cn } from "@/lib/utils";

/** Pestañas de filtro por parámetro de URL (?estado=…); `activo` es el valor actual. */
export function FiltroTabs({ tabs, activo }: { tabs: { href: string; label: string; value: string; count?: number }[]; activo: string }) {
  return (
    <nav className="-mx-4 mb-4 overflow-x-auto border-b px-4 no-scrollbar lg:mx-0 lg:px-0" aria-label="Filtro">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const on = t.value === activo;
          return (
            <li key={t.value} className="shrink-0">
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn("inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium", on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {t.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-[11px]">{t.count}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
