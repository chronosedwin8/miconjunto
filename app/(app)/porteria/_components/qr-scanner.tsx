"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Scanner = { stop: () => Promise<void>; clear: () => void; isScanning?: boolean };

/** Escáner QR con la cámara trasera (html5-qrcode con import dinámico). */
export function QrScannerDialog({ open, onOpenChange, onResult }: { open: boolean; onOpenChange: (v: boolean) => void; onResult: (texto: string) => void }) {
  const id = useId().replace(/:/g, "");
  const elId = `qr-${id}`;
  const scanner = useRef<Scanner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setError(null);
    let cancel = false;
    const start = async () => {
      setStarting(true);
      // Esperar a que el diálogo monte el contenedor
      for (let i = 0; i < 20 && !document.getElementById(elId); i++) await new Promise((r) => setTimeout(r, 50));
      if (cancel) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const s = new Html5Qrcode(elId, { verbose: false });
        scanner.current = s as unknown as Scanner;
        await s.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (w: number, h: number) => ({ width: Math.floor(Math.min(w, h) * 0.75), height: Math.floor(Math.min(w, h) * 0.75) }) },
          (texto: string) => {
            if (done.current) return;
            done.current = true;
            if (navigator.vibrate) navigator.vibrate(120);
            onResult(texto);
          },
          () => undefined,
        );
      } catch (e) {
        setError((e as Error)?.message?.includes("Permission") || String(e).includes("NotAllowed") ? "No hay permiso para usar la cámara. Actívalo en el navegador." : "No se pudo abrir la cámara. Escribe el código de 6 dígitos.");
      } finally {
        setStarting(false);
      }
    };
    void start();
    return () => {
      cancel = true;
      const s = scanner.current;
      scanner.current = null;
      if (s) s.stop().then(() => s.clear()).catch(() => undefined);
    };
  }, [open, elId, onResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Escanear código QR</DialogTitle>
          <DialogDescription>Apunta la cámara al QR del visitante.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
          <div id={elId} className="size-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
          {starting && (
            <div className="absolute inset-0 grid place-items-center text-white">
              <Loader2 className="size-10 animate-spin" />
            </div>
          )}
        </div>
        {error && <p className="rounded-lg bg-destructive/10 p-3 text-base font-medium text-destructive">{error}</p>}
        <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
