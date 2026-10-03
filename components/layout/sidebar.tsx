"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavGroup } from "@/lib/nav";
import { NavIcon } from "./icons";
import { LogoutButton } from "./logout-button";

export function Sidebar({ groups, conjuntoNombre, logoUrl }: { groups: NavGroup[]; conjuntoNombre: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] lg:flex",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-3">
        {logoUrl ? (
           
          <img src={logoUrl} alt="" className="size-8 rounded-md object-cover" />
        ) : (
          <div className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            {conjuntoNombre.slice(0, 1)}
          </div>
        )}
        {!collapsed && <span className="truncate text-sm font-semibold">{conjuntoNombre}</span>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent"
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 no-scrollbar" aria-label="Menú lateral">
        {groups.map((g) => (
          <div key={g.titulo} className="mb-3">
            {!collapsed && <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.titulo}</p>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      title={collapsed ? it.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                        active ? "bg-primary/10 font-semibold text-primary" : "hover:bg-sidebar-accent",
                      )}
                    >
                      <NavIcon name={it.icon} className="size-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-2">
        <LogoutButton compacto={collapsed} />
      </div>
    </aside>
  );
}
