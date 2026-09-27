"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Car, CheckCircle2, Clock, Loader2, LogOut, Phone, PhoneOff, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { conRespaldoOffline } from "@/lib/porteria/offline";
import { descartarSolicitudAction, resolverSolicitudAction, salidaAction } from "../actions";
import { Foto, bigBtn } from "./kiosk";

const cop = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

function durTexto(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export type SolicitudVista = {
  id: string;
  unidad: string;
  visitanteNombre: string;
  tipo: string;
  tipoLabel: string;
  placa: string | null;
  fotoUrl: string | null;
  estado: string;
  creada: string;
  expiraEn: string;
};

/** Solicitudes de ingreso en tiempo real (el residente responde desde su teléfono). */
export function SolicitudesPanel({ solicitudes, parqueaderos }: { solicitudes: SolicitudVista[]; parqueaderos: { value: string; label: string }[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!solicitudes.length) return null;
  return (
    <ul className="space-y-3">
      {solicitudes.map((s) => (
        <SolicitudItem key={s.id} s={s} now={now} parqueaderos={parqueaderos} />
      ))}
    </ul>
  );
}

function SolicitudItem({ s, now, parqueaderos }: { s: SolicitudVista; now: number; parqueaderos: { value: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [parq, setParq] = useState("");
  const restante = Math.max(0, Math.round((new Date(s.expiraEn).getTime() - now) / 1000));
  const vencida = s.estado === "EXPIRADA" || (s.estado === "PENDIENTE" && restante === 0);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(ok);
        router.refresh();
      } else toast.error(r.error);
    });

  const tono =
    s.estado === "AUTORIZADA" ? "border-green-700 bg-green-50 dark:bg-green-950/40" : s.estado === "RECHAZADA" ? "border-red-700 bg-red-50 dark:bg-red-950/40" : vencida ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40" : "border-blue-600 bg-blue-50 dark:bg-blue-950/40";
  return (
    <li className={cn("rounded-2xl border-2 p-3", tono)}>
      <div className="flex items-start gap-3">
        <Foto src={s.fotoUrl} alt={s.visitanteNombre} />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-extrabold leading-tight">
            {s.visitanteNombre} <span className="font-semibold text-foreground/70">→ {s.unidad}</span>
          </p>
          <p className="text-sm font-medium text-foreground/80">
            {s.tipoLabel}
            {s.placa && (
              <>
                {" "}
                · <Car className="inline size-4" /> {s.placa}
              </>
            )}
          </p>
          <p className="mt-1 text-base font-bold">
            {s.estado === "AUTORIZADA" && (
              <span className="inline-flex items-center gap-1 text-green-800 dark:text-green-300">
                <CheckCircle2 className="size-5" /> El residente AUTORIZÓ
              </span>
            )}
            {s.estado === "RECHAZADA" && (
              <span className="inline-flex items-center gap-1 text-red-800 dark:text-red-300">
                <XCircle className="size-5" /> El residente RECHAZÓ el ingreso
              </span>
            )}
            {s.estado === "PENDIENTE" && !vencida && (
              <span className="inline-flex items-center gap-1 text-blue-800 dark:text-blue-300">
                <Clock className="size-5" /> Esperando respuesta · {Math.floor(restante / 60)}:{String(restante % 60).padStart(2, "0")}
              </span>
            )}
            {vencida && (
              <span className="inline-flex items-center gap-1 text-amber-900 dark:text-amber-200">
                <PhoneOff className="size-5" /> Sin respuesta: llama y registra la decisión
              </span>
            )}
          </p>
        </div>
        <button type="button" aria-label="Quitar de la lista" disabled={pending} onClick={() => run(() => descartarSolicitudAction({ id: s.id }), "Solicitud cerrada")} className="grid size-11 place-items-center rounded-lg hover:bg-foreground/10">
          <X className="size-5" />
        </button>
      </div>
      {(s.estado === "AUTORIZADA" || vencida) && parqueaderos.length > 0 && (s.placa || s.estado === "AUTORIZADA") && (
        <select value={parq} onChange={(e) => setParq(e.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 bg-background px-3 text-base" aria-label="Parqueadero de visitantes">
          <option value="">Sin parqueadero</option>
          {parqueaderos.map((p) => (
            <option key={p.value} value={p.value}>
              Parqueadero {p.label}
            </option>
          ))}
        </select>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {s.estado === "AUTORIZADA" && (
          <Button className={cn(bigBtn, "flex-1 bg-green-700 text-white hover:bg-green-800")} disabled={pending} onClick={() => run(() => resolverSolicitudAction({ id: s.id, parqueaderoId: parq || undefined }), `Ingreso de ${s.visitanteNombre} registrado`)}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Dar ingreso
          </Button>
        )}
        {vencida && (
          <>
            <Button className={cn(bigBtn, "flex-1 bg-green-700 text-white hover:bg-green-800")} disabled={pending} onClick={() => run(() => resolverSolicitudAction({ id: s.id, telefonica: "AUTORIZADA", parqueaderoId: parq || undefined }), "Autorizado por teléfono: ingreso registrado")}>
              <Phone /> Autorizó por teléfono
            </Button>
            <Button className={cn(bigBtn, "flex-1")} variant="destructive" disabled={pending} onClick={() => run(() => resolverSolicitudAction({ id: s.id, telefonica: "RECHAZADA" }), "Decisión telefónica registrada: no autorizado")}>
              <PhoneOff /> No autorizó
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export type AdentroVista = { id: string; nombre: string; sujetoLabel: string; unidad: string | null; placa: string | null; parqueadero: string | null; hora: string; horaTexto: string; minutos: number; alerta: boolean; fotoUrl: string | null; valorParqueadero: number };

/** Lista "Adentro ahora" con tiempo de permanencia y salida en dos toques. */
export function AdentroLista({ items, alertaHoras }: { items: AdentroVista[]; alertaHoras: number }) {
  const [sel, setSel] = useState<AdentroVista | null>(null);
  if (!items.length) return <p className="rounded-2xl border-2 border-dashed p-6 text-center text-base text-muted-foreground">No hay visitantes adentro en este momento.</p>;
  return (
    <>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => (
          <li key={a.id} className={cn("flex min-w-0 items-center gap-3 rounded-2xl border-2 bg-card p-3", a.alerta && "border-amber-500 bg-amber-50 dark:bg-amber-950/30")}>
            <Foto src={a.fotoUrl} alt={a.nombre} className="size-14" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{a.nombre}</p>
              <p className="truncate text-sm text-foreground/75">
                {a.unidad ?? "—"} · {a.sujetoLabel}
                {a.placa ? ` · ${a.placa}` : ""}
                {a.parqueadero ? ` · 🅿️ ${a.parqueadero}` : ""}
              </p>
              <p className={cn("text-sm font-semibold", a.alerta ? "text-amber-800 dark:text-amber-300" : "text-foreground/80")}>
                {a.alerta ? <AlertTriangle className="mr-1 inline size-4 align-[-2px]" /> : <Clock className="mr-1 inline size-4 align-[-2px]" />} {durTexto(a.minutos)} adentro · desde {a.horaTexto}
                {a.alerta && ` (más de ${alertaHoras} h)`}
              </p>
            </div>
            <Button className="h-14 shrink-0 rounded-xl px-3 text-base font-bold" variant="outline" onClick={() => setSel(a)}>
              <LogOut className="size-5" /> Salida
            </Button>
          </li>
        ))}
      </ul>
      <SalidaDialog item={sel} onClose={() => setSel(null)} />
    </>
  );
}

export function SalidaDialog({ item, onClose }: { item: AdentroVista | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cobro, setCobro] = useState<"UNIDAD" | "VISITANTE" | "NINGUNO">("UNIDAD");
  useEffect(() => {
    if (item) setCobro(item.unidad ? "UNIDAD" : "VISITANTE");
  }, [item]);
  const registrar = () =>
    start(async () => {
      if (!item) return;
      const r = await conRespaldoOffline({ tipo: "SALIDA", payload: { ingresoId: item.id, cobro: item.valorParqueadero > 0 ? cobro : undefined }, descripcion: `Salida de ${item.nombre}` }, (p) => salidaAction(p as never));
      if ("offline" in r && r.offline) {
        toast.warning("Sin conexión: la salida quedó guardada y se sincronizará sola.");
        onClose();
        return;
      }
      if (r.ok) {
        toast.success(`Salida de ${item.nombre} registrada`);
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Registrar salida</DialogTitle>
          <DialogDescription className="text-base">{item ? `${item.nombre} · ${item.unidad ?? ""}` : ""}</DialogDescription>
        </DialogHeader>
        {item && (
          <div className="space-y-3">
            <p className="text-lg">
              Permanencia: <b>{durTexto(item.minutos)}</b>
            </p>
            {item.parqueadero && (
              <div className="rounded-xl border-2 p-3">
                <p className="text-base">
                  Parqueadero <b>{item.parqueadero}</b>: <b className="text-xl">{item.valorParqueadero > 0 ? cop(item.valorParqueadero) : "sin costo"}</b>
                </p>
                {item.valorParqueadero > 0 && (
                  <div className="mt-2 grid gap-2" role="radiogroup" aria-label="¿Quién paga el parqueadero?">
                    {(
                      [
                        ["UNIDAD", `Cobrar a la unidad ${item.unidad ?? ""}`],
                        ["VISITANTE", "El visitante pagó en portería"],
                        ["NINGUNO", "No cobrar"],
                      ] as const
                    )
                      .filter(([k]) => k !== "UNIDAD" || item.unidad)
                      .map(([k, l]) => (
                        <label key={k} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-3 has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                          <input type="radio" name="cobro" checked={cobro === k} onChange={() => setCobro(k)} className="size-5" />
                          <span className="text-base font-medium">{l}</span>
                        </label>
                      ))}
                  </div>
                )}
              </div>
            )}
            <Button className={cn(bigBtn, "w-full")} disabled={pending} onClick={registrar}>
              {pending ? <Loader2 className="animate-spin" /> : <LogOut />} Confirmar salida
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function LinkGrande({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center rounded-lg border-2 px-3 text-sm font-bold hover:bg-muted">
      {children}
    </Link>
  );
}
