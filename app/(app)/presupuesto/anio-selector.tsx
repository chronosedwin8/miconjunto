import Link from "next/link";
import { cn } from "@/lib/utils";

/** Selector de año (chips) para las páginas de presupuesto. */
export function AnioSelector({ anios, actual, base }: { anios: number[]; actual: number; base: string }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {anios.map((a) => (
        <Link key={a} href={`${base}?anio=${a}`} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm", a === actual ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {a}
        </Link>
      ))}
    </div>
  );
}

export function aniosDisponibles(conPresupuesto: number[], hoy: number) {
  return [...new Set([...conPresupuesto, hoy, hoy + 1])].sort((a, b) => b - a).slice(0, 5);
}
