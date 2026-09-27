"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AnyAction } from "@/components/form/action-form";

const OPCIONES = [
  { tipo: "LIKE", emoji: "👍", label: "Me gusta" },
  { tipo: "GRACIAS", emoji: "🙏", label: "Gracias" },
  { tipo: "CORAZON", emoji: "❤️", label: "Me encanta" },
  { tipo: "IMPORTANTE", emoji: "❗", label: "Importante" },
];

/** Barra de reacciones con actualización optimista (un toque para reaccionar o quitar). */
export function Reacciones({ id, conteos, mia, accion, deshabilitado }: { id: string; conteos: Record<string, number>; mia: string | null; accion: AnyAction; deshabilitado?: boolean }) {
  const [estado, setEstado] = useState({ conteos, mia });
  const [pending, start] = useTransition();
  const tocar = (tipo: string) => {
    const antes = estado;
    const c = { ...estado.conteos };
    if (estado.mia) c[estado.mia] = Math.max(0, (c[estado.mia] ?? 0) - 1);
    const nueva = estado.mia === tipo ? null : tipo;
    if (nueva) c[nueva] = (c[nueva] ?? 0) + 1;
    setEstado({ conteos: c, mia: nueva });
    start(async () => {
      const r = await accion({ id, tipo });
      if (!r.ok) {
        setEstado(antes);
        toast.error(r.error);
      }
    });
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Reacciones">
      {OPCIONES.map((o) => {
        const on = estado.mia === o.tipo;
        return (
          <button
            key={o.tipo}
            type="button"
            disabled={deshabilitado || pending}
            onClick={() => tocar(o.tipo)}
            aria-pressed={on}
            aria-label={`${o.label} (${estado.conteos[o.tipo] ?? 0})`}
            className={cn("inline-flex h-11 min-w-14 items-center justify-center gap-1.5 rounded-full border px-3 text-sm transition-colors", on ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-background hover:bg-muted")}
          >
            <span aria-hidden>{o.emoji}</span>
            <span className="tabular-nums">{estado.conteos[o.tipo] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );
}
