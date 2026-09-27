"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { useRealtime } from "@/components/realtime/use-realtime";

/**
 * Refresca la página (Server Components) cuando llega un evento de tiempo real de los canales dados
 * (p. ej. "votacion:<id>", "asamblea:<id>", "encuesta:<id>"). Agrupa ráfagas de eventos.
 */
export function LiveRefresh({ canales, label = "En vivo", pollMs = 15000 }: { canales: string[]; label?: string | false; pollMs?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pulso, setPulso] = useState(0);
  const refrescar = () => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
      setPulso((p) => p + 1);
    }, 700);
  };
  useRealtime(canales, (e) => {
    if (e.canal === "sistema") return;
    if (canales.includes(e.canal)) refrescar();
  }, { onPoll: () => router.refresh(), pollMs });
  if (label === false) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success" aria-live="polite">
      <Radio key={pulso} className="size-3.5 animate-pulse" /> {label}
    </span>
  );
}
