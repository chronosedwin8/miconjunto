"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Hit = { tipo: string; titulo: string; subtitulo?: string; href: string };

export function GlobalSearch({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
        const j = (await r.json()) as { resultados: Hit[] };
        setHits(j.resultados ?? []);
        setActive(0);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, [q]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };

  return (
    <>
      {compact ? (
        <Button variant="ghost" size="icon" aria-label="Buscar" onClick={() => setOpen(true)}>
          <Search className="size-5" />
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Buscar unidad, persona, placa, ticket…</span>
          <kbd className="hidden rounded border bg-background px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-4 max-h-[85dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12%] sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Búsqueda global</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, hits.length - 1));
                if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Unidad, nombre, placa, documento, código…"
              aria-label="Texto a buscar"
              className="h-14 flex-1 bg-transparent text-base outline-none"
            />
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <ul className="max-h-[65dvh] overflow-y-auto p-2" role="listbox">
            {q.length >= 2 && !loading && hits.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Sin resultados para “{q}”.</li>}
            {q.length < 2 && <li className="p-6 text-center text-sm text-muted-foreground">Escribe al menos 2 caracteres.</li>}
            {hits.map((h, i) => (
              <li key={`${h.href}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => go(h)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${i === active ? "bg-muted" : ""}`}
                >
                  <span className="w-20 shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">{h.tipo}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.titulo}</span>
                    {h.subtitulo && <span className="block truncate text-xs text-muted-foreground">{h.subtitulo}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
