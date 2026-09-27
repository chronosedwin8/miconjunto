"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AnyAction } from "@/components/form/action-form";

/** Botón que pide al asistente IA un texto (borrador de PQRS, resumen de acta) y lo muestra para copiar. */
export function IaBoton({ action, id, texto, titulo }: { action: AnyAction; id: string; texto: string; titulo: string }) {
  const [res, setRes] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action({ id });
            if (r.ok) setRes((r.data as { respuesta: string }).respuesta);
            else toast.error(r.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {texto}
      </Button>
      <Dialog open={res !== null} onOpenChange={(o) => !o && setRes(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>Generado con IA. Revísalo y ajústalo antes de usarlo.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55dvh] overflow-y-auto whitespace-pre-line rounded-lg bg-muted p-3 text-sm">{res}</div>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(res ?? "");
              toast.success("Copiado");
            }}
          >
            <Copy /> Copiar texto
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
