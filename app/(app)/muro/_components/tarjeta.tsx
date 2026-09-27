import Link from "next/link";
import { CalendarDays, Megaphone, MessageCircle, Newspaper, Pin, SearchCheck, Siren, SmilePlus, Store, Users } from "lucide-react";
import type { TarjetaPublicacion } from "@/lib/muro/service";
import { cop, tiempoRelativo } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const ICONO_CATEGORIA = {
  AVISO: Megaphone,
  NOTICIA: Newspaper,
  EVENTO: CalendarDays,
  EMERGENCIA: Siren,
  CLASIFICADO: Store,
  PERDIDO_ENCONTRADO: SearchCheck,
} as const;

export const COLOR_CATEGORIA: Record<string, string> = {
  AVISO: "bg-primary/10 text-primary",
  NOTICIA: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  EVENTO: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  EMERGENCIA: "bg-destructive/10 text-destructive",
  CLASIFICADO: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PERDIDO_ENCONTRADO: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
};

export function CategoriaChip({ categoria }: { categoria: string }) {
  const Icon = ICONO_CATEGORIA[categoria as keyof typeof ICONO_CATEGORIA] ?? Megaphone;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium", COLOR_CATEGORIA[categoria])}>
      <Icon className="size-3.5" /> {label(categoria)}
    </span>
  );
}

/** Tarjeta del feed (móvil primero): toda la tarjeta es tocable. */
export function TarjetaMuro({ p, mostrarEstado }: { p: TarjetaPublicacion; mostrarEstado?: boolean }) {
  return (
    <Link
      href={`/muro/${p.id}`}
      className={cn(
        "block overflow-hidden rounded-2xl border bg-card transition-colors hover:bg-muted/40 active:opacity-90",
        p.categoria === "EMERGENCIA" && "border-destructive/40",
        p.fijada && "border-primary/40",
      )}
    >
      {p.imagen && (
        <img src={p.imagen} alt="" loading="lazy" className="h-40 w-full object-cover sm:h-48" />
      )}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoriaChip categoria={p.categoria} />
          {p.fijada && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs">
              <Pin className="size-3" /> Fijada
            </span>
          )}
          {p.conAudiencia && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2 text-xs" title="Publicación para un grupo específico">
              <Users className="size-3" /> Segmentada
            </span>
          )}
          {mostrarEstado && p.estado !== "PUBLICADA" && <Badge variant="warning">{label(p.estado)}</Badge>}
          {!p.leida && <span className="ml-auto size-2.5 rounded-full bg-primary" aria-label="Sin leer" />}
        </div>
        <h2 className="text-base font-semibold leading-snug">{p.titulo}</h2>
        {p.precio !== null && <p className="text-lg font-bold text-primary">{cop(p.precio)}</p>}
        {p.resumen && <p className="line-clamp-3 text-sm text-muted-foreground">{p.resumen}</p>}
        <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
          <span className="truncate">
            {p.autor} · {tiempoRelativo(p.createdAt)}
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <SmilePlus className="size-3.5" /> {p.reacciones}
          </span>
          {p.permiteComentarios && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3.5" /> {p.comentarios}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
