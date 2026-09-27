import Link from "next/link";
import { Check } from "lucide-react";
import type { Ctx } from "@/lib/auth/context";
import { PASOS_MI_HOGAR } from "@/lib/residentes/calculos";
import { cn } from "@/lib/utils";

/** Unidad activa del panel: `?u=` si pertenece al usuario, si no la primera propia. */
export async function unidadesDelUsuario(ctx: Ctx) {
  const unidades = await ctx.db.unidad.findMany({
    where: { id: { in: ctx.unidadIds } },
    select: { id: true, codigo: true, torre: { select: { nombre: true } } },
    orderBy: { codigo: "asc" },
  });
  return unidades;
}

export function elegirUnidad(ctx: Ctx, u: string | undefined) {
  if (u && ctx.unidadIds.includes(u)) return u;
  return ctx.unidadesPropias[0] ?? ctx.unidadIds[0] ?? null;
}

export function hrefPaso(n: number, unidadId: string) {
  return n >= 1 && n <= PASOS_MI_HOGAR.length ? `/mi-hogar/${n}?u=${unidadId}` : `/mi-hogar?u=${unidadId}`;
}

/** Indicador de pasos tocable (desplazable en el teléfono). */
export function Stepper({ actual, completados, unidadId }: { actual: number; completados: number[]; unidadId: string }) {
  return (
    <nav aria-label="Pasos" className="-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar">
      <ol className="flex gap-1.5">
        {PASOS_MI_HOGAR.map((p) => {
          const hecho = completados.includes(p.n);
          const activo = p.n === actual;
          return (
            <li key={p.n} className="shrink-0">
              <Link
                href={hrefPaso(p.n, unidadId)}
                aria-current={activo ? "step" : undefined}
                className={cn(
                  "flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
                  activo ? "border-primary bg-primary text-primary-foreground" : hecho ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground",
                )}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-[10px]", activo ? "bg-primary-foreground/20" : hecho ? "bg-success text-white" : "bg-muted")}>
                  {hecho && !activo ? <Check className="size-3" /> : p.n}
                </span>
                {p.corto}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function Avatar({ nombre, fotoUrl, size = "size-11" }: { nombre: string; fotoUrl?: string | null; size?: string }) {
  if (fotoUrl) {
    return <img src={fotoUrl} alt="" className={cn(size, "shrink-0 rounded-full border object-cover")} />;
  }
  return <span className={cn(size, "grid shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary")}>{nombre.slice(0, 1).toUpperCase()}</span>;
}
