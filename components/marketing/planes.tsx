import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { cop, DESCUENTO_MULTI, PRECIO_MULTI_POR_CONJUNTO, PRECIO_UNICO, UMBRAL_DESCUENTO } from "@/lib/comercial/precios";
import { cn } from "@/lib/utils";

const INCLUYE = [
  "Todos los módulos, sin costos adicionales",
  "Usuarios ilimitados: administración, consejo, portería y residentes",
  "App para celular y portería que funciona sin internet",
  "Importación de datos desde Excel y capacitación",
  "Soporte, actualizaciones y copias de seguridad diarias",
];

/** Tarjetas de los dos planes. Se usan en la home y en /precios. */
export function Planes({ conCotizador = true }: { conCotizador?: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <article className="flex flex-col rounded-3xl border bg-card p-6 shadow-sm sm:p-8" aria-labelledby="plan-unico">
        <h3 id="plan-unico" className="text-lg font-semibold">Conjunto único</h3>
        <p className="mt-1 text-sm text-muted-foreground">Para un conjunto residencial. Incluye todo.</p>
        <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">{cop(PRECIO_UNICO)}</span>
          <span className="text-sm text-muted-foreground">/ año</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Equivale a {cop(Math.round(PRECIO_UNICO / 12))} al mes, con pago anual.</p>
        <ul className="mt-6 flex-1 space-y-3 text-sm">
          {INCLUYE.map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <Link href="/precios?conjuntos=1#cotizador" className="mt-8 inline-flex h-12 items-center justify-center rounded-xl border-2 border-primary px-5 font-semibold text-primary transition-colors hover:bg-primary/5">
          Solicitar cotización
        </Link>
      </article>

      <article className="relative flex flex-col rounded-3xl border-2 border-primary bg-card p-6 shadow-xl shadow-primary/10 sm:p-8" aria-labelledby="plan-multi">
        <span className="absolute -top-3.5 left-6 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          <Sparkles className="size-3.5" aria-hidden /> Para administradoras y constructoras
        </span>
        <h3 id="plan-multi" className="text-lg font-semibold">Multiconjunto</h3>
        <p className="mt-1 text-sm text-muted-foreground">Para quienes administran 2 o más conjuntos. Incluye todo en cada uno.</p>
        <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
          <span className="text-4xl font-extrabold tracking-tight tabular-nums sm:text-5xl">{cop(PRECIO_MULTI_POR_CONJUNTO)}</span>
          <span className="text-sm text-muted-foreground">/ año por conjunto</span>
        </p>
        <p className={cn("mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-medium text-primary")}>
          Más de {UMBRAL_DESCUENTO} conjuntos: {Math.round(DESCUENTO_MULTI * 100)} % de descuento sobre toda la factura anual.
        </p>
        <ul className="mt-6 flex-1 space-y-3 text-sm">
          {["Todo lo del plan Conjunto único en cada conjunto", "Cambia de conjunto con un toque, con la misma cuenta", ...INCLUYE.slice(1, 2), "Una sola factura anual para todos tus conjuntos"].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <Link href={conCotizador ? "/precios?conjuntos=4#cotizador" : "/precios#cotizador"} className="mt-8 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          Cotizar varios conjuntos
        </Link>
      </article>
    </div>
  );
}

export const NOTA_PRECIOS = "Valores en pesos colombianos (COP). Todos los planes se pagan de forma anual y anticipada.";
