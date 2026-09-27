"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Refresca la página mientras el pago sigue PENDIENTE (el estado real lo fija el webhook, no la redirección). */
export function EstadoPagoPoller({ pendiente, intervaloMs = 3000, maxMs = 180_000 }: { pendiente: boolean; intervaloMs?: number; maxMs?: number }) {
  const router = useRouter();
  const [inicio] = useState(() => Date.now());
  useEffect(() => {
    if (!pendiente) return;
    const t = setInterval(() => {
      if (Date.now() - inicio > maxMs) return clearInterval(t);
      router.refresh();
    }, intervaloMs);
    return () => clearInterval(t);
  }, [pendiente, intervaloMs, maxMs, inicio, router]);
  return null;
}

const cop = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);

/** Tarjeta grande de resultado del pago. */
export function ResultadoPago({
  estado,
  valor,
  unidad,
  referencia,
  recibo,
}: {
  estado: string;
  valor: number;
  unidad: string;
  referencia: string;
  recibo: number | null;
}) {
  const ok = estado === "APROBADO";
  const pend = estado === "PENDIENTE";
  const Icon = ok ? CheckCircle2 : pend ? Clock : XCircle;
  const titulo = ok ? "¡Pago aprobado!" : pend ? "Estamos confirmando tu pago…" : estado === "ANULADO" ? "Pago vencido" : "Pago no aprobado";
  const texto = ok
    ? `Recibimos ${cop(valor)} para ${unidad}.${recibo ? ` Recibo N.º ${recibo}.` : ""} Te enviamos el recibo a tu correo.`
    : pend
      ? "La pasarela nos avisará en unos segundos. No cierres esta página ni pagues de nuevo."
      : "No se hizo ningún cobro. Puedes intentarlo otra vez con el mismo u otro medio de pago.";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-2xl border p-6 text-center",
        ok ? "border-success/30 bg-success/5" : pend ? "border-warning/30 bg-warning/5" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <Icon className={cn("mx-auto mb-3 size-14", ok ? "text-success" : pend ? "animate-pulse text-warning" : "text-destructive")} />
      <h2 className="text-xl font-bold">{titulo}</h2>
      <p className="mt-1 text-3xl font-bold tabular-nums">{cop(valor)}</p>
      <p className="mt-2 text-sm text-muted-foreground">{texto}</p>
      <p className="mt-3 font-mono text-xs text-muted-foreground">Referencia {referencia}</p>
    </div>
  );
}
