"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Car, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useRealtime } from "@/components/realtime/use-realtime";
import { Button } from "@/components/ui/button";
import { responderSolicitudAction } from "../actions";

export type SolicitudResidente = { id: string; unidad: string; visitanteNombre: string; tipoLabel: string; placa: string | null; fotoUrl: string | null; hace: string };

/**
 * Banner en tiempo real para el residente: "X está en portería, ¿autorizas?". Llega por SSE (canal de su unidad y
 * de su usuario) y también como notificación push con botones Autorizar / Rechazar.
 */
export function SolicitudesLive({ solicitudes, unidadIds }: { solicitudes: SolicitudResidente[]; unidadIds: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  useRealtime(
    unidadIds.map((u) => `unidad:${u}`),
    (e) => {
      const esSolicitud = e.tipo.startsWith("solicitud.") || (e.tipo === "notificacion" && (e.data as { tipoNotif?: string } | undefined)?.tipoNotif === "SOLICITUD_INGRESO");
      if (!esSolicitud) return;
      if (e.tipo === "solicitud.nueva" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
      router.refresh();
    },
    { onPoll: () => router.refresh(), pollMs: 15000 },
  );
  const responder = (id: string, decision: "AUTORIZADA" | "RECHAZADA") => {
    setRespondiendo(id + decision);
    start(async () => {
      const r = await responderSolicitudAction({ id, decision });
      setRespondiendo(null);
      if (r.ok) {
        toast.success(decision === "AUTORIZADA" ? "Autorizado: portería ya lo sabe." : "Rechazado: portería no dejará ingresar al visitante.");
        router.refresh();
      } else toast.error(r.error);
    });
  };
  if (!solicitudes.length) return null;
  return (
    <div className="mb-5 space-y-3" aria-live="assertive">
      {solicitudes.map((s) => (
        <div key={s.id} className="rounded-2xl border-2 border-primary bg-primary/5 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            {s.fotoUrl ? (
              <img src={s.fotoUrl} alt="" className="size-16 rounded-xl object-cover" />
            ) : (
              <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                <BellRing className="size-6" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold leading-tight">{s.visitanteNombre} está en portería</p>
              <p className="text-sm text-muted-foreground">
                {s.tipoLabel} para {s.unidad} · {s.hace}
                {s.placa && (
                  <>
                    {" "}
                    · <Car className="inline size-4" /> {s.placa}
                  </>
                )}
              </p>
              <p className="mt-1 text-sm font-medium">¿Autorizas el ingreso?</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="lg" className="h-14 bg-green-700 text-base font-bold text-white hover:bg-green-800" disabled={pending} onClick={() => responder(s.id, "AUTORIZADA")}>
              {respondiendo === s.id + "AUTORIZADA" ? <Loader2 className="animate-spin" /> : <Check />} Autorizar
            </Button>
            <Button size="lg" variant="destructive" className="h-14 text-base font-bold" disabled={pending} onClick={() => responder(s.id, "RECHAZADA")}>
              {respondiendo === s.id + "RECHAZADA" ? <Loader2 className="animate-spin" /> : <X />} Rechazar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
