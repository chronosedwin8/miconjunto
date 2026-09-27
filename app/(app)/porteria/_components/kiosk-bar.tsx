"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { AlertTriangle, Building2, Car, CloudOff, KeyRound, Loader2, Moon, Package, QrCode, RefreshCw, Search, Sun, User, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EVENTO_COLA, pendientes, sincronizar } from "@/lib/porteria/offline";
import { interpretarLectura } from "@/lib/porteria/codigos";
import { QrScannerDialog } from "./qr-scanner";

type Hit = { tipo: string; id: string; titulo: string; subtitulo?: string; href: string; alerta?: string; fotoUrl?: string | null };

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  UNIDAD: Building2,
  PERSONA: User,
  VEHICULO: Car,
  VISITANTE: UserX,
  AUTORIZACION: KeyRound,
  PAQUETE: Package,
};
const TIPO: Record<string, string> = { UNIDAD: "Unidad", PERSONA: "Residente o frecuente", VEHICULO: "Vehículo", VISITANTE: "Visitante", AUTORIZACION: "Autorización", PAQUETE: "Paquete" };

/** Barra fija del kiosco: buscador universal con resultados al instante, escáner QR, tema nocturno y estado offline. */
export function KioskBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const s = q.trim();
    if (s.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/porteria/buscar?q=${encodeURIComponent(s)}`);
        const j = (await r.json()) as { resultados?: Hit[] };
        setHits(j.resultados ?? []);
      } catch {
        setHits([]);
      } finally {
        setLoading(false);
      }
    }, 150);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lectura = interpretarLectura(q);
    if (lectura?.codigo) return go(`/porteria/ingreso?codigo=${lectura.codigo}`);
    if (lectura?.token) return go(`/porteria/ingreso?token=${lectura.token}`);
    if (hits[0]) go(hits[0].href);
  };

  const onScan = (texto: string) => {
    setScan(false);
    const l = interpretarLectura(texto);
    if (!l) {
      toast.error("El código leído no es una autorización de MiConjunto.");
      return;
    }
    router.push(l.token ? `/porteria/ingreso?token=${l.token}` : `/porteria/ingreso?codigo=${l.codigo}`);
  };

  return (
    <div className="sticky top-14 z-20 -mx-4 mb-4 border-b-2 border-foreground/10 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:-mx-8 lg:px-8">
      <div className="flex items-center gap-2">
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <form onSubmit={onSubmit} role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-6 -translate-y-1/2 text-foreground/70" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Unidad, placa, código…"
              aria-label="Buscar en portería"
              className="h-14 w-full rounded-xl border-2 border-foreground/25 bg-background pl-12 pr-11 text-lg font-medium outline-none placeholder:text-foreground/55 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/25"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Limpiar búsqueda" className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center">
                {loading ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
              </button>
            )}
          </form>
          {open && q.trim().length >= 2 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-[70dvh] overflow-y-auto rounded-xl border-2 bg-popover p-1 shadow-xl">
              {!loading && hits.length === 0 && <p className="p-4 text-center text-base text-muted-foreground">Sin resultados para “{q}”.</p>}
              <ul>
                {hits.map((h) => {
                  const Icon = ICON[h.tipo] ?? Search;
                  return (
                    <li key={`${h.tipo}-${h.id}`}>
                      <button
                        type="button"
                        onClick={() => go(h.href)}
                        className={cn("flex min-h-16 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted", h.alerta?.startsWith("⛔") && "bg-destructive/10")}
                      >
                        {h.fotoUrl ? (
                          <img src={h.fotoUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted">
                            <Icon className="size-5" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold">{h.titulo}</span>
                          <span className="block truncate text-sm text-muted-foreground">
                            {TIPO[h.tipo]} {h.subtitulo ? `· ${h.subtitulo}` : ""}
                          </span>
                          {h.alerta && (
                            <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-destructive">
                              <AlertTriangle className="size-4" /> {h.alerta}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setScan(true)}
          className="flex h-14 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground shadow-sm active:translate-y-px"
          aria-label="Escanear código QR"
        >
          <QrCode className="size-7" />
          <span className="hidden sm:inline">Escanear QR</span>
        </button>
        <ThemeToggle />
      </div>
      <OfflineIndicator />
      <QrScannerDialog open={scan} onOpenChange={setScan} onResult={onScan} />
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="grid size-14 shrink-0 place-items-center rounded-xl border-2 border-foreground/25"
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema nocturno"}
      title={dark ? "Tema claro" : "Tema nocturno"}
    >
      {dark ? <Sun className="size-6" /> : <Moon className="size-6" />}
    </button>
  );
}

/** Indicador de conexión y cola offline; sincroniza automáticamente al volver la conexión. */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [n, setN] = useState(0);
  const [sync, setSync] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const contar = async () => setN((await pendientes()).length);
    const correr = async () => {
      if (!navigator.onLine) return;
      if (!(await pendientes()).length) return;
      setSync(true);
      const r = await sincronizar();
      setSync(false);
      await contar();
      if (r.ok) {
        toast.success(`${r.ok} registro(s) sincronizados con el servidor.`);
        router.refresh();
      }
      for (const f of r.fallidas) toast.error(`No se pudo registrar: ${f.descripcion}`, { description: f.error, duration: 15000 });
    };
    const on = () => {
      setOnline(true);
      void correr();
    };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    void contar().then(correr);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(EVENTO_COLA, contar);
    const t = setInterval(correr, 30000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(EVENTO_COLA, contar);
      clearInterval(t);
    };
  }, [router]);

  if (online && n === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-base font-bold", online ? "bg-amber-100 text-amber-950 dark:bg-amber-400/20 dark:text-amber-100" : "bg-red-700 text-white")}
    >
      {online ? <RefreshCw className={cn("size-5", sync && "animate-spin")} /> : <CloudOff className="size-5" />}
      <span className="flex-1">
        {online ? "Conectado" : "Sin conexión"} · {n} pendiente{n === 1 ? "" : "s"} por sincronizar
      </span>
      {online && n > 0 && !sync && (
        <button type="button" className="rounded-md bg-amber-950 px-3 py-1 text-sm text-amber-50 dark:bg-amber-100 dark:text-amber-950" onClick={() => window.dispatchEvent(new Event("online"))}>
          Sincronizar
        </button>
      )}
    </div>
  );
}
