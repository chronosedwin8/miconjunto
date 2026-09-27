"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileText, Search, X } from "lucide-react";

type Filter = { name: string; label: string; options: { value: string; label: string }[] };

/** Barra de búsqueda + filtros + exportación que sincroniza con la URL (?q=&estado=…). */
export function ListToolbar({
  placeholder = "Buscar…",
  filters = [],
  exportRecurso,
  pdf = true,
  children,
}: {
  placeholder?: string;
  filters?: Filter[];
  /** Nombre del recurso en /api/export/[recurso]. */
  exportRecurso?: string;
  pdf?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if ((sp.get("q") ?? "") === q) return;
    timer.current = setTimeout(() => update("q", q), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const exportHref = (formato: string) => {
    const p = new URLSearchParams(sp.toString());
    p.set("formato", formato);
    return `/api/export/${exportRecurso}?${p.toString()}`;
  };

  return (
    <div className="mb-4 space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label="Buscar en la lista"
            className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5" aria-label="Limpiar búsqueda">
              <X className="size-4" />
            </button>
          )}
        </div>
        {exportRecurso && (
          <>
            <a href={exportHref("xlsx")} className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted" title="Exportar a Excel">
              <Download className="size-4" />
              <span className="hidden sm:inline">Excel</span>
            </a>
            {pdf && (
              <a href={exportHref("pdf")} className="inline-flex h-11 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted" title="Exportar a PDF">
                <FileText className="size-4" />
                <span className="hidden sm:inline">PDF</span>
              </a>
            )}
          </>
        )}
      </div>
      {(filters.length > 0 || children) && (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {filters.map((f) => (
            <select
              key={f.name}
              aria-label={f.label}
              value={sp.get(f.name) ?? ""}
              onChange={(e) => update(f.name, e.target.value)}
              className="h-9 shrink-0 rounded-full border bg-background px-3 text-sm"
            >
              <option value="">{f.label}: todos</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {children}
        </div>
      )}
    </div>
  );
}
