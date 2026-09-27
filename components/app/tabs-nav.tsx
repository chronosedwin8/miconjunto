"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Pestañas como enlaces (desplazables horizontalmente en el teléfono). */
export function TabsNav({ tabs, exact }: { tabs: { href: string; label: string; count?: number }[]; exact?: boolean }) {
  const pathname = usePathname();
  const activeHref = [...tabs]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => (exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/")))?.href;
  return (
    <nav className="-mx-4 mb-4 overflow-x-auto border-b px-4 no-scrollbar lg:mx-0 lg:px-0" aria-label="Secciones">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const active = t.href === activeHref;
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
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
