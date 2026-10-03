import Link from "next/link";
import { MapPin, Package, Sparkles } from "lucide-react";
import type { CategoriaObjeto, TipoObjetoPerdido } from "@prisma/client";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { categoriaLabel } from "@/lib/objetos-perdidos/reglas";
import type { ObjetoTarjeta } from "@/lib/objetos-perdidos/service";
import { fecha, tiempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ICONO_CATEGORIA } from "./iconos";

export { ICONO_CATEGORIA };

export function CategoriaIcono({ categoria, className }: { categoria: CategoriaObjeto; className?: string }) {
  const I = ICONO_CATEGORIA[categoria] ?? Package;
  return <I className={className} aria-hidden="true" />;
}

export function TipoPill({ tipo, className }: { tipo: TipoObjetoPerdido; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tipo === "PERDIDO" ? "bg-destructive text-white" : "bg-success text-white",
        className,
      )}
    >
      {tipo === "PERDIDO" ? "Se perdió" : "Se encontró"}
    </span>
  );
}

/** Imagen o, si no hay foto, el ícono de la categoría sobre un fondo suave. */
export function FotoObjeto({ src, categoria, tipo, className }: { src?: string | null; categoria: CategoriaObjeto; tipo: TipoObjetoPerdido; className?: string }) {
  if (src) return <img src={src} alt="" loading="lazy" className={cn("w-full object-cover", className)} />;
  return (
    <div className={cn("grid w-full place-items-center", tipo === "PERDIDO" ? "bg-destructive/5 text-destructive/60" : "bg-success/10 text-success/70", className)}>
      <CategoriaIcono categoria={categoria} className="size-12" />
    </div>
  );
}

export function TarjetaObjeto({ o }: { o: ObjetoTarjeta }) {
  return (
    <li className="min-w-0">
      <Link href={`/objetos-perdidos/${o.id}`} className="flex h-full overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/50 sm:flex-col">
        <div className="relative w-28 shrink-0 sm:w-full">
          <FotoObjeto src={o.fotos[0]} categoria={o.categoria} tipo={o.tipo} className="h-full min-h-28 sm:h-40" />
          <TipoPill tipo={o.tipo} className="absolute left-2 top-2 shadow-sm" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
          <p className="line-clamp-2 font-semibold leading-snug">{o.titulo}</p>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <CategoriaIcono categoria={o.categoria} className="size-3.5 shrink-0" />
            {/* Con lugar, la categoría queda solo como ícono para no truncar en el teléfono. */}
            {o.lugar ? (
              <>
                <span className="sr-only">{categoriaLabel(o.categoria)}</span>
                <MapPin className="ml-1 size-3.5 shrink-0" />
                <span className="truncate">{o.lugar}</span>
              </>
            ) : (
              <span className="truncate">{categoriaLabel(o.categoria)}</span>
            )}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {o.estado !== "ABIERTO" && <StatusBadge value={o.estado} />}
            {o.coincidencias > 0 && (
              <Badge variant="default" className="gap-1">
                <Sparkles className="size-3" /> {o.coincidencias} posible{o.coincidencias === 1 ? "" : "s"}
              </Badge>
            )}
            {o.miReclamo && <StatusBadge value={o.miReclamo} text={o.miReclamo === "PENDIENTE" ? "Tu reclamo: en revisión" : o.miReclamo === "APROBADO" ? "Tu reclamo: aprobado" : "Tu reclamo: rechazado"} />}
            {o.reclamosPendientes > 0 && <Badge variant="warning">{o.reclamosPendientes} reclamo{o.reclamosPendientes === 1 ? "" : "s"}</Badge>}
            {o.vencido && <Badge variant="destructive">Plazo vencido</Badge>}
            {o.porRecibir && <Badge variant="warning">Sin custodia</Badge>}
            {o.recompensa && <Badge variant="outline">Recompensa</Badge>}
            {o.propio && <Badge variant="secondary">Tuyo</Badge>}
            <span className="ml-auto text-xs text-muted-foreground" title={fecha(o.fecha)}>
              {tiempoRelativo(o.fecha)}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
