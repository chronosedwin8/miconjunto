import Image from "next/image";
import { cn } from "@/lib/utils";

/** Captura real de la app dentro de un marco de celular. */
export function MarcoCelular({ src, alt, className, priority }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative rounded-[2.4rem] border border-black/10 bg-zinc-900 p-2 shadow-2xl shadow-primary/20 ring-1 ring-white/10", className)}>
      <div className="overflow-hidden rounded-[1.9rem] bg-background">
        {/* Barra de estado simulada: la cámara no tapa el encabezado de la captura */}
        <div className="flex h-5 items-center justify-center bg-background" aria-hidden>
          <span className="size-2 rounded-full bg-zinc-900" />
        </div>
        <Image src={src} alt={alt} width={600} height={1298} priority={priority} sizes="(min-width: 1024px) 280px, 60vw" className="h-auto w-full" />
      </div>
    </div>
  );
}

/** Captura real del panel de escritorio dentro de un marco de navegador. */
export function MarcoNavegador({ src, alt, className, priority }: { src: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-2xl shadow-primary/10", className)}>
      <div className="flex h-8 items-center gap-1.5 border-b bg-muted/60 px-3" aria-hidden>
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-3 h-4 flex-1 rounded bg-background/80" />
      </div>
      <Image src={src} alt={alt} width={1366} height={900} priority={priority} sizes="(min-width: 1024px) 760px, 100vw" className="h-auto w-full" />
    </div>
  );
}
