"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldError } from "@/components/form/action-form";

const TEXTO = ["", "Malo", "Regular", "Bueno", "Muy bueno", "Excelente"];

/** Selector de 1 a 5 estrellas con objetivos táctiles de 44 px. Envía `name`. */
export function SelectorEstrellas({ name = "puntaje", defaultValue = 0 }: { name?: string; defaultValue?: number }) {
  const [v, setV] = useState(defaultValue);
  const error = useFieldError(name);
  return (
    <div>
      <input type="hidden" name={name} value={v || ""} />
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={v === i} aria-label={`${i} estrella${i > 1 ? "s" : ""}`} onClick={() => setV(i)} className="grid size-11 place-items-center rounded-lg hover:bg-muted">
            <Star className={cn("size-7", v >= i ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50")} />
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{TEXTO[v]}</span>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
