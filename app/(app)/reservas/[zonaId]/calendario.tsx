"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, Lock, Minus, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { cop } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DIAS_CORTOS,
  DIAS_LARGOS,
  describirRegla,
  diaSemana,
  formatoDuracion,
  franjasDelDia,
  hhmm,
  horarioDia,
  minutosDe,
  minutosLocal,
  pasoFranjas,
  resumenDia,
  sumarDias,
  type DiaDisponibilidad,
  type EstadoFranja,
} from "@/lib/reservas/reglas";
import type { ZonaInfo } from "@/lib/reservas/service";
import { crearReservaAction } from "../actions";

type Disp = { zona: ZonaInfo; desde: string; hasta: string; dias: DiaDisponibilidad[]; ahora: string };
type Vista = "dia" | "semana" | "mes";
type Franja = ReturnType<typeof franjasDelDia>[number];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaTexto(f: string, conDia = true) {
  const [y, m, d] = f.split("-").map(Number);
  return `${conDia ? `${DIAS_LARGOS[diaSemana(f)]} ` : ""}${d} de ${MESES[m - 1]}${y !== new Date().getFullYear() ? ` de ${y}` : ""}`;
}
const lunesDe = (f: string) => sumarDias(f, -((diaSemana(f) + 6) % 7));
const primeroMes = (f: string) => `${f.slice(0, 7)}-01`;
function ultimoMes(f: string) {
  const [y, m] = f.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
function rango(desde: string, hasta: string) {
  const out: string[] = [];
  for (let f = desde; f <= hasta && out.length < 62; f = sumarDias(f, 1)) out.push(f);
  return out;
}

const ESTILO: Record<EstadoFranja, string> = {
  LIBRE: "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 active:bg-primary/15",
  OCUPADA: "border-transparent bg-muted text-muted-foreground",
  PROPIA: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  BLOQUEADA: "border-warning/30 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,color-mix(in_oklch,var(--warning)_12%,transparent)_6px,color-mix(in_oklch,var(--warning)_12%,transparent)_12px)] text-warning",
  PASADA: "border-transparent bg-muted/40 text-muted-foreground/70",
};
const TEXTO: Record<EstadoFranja, string> = { LIBRE: "Disponible", OCUPADA: "Ocupado", PROPIA: "Tu reserva", BLOQUEADA: "Bloqueado", PASADA: "No disponible" };

export function CalendarioZona({
  inicial,
  fechaInicial,
  hoy,
  unidades,
  puedeReservar,
  verTodo,
}: {
  inicial: Disp;
  fechaInicial: string;
  hoy: string;
  unidades: { value: string; label: string; group?: string }[];
  puedeReservar: boolean;
  verTodo: boolean;
}) {
  const zona = inicial.zona;
  const [vista, setVista] = useState<Vista>("dia");
  const [fecha, setFecha] = useState(fechaInicial);
  const [dias, setDias] = useState<Record<string, DiaDisponibilidad>>(() => Object.fromEntries(inicial.dias.map((d) => [d.fecha, d])));
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState<Franja | null>(null);
  const [ahora, setAhora] = useState(() => new Date(inicial.ahora));
  const [infoAbierta, setInfoAbierta] = useState(false);
  const limite = sumarDias(hoy, zona.anticipacionMaximaDias);

  // Rango visible según la vista
  const [desde, hasta] = useMemo(() => {
    if (vista === "mes") return [lunesDe(primeroMes(fecha)), sumarDias(lunesDe(ultimoMes(fecha)), 6)];
    if (vista === "semana") return [lunesDe(fecha), sumarDias(lunesDe(fecha), 6)];
    return [fecha, sumarDias(fecha, 6)];
  }, [vista, fecha]);

  const recargar = async (d: string, h: string) => {
    setCargando(true);
    try {
      const r = await fetch(`/api/v1/zonas/${zona.id}/disponibilidad?desde=${d}&hasta=${h}`, { cache: "no-store" });
      const j = (await r.json()) as { data?: Disp; error?: string };
      if (!r.ok || !j.data) throw new Error(j.error ?? "No se pudo cargar el calendario");
      setDias((prev) => ({ ...prev, ...Object.fromEntries(j.data!.dias.map((x) => [x.fecha, x])) }));
      setAhora(new Date(j.data.ahora));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    const faltan = rango(desde, hasta).filter((f) => !dias[f]);
    if (faltan.length) void recargar(faltan[0], faltan[faltan.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  const irA = (f: string, v: Vista = "dia") => {
    setFecha(f < hoy ? hoy : f);
    setVista(v);
  };

  const mover = (dir: 1 | -1) => {
    if (vista === "mes") {
      const [y, m] = fecha.split("-").map(Number);
      const nm = new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
      setFecha(dir < 0 && nm < primeroMes(hoy) ? hoy : nm < hoy ? hoy : nm);
    } else setFecha((f) => (sumarDias(f, dir * (vista === "semana" ? 7 : 1)) < hoy ? hoy : sumarDias(f, dir * (vista === "semana" ? 7 : 1))));
  };

  const tituloNav =
    vista === "mes" ? `${MESES[Number(fecha.slice(5, 7)) - 1]} ${fecha.slice(0, 4)}` : vista === "semana" ? `${fechaTexto(desde, false)} – ${fechaTexto(hasta, false)}` : fechaTexto(fecha);

  return (
    <div className="space-y-4">
      {/* Selector de vista */}
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Vista del calendario" className="grid flex-1 grid-cols-3 rounded-xl bg-muted p-1">
          {(["dia", "semana", "mes"] as Vista[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={cn("h-10 rounded-lg text-sm font-medium transition", vista === v ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        {cargando && <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Cargando" />}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => mover(-1)} disabled={(vista === "mes" ? primeroMes(fecha) : vista === "semana" ? desde : fecha) <= hoy}>
          <ChevronLeft />
        </Button>
        <p className="text-center text-base font-semibold first-letter:uppercase">{tituloNav}</p>
        <Button variant="outline" size="icon" aria-label="Siguiente" onClick={() => mover(1)} disabled={(vista === "mes" ? ultimoMes(fecha) : hasta) >= limite}>
          <ChevronRight />
        </Button>
      </div>

      {vista === "dia" && <TiraDias fecha={fecha} hoy={hoy} limite={limite} dias={dias} zona={zona} onSelect={(f) => setFecha(f)} />}

      {zona.estado !== "ACTIVA" && (
        <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Esta zona está {zona.estado === "MANTENIMIENTO" ? "en mantenimiento" : "inactiva"}; no admite reservas por ahora.</p>
      )}

      {vista === "dia" && (
        <VistaDia dia={dias[fecha]} zona={zona} ahora={ahora} verTodo={verTodo} puedeReservar={puedeReservar && zona.estado === "ACTIVA"} onElegir={setSel} />
      )}
      {vista === "semana" && <VistaSemana fechas={rango(desde, hasta)} dias={dias} zona={zona} ahora={ahora} hoy={hoy} onDia={(f) => irA(f)} />}
      {vista === "mes" && <VistaMes fecha={fecha} fechas={rango(desde, hasta)} dias={dias} zona={zona} ahora={ahora} hoy={hoy} limite={limite} onDia={(f) => irA(f)} />}

      <Leyenda />

      {/* Reglas y tarifa */}
      <section className="rounded-2xl border bg-card">
        <button className="flex w-full items-center justify-between gap-2 p-4 text-left" onClick={() => setInfoAbierta((x) => !x)} aria-expanded={infoAbierta}>
          <span className="flex items-center gap-2 font-semibold">
            <Info className="size-4 text-primary" /> Reglas y tarifa
          </span>
          <span className="flex items-center gap-2 text-sm">
            {zona.valores.total > 0 ? cop(zona.valores.total) : "Incluida en la cuota"}
            <ChevronDown className={cn("size-4 transition", infoAbierta && "rotate-180")} />
          </span>
        </button>
        {infoAbierta && <InfoZona zona={zona} />}
      </section>

      <ConfirmarReserva zona={zona} franja={sel} fecha={fecha} unidades={unidades} onClose={() => setSel(null)} onCreada={() => void recargar(desde, hasta)} />
    </div>
  );
}

function Leyenda() {
  const items: [string, string][] = [
    ["bg-primary/15 border-primary/40", "Disponible"],
    ["bg-muted", "Ocupado"],
    ["bg-blue-500/15 border-blue-500/30", "Tuya"],
    ["bg-warning/15 border-warning/30", "Bloqueado"],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Convenciones">
      {items.map(([c, t]) => (
        <li key={t} className="flex items-center gap-1.5">
          <span className={cn("inline-block size-3 rounded border", c)} /> {t}
        </li>
      ))}
    </ul>
  );
}

function TiraDias({ fecha, hoy, limite, dias, zona, onSelect }: { fecha: string; hoy: string; limite: string; dias: Record<string, DiaDisponibilidad>; zona: ZonaInfo; onSelect: (f: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fechas = rango(hoy, sumarDias(hoy, Math.min(zona.anticipacionMaximaDias, 45))).filter((f) => f <= limite);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [fecha]);
  return (
    <div ref={ref} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0" role="group" aria-label="Elegir día">
      {fechas.map((f) => {
        const cerrado = !horarioDia(zona.horario, diaSemana(f));
        const festivo = dias[f]?.festivo;
        const activo = f === fecha;
        return (
          <button
            key={f}
            aria-pressed={activo}
            onClick={() => onSelect(f)}
            className={cn(
              "flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-xl border text-xs transition",
              activo ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              cerrado && !activo && "opacity-45",
            )}
          >
            <span className={cn(!activo && "text-muted-foreground")}>{DIAS_CORTOS[diaSemana(f)]}</span>
            <span className="text-lg font-semibold leading-tight">{Number(f.slice(8))}</span>
            {festivo ? <span className={cn("size-1.5 rounded-full", activo ? "bg-primary-foreground" : "bg-warning")} title={festivo} /> : <span className="size-1.5" />}
          </button>
        );
      })}
    </div>
  );
}

type Grupo = { desde: string; hasta: string; estado: EstadoFranja; franja: Franja; motivo?: string; id?: string; unidad?: string };

function VistaDia({ dia, zona, ahora, verTodo, puedeReservar, onElegir }: { dia?: DiaDisponibilidad; zona: ZonaInfo; ahora: Date; verTodo: boolean; puedeReservar: boolean; onElegir: (f: Franja) => void }) {
  if (!dia) return <div className="h-48 animate-pulse rounded-2xl bg-muted" aria-label="Cargando día" />;
  const franjas = franjasDelDia(dia, zona, ahora);
  const paso = pasoFranjas(zona.duracionMinimaMin);
  const ocupadoEn = (iso: string) => {
    const t = new Date(iso).getTime();
    return dia.ocupados.find((o) => new Date(o.inicio).getTime() <= t && new Date(o.fin).getTime() > t);
  };
  const bloqueoEn = (iso: string) => {
    const t = new Date(iso).getTime();
    return dia.bloqueos.find((b) => new Date(b.inicio).getTime() <= t && new Date(b.fin).getTime() > t);
  };
  // Agrupa franjas consecutivas no disponibles para una lista corta y legible.
  const grupos: Grupo[] = [];
  for (const f of franjas) {
    const fin = hhmm(minutosDe(f.hora) + paso);
    const o = f.estado === "OCUPADA" || f.estado === "PROPIA" ? ocupadoEn(f.inicio) : undefined;
    const b = f.estado === "BLOQUEADA" ? bloqueoEn(f.inicio) : undefined;
    const prev = grupos[grupos.length - 1];
    if (prev && f.estado !== "LIBRE" && prev.estado === f.estado && prev.id === o?.id && prev.motivo === b?.motivo) prev.hasta = fin;
    else grupos.push({ desde: f.hora, hasta: fin, estado: f.estado, franja: f, motivo: b?.motivo, id: o?.id, unidad: o?.unidad });
  }
  return (
    <div className="space-y-2">
      {dia.festivo && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Festivo: {dia.festivo}</p>}
      {!dia.abre ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">La zona no abre este día. Elige otra fecha.</p>
      ) : franjas.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay franjas para este día.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Horario {dia.abre} a {dia.cierra} · turnos desde {formatoDuracion(zona.duracionMinimaMin)}
            {puedeReservar ? " · toca una hora disponible" : ""}
          </p>
          <ul className="space-y-1.5">
            {grupos.map((g) => {
              const clickable = g.estado === "LIBRE" && puedeReservar;
              const contenido = (
                <>
                  <span className="w-24 shrink-0 text-left font-semibold tabular-nums">
                    {g.estado === "LIBRE" ? g.desde : `${g.desde}–${g.hasta}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {TEXTO[g.estado]}
                    {g.estado === "BLOQUEADA" && g.motivo ? ` · ${g.motivo}` : ""}
                    {verTodo && g.unidad && g.estado === "OCUPADA" ? ` · ${g.unidad}` : ""}
                    {g.estado === "LIBRE" ? <span className="text-xs text-muted-foreground"> · hasta {formatoDuracion(Math.max(...g.franja.duracionesPosibles))}</span> : null}
                  </span>
                  {g.estado === "LIBRE" && puedeReservar ? <ChevronRight className="size-4" /> : g.estado === "BLOQUEADA" ? <Lock className="size-4" /> : null}
                </>
              );
              const cls = cn("flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 text-sm transition", ESTILO[g.estado]);
              return (
                <li key={`${g.desde}-${g.estado}`}>
                  {clickable ? (
                    <button className={cls} onClick={() => onElegir(g.franja)} aria-label={`Reservar desde las ${g.desde}`}>
                      {contenido}
                    </button>
                  ) : g.id && (g.estado === "PROPIA" || verTodo) ? (
                    <Link href={`/reservas/detalle/${g.id}`} className={cls}>
                      {contenido}
                      <ChevronRight className="size-4" />
                    </Link>
                  ) : (
                    <div className={cls}>{contenido}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function Barra({ dia, zona }: { dia: DiaDisponibilidad; zona: ZonaInfo }) {
  if (!dia.abre || !dia.cierra) return <div className="h-3 flex-1 rounded-full bg-muted/60" />;
  const abre = minutosDe(dia.abre);
  const cierra = dia.cierra === "24:00" || minutosDe(dia.cierra) <= abre ? 1440 : minutosDe(dia.cierra);
  const total = cierra - abre;
  const pos = (iso: string, esFin: boolean) => {
    const d = new Date(iso);
    const f = new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
    let m = minutosLocal(d);
    if (f < dia.fecha) m = abre;
    if (f > dia.fecha || (esFin && m === 0)) m = cierra;
    return Math.min(100, Math.max(0, ((m - abre) / total) * 100));
  };
  const seg = [
    ...dia.bloqueos.map((b) => ({ i: pos(b.inicio, false), f: pos(b.fin, true), c: "bg-warning/60" })),
    ...dia.ocupados.map((o) => ({ i: pos(o.inicio, false), f: pos(o.fin, true), c: o.propia ? "bg-blue-500" : "bg-muted-foreground/50" })),
  ];
  void zona;
  return (
    <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-primary/15" aria-hidden>
      {seg.map((s, i) => (
        <span key={i} className={cn("absolute inset-y-0", s.c)} style={{ left: `${s.i}%`, width: `${Math.max(1.5, s.f - s.i)}%` }} />
      ))}
    </div>
  );
}

function VistaSemana({ fechas, dias, zona, ahora, hoy, onDia }: { fechas: string[]; dias: Record<string, DiaDisponibilidad>; zona: ZonaInfo; ahora: Date; hoy: string; onDia: (f: string) => void }) {
  return (
    <ul className="space-y-1.5">
      {fechas.map((f) => {
        const d = dias[f];
        const pasado = f < hoy;
        const libres = d ? franjasDelDia(d, zona, ahora).filter((x) => x.estado === "LIBRE").length : 0;
        return (
          <li key={f}>
            <button disabled={pasado} onClick={() => onDia(f)} className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-3 text-left text-sm transition active:bg-muted", pasado && "opacity-50")}>
              <span className="w-12 shrink-0">
                <span className="block text-xs text-muted-foreground">{DIAS_CORTOS[diaSemana(f)]}</span>
                <span className="text-lg font-semibold leading-none">{Number(f.slice(8))}</span>
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                {d ? <Barra dia={d} zona={zona} /> : <span className="block h-3 animate-pulse rounded-full bg-muted" />}
                <span className="block text-xs text-muted-foreground">
                  {!d ? "…" : !d.abre ? "Cerrado" : d.festivo ? `Festivo · ${libres} horarios libres` : libres ? `${libres} horario${libres === 1 ? "" : "s"} libre${libres === 1 ? "" : "s"} · ${d.abre}–${d.cierra}` : "Sin disponibilidad"}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const COLOR_MES: Record<ReturnType<typeof resumenDia>, string> = {
  LIBRE: "bg-primary/15 text-primary border-primary/30",
  PARCIAL: "bg-amber-400/20 text-amber-800 dark:text-amber-200 border-amber-500/30",
  LLENO: "bg-muted text-muted-foreground",
  BLOQUEADO: "bg-warning/15 text-warning border-warning/30",
  CERRADO: "bg-transparent text-muted-foreground/60",
  PASADO: "bg-transparent text-muted-foreground/40",
};

function VistaMes({ fecha, fechas, dias, zona, ahora, hoy, limite, onDia }: { fecha: string; fechas: string[]; dias: Record<string, DiaDisponibilidad>; zona: ZonaInfo; ahora: Date; hoy: string; limite: string; onDia: (f: string) => void }) {
  const mes = fecha.slice(0, 7);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {fechas.map((f) => {
          const d = dias[f];
          const fuera = f.slice(0, 7) !== mes;
          const r = f < hoy ? "PASADO" : f > limite ? "CERRADO" : d ? resumenDia(d, zona, ahora) : null;
          const propia = d?.ocupados.some((o) => o.propia);
          return (
            <button
              key={f}
              disabled={f < hoy || f > limite}
              onClick={() => onDia(f)}
              aria-label={`${f}${r ? `: ${r.toLowerCase()}` : ""}`}
              className={cn("relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-lg border text-sm transition", r ? COLOR_MES[r] : "animate-pulse bg-muted/50", fuera && "opacity-40", f === hoy && "ring-2 ring-primary/50")}
            >
              <span className="font-medium">{Number(f.slice(8))}</span>
              <span className="flex gap-0.5">
                {propia && <span className="size-1.5 rounded-full bg-blue-500" />}
                {d?.festivo && <span className="size-1.5 rounded-full bg-warning" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Verde: libre · Ámbar: parcialmente ocupado · Gris: lleno o cerrado · Punto azul: tu reserva · Punto naranja: festivo</p>
    </div>
  );
}

function InfoZona({ zona }: { zona: ZonaInfo }) {
  const v = zona.valores;
  return (
    <div className="space-y-4 border-t p-4 text-sm">
      <Valores zona={zona} />
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-muted-foreground">Capacidad</dt>
          <dd>{zona.capacidad ? `${zona.capacidad} personas` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Duración</dt>
          <dd>
            {formatoDuracion(zona.duracionMinimaMin)} a {formatoDuracion(zona.duracionMaximaMin)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Anticipación</dt>
          <dd>
            {zona.anticipacionMinimaHoras} h a {zona.anticipacionMaximaDias} días
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Máximo por mes</dt>
          <dd>{zona.maxReservasMesUnidad} por unidad</dd>
        </div>
      </dl>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">Horario</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const h = horarioDia(zona.horario, d);
            return (
              <li key={d} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{DIAS_CORTOS[d]}</span>
                <span className="tabular-nums">{h ? `${hhmm(h.abre)}–${h.cierra === 1440 ? "24:00" : hhmm(h.cierra)}` : "Cerrado"}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {(zona.reglas.length > 0 || zona.requiereAprobacion || zona.bloqueoPorMora) && (
        <ul className="list-disc space-y-1 pl-5">
          {zona.requiereAprobacion && <li>La administración debe aprobar la reserva.</li>}
          {zona.bloqueoPorMora && v.total > 0 && <li>Se requiere estar al día con la administración.</li>}
          {zona.reglas.map((r) => (
            <li key={r.tipo}>{describirRegla(r)}</li>
          ))}
        </ul>
      )}
      {zona.reglasUso && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Reglas de uso</p>
          <p className="whitespace-pre-line">{zona.reglasUso}</p>
        </div>
      )}
      {zona.politicaCancelacion && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Cancelación</p>
          <p>{zona.politicaCancelacion}</p>
        </div>
      )}
    </div>
  );
}

function Valores({ zona }: { zona: ZonaInfo }) {
  const v = zona.valores;
  if (v.totalAPagar === 0) return <p className="rounded-lg bg-success/10 p-3 text-success">Sin costo: el uso está incluido en la cuota de administración.</p>;
  return (
    <dl className="space-y-1 rounded-xl bg-muted/50 p-3 tabular-nums">
      <div className="flex justify-between">
        <dt>Alquiler (base)</dt>
        <dd>{cop(v.base)}</dd>
      </div>
      {v.iva > 0 && (
        <div className="flex justify-between">
          <dt>IVA {zona.tarifaIva} %</dt>
          <dd>{cop(v.iva)}</dd>
        </div>
      )}
      <div className="flex justify-between font-medium">
        <dt>Total alquiler</dt>
        <dd>{cop(v.total)}</dd>
      </div>
      {v.deposito > 0 && (
        <div className="flex justify-between text-muted-foreground">
          <dt>Depósito (reembolsable)</dt>
          <dd>{cop(v.deposito)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t pt-1 text-base font-semibold">
        <dt>Total a pagar</dt>
        <dd>{cop(v.totalAPagar)}</dd>
      </div>
      {zona.generaFactura && v.base > 0 && <p className="pt-1 text-xs text-muted-foreground">Recibirás factura electrónica del alquiler por correo.</p>}
    </dl>
  );
}

function ConfirmarReserva({ zona, franja, fecha, unidades, onClose, onCreada }: { zona: ZonaInfo; franja: Franja | null; fecha: string; unidades: { value: string; label: string; group?: string }[]; onClose: () => void; onCreada: () => void }) {
  const [duracion, setDuracion] = useState<number>(0);
  const [unidadId, setUnidadId] = useState(unidades[0]?.value ?? "");
  const [asistentes, setAsistentes] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ id: string; estado: string; enlacePago: string | null; totalAPagar: number } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (franja) {
      setDuracion(franja.duracionesPosibles[0] ?? zona.duracionMinimaMin);
      setError(null);
      setHecho(null);
    }
  }, [franja, zona.duracionMinimaMin]);

  const abierto = !!franja;
  const ini = franja ? minutosDe(franja.hora) : 0;
  const max = zona.capacidad ?? 500;

  const confirmar = () => {
    if (!franja) return;
    setError(null);
    start(async () => {
      const r = await crearReservaAction({ zonaId: zona.id, unidadId, inicio: franja.inicio, duracionMin: String(duracion), asistentes: String(asistentes), motivo });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setHecho(r.data);
      onCreada();
      router.refresh();
    });
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-md">
        {hecho ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto size-14 text-success" />
            <DialogHeader>
              <DialogTitle className="text-center text-xl">{hecho.enlacePago ? "¡Reserva apartada!" : hecho.estado === "APROBADA" ? "¡Reserva confirmada!" : "Solicitud enviada"}</DialogTitle>
              <DialogDescription className="text-center">
                {hecho.enlacePago
                  ? `Paga ${cop(hecho.totalAPagar)} para confirmarla${zona.requiereAprobacion ? " (la administración también debe aprobarla)" : ""}. Si no pagas antes de la fecha, se libera.`
                  : hecho.estado === "APROBADA"
                    ? `${zona.nombre}, ${fechaTexto(fecha)} a las ${franja?.hora}.`
                    : "La administración revisará tu solicitud y te avisaremos."}
              </DialogDescription>
            </DialogHeader>
            {hecho.enlacePago ? (
              <Button size="lg" className="w-full" render={<Link href={hecho.enlacePago} />}>
                <Wallet /> Pagar ahora {cop(hecho.totalAPagar)}
              </Button>
            ) : null}
            <Button variant={hecho.enlacePago ? "outline" : "default"} size="lg" className="w-full" render={<Link href={`/reservas/detalle/${hecho.id}`} />}>
              <CalendarCheck /> Ver mi reserva
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Confirmar reserva</DialogTitle>
              <DialogDescription>
                {zona.nombre} · <span className="first-letter:uppercase">{fechaTexto(fecha)}</span>
              </DialogDescription>
            </DialogHeader>
            {franja && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium">Horario</p>
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Duración">
                    {franja.duracionesPosibles.map((d) => (
                      <button
                        key={d}
                        role="radio"
                        aria-checked={duracion === d}
                        onClick={() => setDuracion(d)}
                        className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl border text-sm", duracion === d ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "bg-card")}
                      >
                        <span className="font-semibold tabular-nums">
                          {franja.hora}–{hhmm(ini + d) === "00:00" ? "24:00" : hhmm(ini + d)}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatoDuracion(d)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {unidades.length > 1 && (
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Unidad</span>
                    <select value={unidadId} onChange={(e) => setUnidadId(e.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-base md:text-sm">
                      {unidades.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                          {u.group ? ` · ${u.group}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    Asistentes
                    {zona.capacidad ? <span className="block text-xs font-normal text-muted-foreground">Máximo {zona.capacidad}</span> : null}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" aria-label="Menos asistentes" onClick={() => setAsistentes((a) => Math.max(1, a - 1))}>
                      <Minus />
                    </Button>
                    <input
                      aria-label="Número de asistentes"
                      inputMode="numeric"
                      value={asistentes}
                      onChange={(e) => setAsistentes(Math.min(max, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)))}
                      className="h-11 w-16 rounded-lg border bg-background text-center text-base tabular-nums"
                    />
                    <Button variant="outline" size="icon" aria-label="Más asistentes" onClick={() => setAsistentes((a) => Math.min(max, a + 1))}>
                      <Plus />
                    </Button>
                  </div>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">
                    Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
                  </span>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} placeholder="Ej.: cumpleaños, reunión familiar" className="h-11 w-full rounded-lg border bg-background px-3 text-base md:text-sm" />
                </label>
                <Valores zona={zona} />
                {(zona.requiereAprobacion || zona.politicaCancelacion) && (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {zona.requiereAprobacion && <li>• Requiere aprobación de la administración.</li>}
                    {zona.valores.totalAPagar > 0 && <li>• Cancelación con reembolso hasta {zona.horasCancelacionReembolso} h antes.</li>}
                    {zona.reglas.map((r) => (
                      <li key={r.tipo}>• {describirRegla(r)}</li>
                    ))}
                  </ul>
                )}
                {error && (
                  <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button size="lg" className="w-full" onClick={confirmar} disabled={pending || !duracion || !unidadId}>
                  {pending && <Loader2 className="animate-spin" />}
                  {zona.valores.totalAPagar > 0 ? `Reservar · ${cop(zona.valores.totalAPagar)}` : "Confirmar reserva"}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
