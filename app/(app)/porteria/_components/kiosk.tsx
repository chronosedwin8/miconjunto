import Link from "next/link";
import { cn } from "@/lib/utils";

/** Primitivas visuales del kiosco de portería: botones enormes y alto contraste. */

const TONOS = {
  primary: "bg-primary text-primary-foreground",
  dark: "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950",
  blue: "bg-blue-700 text-white",
  amber: "bg-amber-400 text-amber-950",
  violet: "bg-violet-700 text-white",
  slate: "bg-slate-700 text-white",
  red: "bg-red-700 text-white",
  outline: "border-2 border-foreground/30 bg-background text-foreground",
} as const;
export type Tono = keyof typeof TONOS;

export function BigAction({ href, icon: Icon, label, hint, tono = "primary", className, badge }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string; hint?: string; tono?: Tono; className?: string; badge?: number }) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-28 flex-col justify-between gap-2 rounded-2xl p-4 shadow-sm outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring active:scale-[0.98]",
        TONOS[tono],
        className,
      )}
    >
      <Icon className="size-9" />
      <span>
        <span className="block text-xl font-extrabold leading-tight">{label}</span>
        {hint && <span className="block text-sm font-medium opacity-90">{hint}</span>}
      </span>
      {badge ? <span className="absolute right-3 top-3 grid min-w-8 place-items-center rounded-full bg-white px-2 py-0.5 text-base font-black text-zinc-950 ring-2 ring-zinc-950/20">{badge}</span> : null}
    </Link>
  );
}

export function KTitle({ children, acciones, className }: { children: React.ReactNode; acciones?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", className)}>
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{children}</h1>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}

export function KSection({ titulo, acciones, children, className }: { titulo: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mb-6", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold sm:text-xl">{titulo}</h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export function Foto({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (!src) {
    const ini = alt
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("");
    return <span className={cn("grid size-16 shrink-0 place-items-center rounded-xl bg-muted text-xl font-bold text-foreground/70", className)} aria-hidden>{ini || "?"}</span>;
  }
  return <img src={src} alt={alt} className={cn("size-16 shrink-0 rounded-xl object-cover", className)} />;
}

export function Alerta({ children, tono = "red", className }: { children: React.ReactNode; tono?: "red" | "amber" | "green"; className?: string }) {
  const cls = { red: "border-red-700 bg-red-50 text-red-950 dark:bg-red-950/60 dark:text-red-50", amber: "border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50", green: "border-green-700 bg-green-50 text-green-950 dark:bg-green-950/50 dark:text-green-50" }[tono];
  return (
    <div role="alert" className={cn("rounded-xl border-2 p-3 text-base font-semibold", cls, className)}>
      {children}
    </div>
  );
}

/** Clase para botones grandes del kiosco (sobre <Button> de shadcn). */
export const bigBtn = "h-16 rounded-xl px-5 text-lg font-bold [&_svg:not([class*='size-'])]:size-6";
