"use client";

import { Building2, CreditCard, QrCode, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

export const MEDIOS = [
  { value: "PSE", label: "PSE", descripcion: "Débito desde tu banco", icon: Building2 },
  { value: "TARJETA", label: "Tarjeta", descripcion: "Crédito o débito", icon: CreditCard },
  { value: "NEQUI", label: "Nequi", descripcion: "Desde tu celular", icon: Smartphone },
  { value: "BANCOLOMBIA_QR", label: "Bancolombia", descripcion: "Botón o código QR", icon: QrCode },
] as const;

export function MedioSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
      {MEDIOS.map((m) => {
        const Icon = m.icon;
        const active = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m.value)}
            className={cn(
              "flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-xl border p-3 text-left text-sm",
              active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "bg-card",
            )}
          >
            <span className="flex items-center gap-2 font-semibold">
              <Icon className="size-4" /> {m.label}
            </span>
            <span className="text-xs text-muted-foreground">{m.descripcion}</span>
          </button>
        );
      })}
    </div>
  );
}
