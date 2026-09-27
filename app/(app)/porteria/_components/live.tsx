"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Siren, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useRealtime } from "@/components/realtime/use-realtime";
import { atenderAlertaAction } from "@/app/(app)/emergencias/actions";

/** Refresca la pantalla de portería ante eventos en tiempo real (SSE, canal "porteria"). */
export function PorteriaLive({ onEvento }: { onEvento?: (tipo: string) => void }) {
  const router = useRouter();
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtime(
    ["porteria"],
    (e) => {
      if (e.canal !== "porteria") return;
      onEvento?.(e.tipo);
      if (e.tipo === "porteria.solicitud_respondida") {
        pitido([880, 1320], 0.18);
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
        toast.info("El residente respondió una solicitud de ingreso.");
      }
      if (e.tipo === "emergencia.activada") alarma();
      if (t.current) clearTimeout(t.current);
      t.current = setTimeout(() => router.refresh(), 250);
    },
    { onPoll: () => router.refresh(), pollMs: 20000 },
  );
  return null;
}

let audioCtx: AudioContext | null = null;
function pitido(frecs: number[], dur = 0.25) {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let t0 = audioCtx.currentTime;
    for (const f of frecs) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur);
      t0 += dur + 0.05;
    }
  } catch {
    /* sin audio */
  }
}

function alarma() {
  pitido([988, 740, 988, 740, 988, 740], 0.3);
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
}

export type AlertaVista = { id: string; tipo: string; titulo: string; unidad: string | null; mensaje: string | null; hace: string };

/** Alertas de emergencia/pánico activas: banner rojo con sonido y vibración y botón "Atendida". */
export function AlertasEmergencia({ alertas }: { alertas: AlertaVista[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [atendiendo, setAtendiendo] = useState<string | null>(null);
  const vistas = useRef(new Set<string>());

  useEffect(() => {
    const nuevas = alertas.filter((a) => !vistas.current.has(a.id));
    if (nuevas.length && vistas.current.size > 0) alarma();
    for (const a of alertas) vistas.current.add(a.id);
    if (!alertas.length) return;
    // Repetir el sonido cada 20 s mientras haya alertas sin atender
    const t = setInterval(alarma, 20000);
    return () => clearInterval(t);
  }, [alertas]);

  if (!alertas.length) return null;
  return (
    <div className="mb-4 space-y-2" role="alert" aria-live="assertive">
      {alertas.map((a) => (
        <div key={a.id} className="flex flex-col gap-3 rounded-2xl border-4 border-red-900 bg-red-700 p-4 text-white shadow-lg sm:flex-row sm:items-center">
          <Siren className="size-12 shrink-0 animate-pulse" />
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-black leading-tight">
              {a.titulo}
              {a.unidad && <span className="ml-2 rounded-lg bg-white px-2 text-red-800">{a.unidad}</span>}
            </p>
            <p className="text-base font-medium opacity-95">
              {a.mensaje || "Acude de inmediato."} · {a.hace}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={alarma} className="grid size-14 place-items-center rounded-xl bg-red-900" aria-label="Repetir sonido">
              <Volume2 className="size-6" />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setAtendiendo(a.id);
                start(async () => {
                  const r = await atenderAlertaAction({ id: a.id });
                  setAtendiendo(null);
                  if (r.ok) {
                    toast.success("Alerta marcada como atendida.");
                    router.refresh();
                  } else toast.error(r.error);
                });
              }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-5 text-lg font-black text-red-800 sm:flex-none"
            >
              {atendiendo === a.id ? <Loader2 className="size-6 animate-spin" /> : <CheckCircle2 className="size-6" />} Atendida
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
