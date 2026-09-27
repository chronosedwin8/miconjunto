import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { calendarioMes, type EventoCalendario } from "@/lib/mantenimiento/service";
import { diaBogota } from "@/lib/mantenimiento/calculos";
import { mesNombre, nowBogota } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";

export const metadata = { title: "Calendario de mantenimiento" };

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const color = (e: EventoCalendario) =>
  e.estado === "VENCIDO" || (e.tipo === "ORDEN" && e.estado !== "COMPLETADA" && diaBogota(e.fecha) < diaBogota(new Date()))
    ? "border-l-destructive bg-destructive/5"
    : e.estado === "COMPLETADA"
      ? "border-l-success bg-success/5"
      : e.mantenimiento === "LEGAL"
        ? "border-l-primary bg-primary/5"
        : e.tipo === "PLAN"
          ? "border-l-muted-foreground/40 bg-muted/40"
          : "border-l-blue-500 bg-blue-500/5";

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("mantenimiento.ver");
  const sp = await searchParams;
  const n = nowBogota();
  const [y, m] = (spGet(sp, "mes") ?? `${n.year}-${n.month}`).split("-").map(Number);
  const anio = y || n.year;
  const mes = m >= 1 && m <= 12 ? m : n.month;
  const eventos = await calendarioMes(ctx, anio, mes);
  const prev = mes === 1 ? `${anio - 1}-12` : `${anio}-${mes - 1}`;
  const next = mes === 12 ? `${anio + 1}-1` : `${anio}-${mes + 1}`;
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const primerDia = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const porDia = new Map<number, EventoCalendario[]>();
  for (const e of eventos) {
    const d = new Date(e.fecha.getTime() - 5 * 3_600_000).getUTCDate();
    porDia.set(d, [...(porDia.get(d) ?? []), e]);
  }
  const hoyDia = n.year === anio && n.month === mes ? n.day : -1;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={`/mantenimiento/calendario?mes=${prev}`} className="inline-flex size-11 items-center justify-center rounded-lg border hover:bg-muted" aria-label="Mes anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <h2 className="text-lg font-semibold capitalize">{mesNombre(`${anio}-${String(mes).padStart(2, "0")}`)}</h2>
        <Link href={`/mantenimiento/calendario?mes=${next}`} className="inline-flex size-11 items-center justify-center rounded-lg border hover:bg-muted" aria-label="Mes siguiente">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <Leyenda cls="border-l-blue-500 bg-blue-500/5" t="Orden programada" />
        <Leyenda cls="border-l-muted-foreground/40 bg-muted/40" t="Plan (proyectado)" />
        <Leyenda cls="border-l-primary bg-primary/5" t="Legal" />
        <Leyenda cls="border-l-success bg-success/5" t="Completada" />
        <Leyenda cls="border-l-destructive bg-destructive/5" t="Vencida" />
      </div>

      {/* Móvil: agenda */}
      <div className="md:hidden">
        {eventos.length === 0 && <EmptyState titulo="Sin mantenimientos este mes" />}
        <ul className="space-y-3">
          {[...porDia.entries()].map(([dia, evs]) => (
            <li key={dia}>
              <p className={cn("mb-1 text-sm font-semibold", dia === hoyDia && "text-primary")}>
                {DIAS[(primerDia + dia - 1) % 7]} {dia}
                {dia === hoyDia && " · hoy"}
              </p>
              <ul className="space-y-1.5">
                {evs.map((e, i) => (
                  <li key={i}>
                    <Link href={e.href} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-lg border border-l-4 p-2.5 text-sm", color(e))}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{e.titulo}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.tipo === "PLAN" ? "Plan" : "Orden"}
                          {e.mantenimiento ? ` · ${label(e.mantenimiento).toLowerCase()}` : ""}
                        </span>
                      </span>
                      <StatusBadge value={e.estado} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>

      {/* Escritorio: cuadrícula */}
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <div className="grid grid-cols-7 bg-muted/50 text-center text-xs font-medium text-muted-foreground">
          {DIAS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: primerDia }).map((_, i) => (
            <div key={`v${i}`} className="min-h-28 border-t border-r bg-muted/20" />
          ))}
          {Array.from({ length: diasMes }, (_, i) => i + 1).map((dia) => (
            <div key={dia} className={cn("min-h-28 border-t border-r p-1.5", dia === hoyDia && "bg-primary/5")}>
              <p className={cn("mb-1 text-xs font-semibold", dia === hoyDia && "text-primary")}>{dia}</p>
              <ul className="space-y-1">
                {(porDia.get(dia) ?? []).slice(0, 4).map((e, i) => (
                  <li key={i}>
                    <Link href={e.href} title={e.titulo} className={cn("block truncate rounded border-l-4 px-1.5 py-0.5 text-[11px] hover:underline", color(e))}>
                      {e.titulo}
                    </Link>
                  </li>
                ))}
                {(porDia.get(dia)?.length ?? 0) > 4 && <li className="text-[11px] text-muted-foreground">+{porDia.get(dia)!.length - 4} más</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Leyenda({ cls, t }: { cls: string; t: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-3 w-4 rounded-sm border border-l-4", cls)} /> {t}
    </span>
  );
}
