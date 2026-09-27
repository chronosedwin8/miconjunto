"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlarmClock, GripVertical, UserCheck } from "lucide-react";
import type { EstadoTicket, PrioridadTicket, TipoTicket } from "@prisma/client";
import { COLUMNAS_KANBAN, TRANSICIONES, puedeTransicionar } from "@/lib/tickets/reglas";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { useRealtime } from "@/components/realtime/use-realtime";
import { TipoIcono } from "./ui";
import { cambiarEstadoAction } from "./actions";

export type TarjetaTicket = {
  id: string;
  radicado: string;
  titulo: string;
  tipo: TipoTicket;
  prioridad: PrioridadTicket;
  estado: EstadoTicket;
  fechaLimite: string;
  unidad: string | null;
  zona: string | null;
  asignado: string | null;
  vencido: boolean;
  porVencer: boolean;
};

const columnaDe = (e: EstadoTicket) => COLUMNAS_KANBAN.find((c) => c.estados.includes(e))!.id;

/**
 * Tablero de la mesa de ayuda: Kanban con arrastrar y soltar en escritorio; en el teléfono,
 * lista por estado con pestañas. En ambos, cada tarjeta tiene "Mover a…" (sin arrastrar).
 */
export function TableroTickets({ tickets, puedeMover }: { tickets: TarjetaTicket[]; puedeMover: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(tickets);
  const [pending, start] = useTransition();
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [destino, setDestino] = useState<EstadoTicket | null>(null);
  const [tab, setTab] = useState<EstadoTicket>(() => {
    const primera = COLUMNAS_KANBAN.find((c) => tickets.some((t) => c.estados.includes(t.estado)));
    return primera?.id ?? "ABIERTO";
  });
  useEffect(() => setItems(tickets), [tickets]);
  useRealtime(["tickets"], () => router.refresh(), { onPoll: () => router.refresh(), pollMs: 30000 });

  const porColumna = useMemo(() => {
    const m = new Map<EstadoTicket, TarjetaTicket[]>(COLUMNAS_KANBAN.map((c) => [c.id, []]));
    for (const t of items) m.get(columnaDe(t.estado))!.push(t);
    return m;
  }, [items]);

  const mover = (t: TarjetaTicket, a: EstadoTicket) => {
    if (t.estado === a) return;
    if (!puedeTransicionar(t.estado, a)) {
      toast.error(`No se puede pasar de "${label(t.estado)}" a "${label(a)}".`);
      return;
    }
    if (a === "RESUELTO" || a === "CERRADO") {
      // Resolver o cerrar pide nota/evidencia: se hace desde el detalle.
      router.push(`/tickets/${t.id}?accion=${a === "RESUELTO" ? "resolver" : "cerrar"}`);
      return;
    }
    const antes = items;
    setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, estado: a } : x)));
    start(async () => {
      const r = await cambiarEstadoAction({ id: t.id, estado: a });
      if (r.ok) {
        toast.success(`${t.radicado}: ${label(a)}`);
        router.refresh();
      } else {
        setItems(antes);
        toast.error(r.error);
      }
    });
  };

  const tarjeta = (t: TarjetaTicket) => (
    <li
      key={t.id}
      draggable={puedeMover}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.id);
        e.dataTransfer.effectAllowed = "move";
        setArrastrando(t.id);
      }}
      onDragEnd={() => {
        setArrastrando(null);
        setDestino(null);
      }}
      className={cn(
        "rounded-xl border bg-card p-3 shadow-xs transition-opacity",
        arrastrando === t.id && "opacity-50",
        t.vencido && "border-destructive/50",
        t.prioridad === "URGENTE" && "border-l-4 border-l-destructive",
      )}
    >
      <div className="flex items-start gap-2">
        {puedeMover && <GripVertical className="mt-0.5 hidden size-4 shrink-0 cursor-grab text-muted-foreground md:block" aria-hidden />}
        <Link href={`/tickets/${t.id}`} className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TipoIcono tipo={t.tipo} className="size-3.5" />
            <span className="font-mono">{t.radicado}</span>
            {t.unidad && <span>· {t.unidad}</span>}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm font-medium">{t.titulo}</p>
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {t.estado === "REABIERTO" && <StatusBadge value="REABIERTO" />}
        {t.prioridad !== "MEDIA" && <StatusBadge value={t.prioridad} />}
        {t.vencido ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
            <AlarmClock className="size-3.5" /> SLA vencido
          </span>
        ) : t.porVencer ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
            <AlarmClock className="size-3.5" /> Vence hoy
          </span>
        ) : null}
        {t.asignado && (
          <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            <UserCheck className="size-3.5 shrink-0" /> {t.asignado}
          </span>
        )}
      </div>
      {puedeMover && TRANSICIONES[t.estado].length > 0 && (
        <select
          aria-label={`Mover ${t.radicado}`}
          value=""
          disabled={pending}
          onChange={(e) => e.target.value && mover(t, e.target.value as EstadoTicket)}
          className="mt-2 h-9 w-full rounded-lg border bg-background px-2 text-xs text-muted-foreground"
        >
          <option value="">Mover a…</option>
          {TRANSICIONES[t.estado]
            .filter((e) => e !== "REABIERTO")
            .map((e) => (
              <option key={e} value={e}>
                {label(e)}
              </option>
            ))}
        </select>
      )}
    </li>
  );

  return (
    <>
      {/* Teléfono: pestañas por estado */}
      <div className="md:hidden">
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" role="tablist" aria-label="Estados">
          {COLUMNAS_KANBAN.map((c) => {
            const n = porColumna.get(c.id)!.length;
            return (
              <button
                key={c.id}
                role="tab"
                aria-selected={tab === c.id}
                onClick={() => setTab(c.id)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm",
                  tab === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground",
                )}
              >
                {c.titulo}
                <span className={cn("rounded-full px-1.5 text-[11px]", tab === c.id ? "bg-primary-foreground/20" : "bg-muted")}>{n}</span>
              </button>
            );
          })}
        </div>
        <ul className="space-y-2">{porColumna.get(tab)!.map(tarjeta)}</ul>
        {porColumna.get(tab)!.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay tickets en este estado.</p>}
      </div>

      {/* Escritorio: Kanban */}
      <div className="hidden gap-3 overflow-x-auto pb-3 md:flex">
        {COLUMNAS_KANBAN.map((c) => {
          const lista = porColumna.get(c.id)!;
          const t = arrastrando ? items.find((x) => x.id === arrastrando) : null;
          const valido = !!t && t.estado !== c.id && puedeTransicionar(t.estado, c.id);
          return (
            <section
              key={c.id}
              aria-label={c.titulo}
              onDragOver={(e) => {
                if (!valido) return;
                e.preventDefault();
                setDestino(c.id);
              }}
              onDragLeave={() => setDestino((d) => (d === c.id ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                const tk = items.find((x) => x.id === id);
                setDestino(null);
                if (tk) mover(tk, c.id);
              }}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-2xl bg-muted/50 p-2 lg:w-72",
                arrastrando && !valido && "opacity-60",
                destino === c.id && "ring-2 ring-primary",
              )}
            >
              <h3 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                {c.titulo}
                <span className="rounded-full bg-background px-2 text-xs font-normal text-muted-foreground">{lista.length}</span>
              </h3>
              <ul className="min-h-24 space-y-2">{lista.map(tarjeta)}</ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
