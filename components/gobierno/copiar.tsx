"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopiarTexto({ texto, etiqueta = "Copiar" }: { texto: string; etiqueta?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          toast.success("Copiado");
          setTimeout(() => setOk(false), 2000);
        } catch {
          toast.error("No se pudo copiar");
        }
      }}
    >
      {ok ? <Check /> : <Copy />} {etiqueta}
    </Button>
  );
}
