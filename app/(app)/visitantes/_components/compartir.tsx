"use client";

import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Compartir el pase: WhatsApp (wa.me), menú nativo del teléfono o copiar el mensaje. */
export function CompartirPase({ whatsapp, mensaje, url }: { whatsapp: string; mensaje: string; url: string }) {
  return (
    <div className="grid gap-2">
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex h-14 items-center justify-center gap-2 rounded-xl bg-[#1f8f4e] text-lg font-bold text-white hover:bg-[#1a7a43]">
        <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden>
          <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
        </svg>
        Compartir por WhatsApp
      </a>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-12"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: "Pase de ingreso", text: mensaje, url });
              } catch {
                /* cancelado */
              }
            } else {
              await navigator.clipboard.writeText(mensaje);
              toast.success("Mensaje copiado");
            }
          }}
        >
          <Share2 /> Compartir
        </Button>
        <Button
          variant="outline"
          className="h-12"
          onClick={async () => {
            await navigator.clipboard.writeText(mensaje);
            toast.success("Mensaje copiado");
          }}
        >
          <Copy /> Copiar
        </Button>
      </div>
    </div>
  );
}
