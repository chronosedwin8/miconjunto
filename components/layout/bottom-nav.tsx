"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BottomItem } from "@/lib/nav";
import { NavIcon } from "./icons";

export function BottomNav({ items }: { items: BottomItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden safe-bottom"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => {
          const active = pathname === it.href || (it.href !== "/inicio" && pathname.startsWith(it.href + "/")) || pathname === it.href;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <NavIcon name={it.icon} className={cn("size-6", active && "stroke-[2.4]")} />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
