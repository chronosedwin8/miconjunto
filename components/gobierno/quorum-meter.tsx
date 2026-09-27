import { CheckCircle2, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { num } from "@/lib/format";

/** Barra de progreso del quórum (legible en proyector con `grande`). La marca indica el mínimo requerido. */
export function QuorumMeter({
  porcentaje,
  requerido,
  hayQuorum,
  unidades,
  totalUnidades,
  faltante,
  grande,
}: {
  porcentaje: number;
  requerido: number;
  hayQuorum: boolean;
  unidades: number;
  totalUnidades: number;
  faltante: number;
  grande?: boolean;
}) {
  const w = Math.min(100, Math.max(0, porcentaje));
  const marca = Math.min(100, requerido);
  return (
    <div className={cn("rounded-xl border bg-card p-4", grande && "p-6 lg:p-10")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className={cn("text-sm font-medium text-muted-foreground", grande && "text-lg lg:text-2xl")}>Quórum (coeficientes presentes y representados)</p>
          <p className={cn("text-4xl font-bold tabular-nums", grande && "whitespace-nowrap text-6xl lg:text-8xl 2xl:text-9xl", hayQuorum ? "text-success" : "text-foreground")}>{num(porcentaje, 2)} %</p>
        </div>
        <p className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", grande && "text-lg lg:text-3xl lg:px-5 lg:py-2", hayQuorum ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
          {hayQuorum ? <CheckCircle2 className={cn("size-4", grande && "lg:size-8")} /> : <CircleAlert className={cn("size-4", grande && "lg:size-8")} />}
          {hayQuorum ? "Hay quórum" : "Sin quórum aún"}
        </p>
      </div>
      <div
        className={cn("relative mt-3 h-4 overflow-hidden rounded-full bg-muted", grande && "h-8 lg:h-14")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(porcentaje)}
        aria-label="Porcentaje de coeficientes presentes"
      >
        <div className={cn("h-full rounded-full transition-all duration-700", hayQuorum ? "bg-success" : "bg-primary")} style={{ width: `${w}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${marca}%` }} aria-hidden />
      </div>
      <div className={cn("mt-2 flex flex-wrap justify-between gap-2 text-sm text-muted-foreground", grande && "text-base lg:text-2xl")}>
        <span>
          {unidades} de {totalUnidades} unidades
        </span>
        <span>{hayQuorum ? requerido > 50 && requerido < 50.001 ? "Mínimo: más del 50 %" : `Mínimo: ${num(requerido, 2)} %` : `Faltan ${num(faltante, 4)} puntos de coeficiente`}</span>
      </div>
    </div>
  );
}
