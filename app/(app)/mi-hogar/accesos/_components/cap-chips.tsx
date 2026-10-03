import { CalendarCheck, Car, Hammer, House, LifeBuoy, Megaphone, Package, UserCheck, Wallet, type LucideIcon } from "lucide-react";
import { CAPACIDADES, type CapacidadKey } from "@/lib/hogar/capacidades";
import { cn } from "@/lib/utils";

const ICONOS: Record<CapacidadKey, LucideIcon> = {
  comunidad: Megaphone,
  visitantes: UserCheck,
  paquetes: Package,
  reservas: CalendarCheck,
  pqrs: LifeBuoy,
  obras: Hammer,
  vehiculos: Car,
  hogar: House,
  cuenta: Wallet,
};

export function CapIcon({ cap, className }: { cap: CapacidadKey; className?: string }) {
  const Icon = ICONOS[cap];
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

/** Capacidades como chips (solo lectura). */
export function CapChips({ caps, apagado, className }: { caps: CapacidadKey[]; apagado?: boolean; className?: string }) {
  if (!caps.length) return <p className={cn("text-xs text-muted-foreground", className)}>Sin permisos en la app.</p>;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Lo que puede hacer en la app">
      {caps.map((c) => (
        <li
          key={c}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
            apagado ? "border-dashed text-muted-foreground" : "border-primary/20 bg-primary/5 text-foreground",
          )}
        >
          <CapIcon cap={c} className="size-3.5 text-primary" />
          {CAPACIDADES[c].label}
        </li>
      ))}
    </ul>
  );
}
