"use client";

import { useState } from "react";
import { Siren, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { panicAction } from "@/app/(app)/emergencias/actions";

/** Botón de pánico del residente: alerta a portería y administración con su unidad. */
export function PanicButton() {
  const [open, setOpen] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Botón de pánico"
        className="fixed bottom-20 right-4 z-40 grid size-12 place-items-center rounded-full bg-red-600 text-white shadow-lg ring-4 ring-red-600/20 lg:bottom-6"
      >
        <Siren className="size-6" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Activar alerta de emergencia?</DialogTitle>
            <DialogDescription>Portería y la administración recibirán una alerta inmediata con tu unidad.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="¿Qué está pasando? (opcional)" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={300} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const r = await panicAction({ mensaje });
                setPending(false);
                if (r.ok) {
                  toast.success("Alerta enviada. Portería y administración fueron notificadas.");
                  setOpen(false);
                  setMensaje("");
                } else toast.error(r.error);
              }}
            >
              {pending && <Loader2 className="animate-spin" />} Enviar alerta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
