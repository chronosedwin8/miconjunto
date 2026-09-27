"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Siren } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { activarAlertaAction } from "@/app/(app)/emergencias/actions";

const PLANTILLAS = [
  { tipo: "INCENDIO", label: "🔥 Incendio", mensaje: "Incendio reportado en el conjunto. Evacúen por las escaleras hacia el punto de encuentro. No usen ascensores." },
  { tipo: "SISMO", label: "🌎 Sismo", mensaje: "Sismo. Protéjanse y, al terminar el movimiento, evacúen con calma hacia el punto de encuentro." },
  { tipo: "MEDICA", label: "🚑 Médica", mensaje: "Emergencia médica en el conjunto. Se solicitó apoyo; mantengan despejadas las vías de acceso." },
  { tipo: "SEGURIDAD", label: "🛡️ Seguridad", mensaje: "Situación de seguridad en el conjunto. Permanezcan en sus unidades y sigan las indicaciones de portería." },
  { tipo: "EMERGENCIA_GENERAL", label: "⚠️ General", mensaje: "Emergencia en el conjunto. Sigan las instrucciones del plan de emergencia." },
] as const;

/** Botón de emergencia de portería con plantillas: notifica a administración, consejo y (configurable) a todos. */
export function EmergenciaBoton({ aTodosPorDefecto }: { aTodosPorDefecto: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<(typeof PLANTILLAS)[number]["tipo"]>("EMERGENCIA_GENERAL");
  const [mensaje, setMensaje] = useState<string>(PLANTILLAS[4].mensaje);
  const [aTodos, setATodos] = useState(aTodosPorDefecto);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-32 w-full items-center justify-center gap-4 rounded-3xl border-4 border-red-900 bg-red-700 p-6 text-white shadow-lg active:scale-[0.99]">
        <Siren className="size-14" />
        <span className="text-left">
          <span className="block text-3xl font-black">ACTIVAR EMERGENCIA</span>
          <span className="block text-base font-medium">Notifica a administración, consejo{aTodosPorDefecto ? " y a todos los residentes" : ""}</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl">¿Qué emergencia es?</DialogTitle>
            <DialogDescription className="text-base">Elige la plantilla; puedes ajustar el mensaje.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {PLANTILLAS.map((p) => (
              <button
                key={p.tipo}
                type="button"
                onClick={() => {
                  setTipo(p.tipo);
                  setMensaje(p.mensaje);
                }}
                className={cn("h-14 rounded-xl border-2 text-lg font-bold", tipo === p.tipo && "border-red-700 bg-red-50 ring-2 ring-red-700/30 dark:bg-red-950/40")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4} maxLength={500} aria-label="Mensaje" className="w-full rounded-xl border-2 bg-background p-3 text-base" />
          <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 px-3">
            <input type="checkbox" checked={aTodos} onChange={(e) => setATodos(e.target.checked)} className="size-6" />
            <span className="text-base font-semibold">Avisar también a todos los residentes</span>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await activarAlertaAction({ tipo, mensaje, aTodos });
                if (r.ok) {
                  toast.success("Alerta enviada. Se notificó a la administración y al consejo.");
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
            className="flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-red-700 text-xl font-black text-white"
          >
            {pending ? <Loader2 className="size-6 animate-spin" /> : <Siren className="size-6" />} Enviar alerta ahora
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
