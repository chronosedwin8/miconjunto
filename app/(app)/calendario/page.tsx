import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock, MapPin, Pencil } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { addDays, hora, parseLocal, TZ } from "@/lib/format";
import { label } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";
import { zonaOptions } from "@/lib/conjunto/options";
import { agruparPorDia, diaKey, itemsCalendario, rangoVista, type ItemCalendario, type Vista } from "@/lib/calendario/service";
import { PageHeader } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CamposEvento } from "./_components/campos";
import { eliminarEventoAction, guardarEventoAction } from "./actions";

export const metadata = { title: "Calendario" };

const COLOR: Record<string, string> = {
  COMUNITARIO: "bg-violet-500",
  ASAMBLEA: "bg-blue-600",
  MANTENIMIENTO: "bg-amber-500",
  FUMIGACION: "bg-lime-600",
  CORTE_SERVICIO: "bg-destructive",
  OTRO: "bg-slate-500",
  RESERVA: "bg-primary",
  BLOQUEO: "bg-zinc-400",
};
const LEYENDA = ["COMUNITARIO", "ASAMBLEA", "MANTENIMIENTO", "FUMIGACION", "CORTE_SERVICIO", "RESERVA", "BLOQUEO"];
const etiqueta = (t: string) => (t === "RESERVA" ? "Reservas" : t === "BLOQUEO" ? "Zona no disponible" : label(t));

function horario(it: ItemCalendario) {
  if (it.todoElDia) return "Todo el día";
  const mismoDia = diaKey(it.inicio) === diaKey(new Date(it.fin.getTime() - 1));
  return mismoDia ? `${hora(it.inicio)} – ${hora(it.fin)}` : `${formatInTimeZone(it.inicio, TZ, "d MMM HH:mm", { locale: es })} – ${formatInTimeZone(it.fin, TZ, "d MMM HH:mm", { locale: es })}`;
}

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("calendario.ver");
  const sp = await searchParams;
  const vista = (["mes", "semana", "agenda"].includes(spGet(sp, "vista") ?? "") ? spGet(sp, "vista") : "agenda") as Vista;
  const hoy = diaKey(new Date());
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(spGet(sp, "fecha") ?? "") ? spGet(sp, "fecha")! : hoy;
  const { desde, hasta, dias } = rangoVista(vista, fecha);
  const [items, zonas] = await Promise.all([itemsCalendario(ctx, desde, hasta), can(ctx, ["calendario.crear", "calendario.editar"]) ? zonaOptions(ctx) : []]);
  const porDia = agruparPorDia(items, dias);
  const editables = can(ctx, "calendario.editar")
    ? new Map((await ctx.db.eventoCalendario.findMany({ where: { id: { in: items.filter((i) => i.origen === "EVENTO").map((i) => i.id) } } })).map((e) => [e.id, e]))
    : new Map();
  const base = parseLocal(fecha);
  const salto = vista === "mes" ? null : vista === "semana" ? 7 : 30;
  const mover = (dir: number) => {
    if (salto) return diaKey(addDays(base, dir * salto));
    const [y, m] = fecha.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dir, 15));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  };
  const href = (v: Vista, f: string) => `/calendario?vista=${v}&fecha=${f}`;
  const titulo =
    vista === "mes"
      ? formatInTimeZone(base, TZ, "MMMM yyyy", { locale: es })
      : vista === "semana"
        ? `Semana del ${formatInTimeZone(parseLocal(dias[0]), TZ, "d 'de' MMMM", { locale: es })}`
        : `Desde el ${formatInTimeZone(base, TZ, "d 'de' MMMM", { locale: es })}`;
  const mesActual = fecha.slice(0, 7);

  const Item = ({ it }: { it: ItemCalendario }) => (
    <li className="flex gap-3 rounded-xl border bg-card p-3">
      <span className={cn("mt-1 w-1.5 shrink-0 self-stretch rounded-full", COLOR[it.tipo] ?? "bg-slate-500")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{it.titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {horario(it)}
          </span>
          {it.lugar && it.origen === "EVENTO" && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {it.lugar}
            </span>
          )}
          <span>{etiqueta(it.origen === "EVENTO" ? it.tipo : it.origen)}</span>
        </p>
        {it.descripcion && <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{it.descripcion}</p>}
      </div>
      {it.editable && it.origen === "EVENTO" && <AccionesEvento id={it.id} />}
    </li>
  );

  function AccionesEvento({ id }: { id: string }) {
    const e = editables.get(id);
    if (!e) return null;
    return (
      <div className="flex shrink-0 flex-col gap-1">
        {can(ctx, "calendario.editar") && (
          <FormDialog
            titulo="Editar evento"
            action={guardarEventoAction}
            extra={{ id }}
            successMessage="Evento actualizado"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Editar evento">
                <Pencil />
              </Button>
            }
          >
            <CamposEvento zonas={zonas} inicial={e} />
          </FormDialog>
        )}
        {can(ctx, "calendario.editar") && (
          <ActionButton action={eliminarEventoAction} input={{ id }} variant="ghost" size="icon-sm" confirm={`¿Eliminar “${e.titulo}”?`} successMessage="Evento eliminado">
            <span aria-hidden>×</span>
            <span className="sr-only">Eliminar evento</span>
          </ActionButton>
        )}
      </div>
    );
  }

  const conItems = dias.filter((d) => (porDia.get(d)?.length ?? 0) > 0);

  return (
    <>
      <PageHeader
        titulo="Calendario"
        descripcion="Eventos del conjunto, mantenimientos, cortes de servicio y reservas de zonas comunes"
        acciones={
          can(ctx, "calendario.crear") ? (
            <FormDialog titulo="Nuevo evento" action={guardarEventoAction} triggerLabel="Nuevo evento" successMessage="Evento creado">
              <CamposEvento zonas={zonas} fechaSugerida={fecha} />
            </FormDialog>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Vista">
          {(["agenda", "semana", "mes"] as Vista[]).map((v) => (
            <Link key={v} href={href(v, fecha)} role="tab" aria-selected={vista === v} className={cn("inline-flex h-10 items-center rounded-md px-3 text-sm", vista === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {v === "agenda" ? "Agenda" : v === "semana" ? "Semana" : "Mes"}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link href={href(vista, mover(-1))} className="grid size-10 place-items-center rounded-lg border hover:bg-muted" aria-label="Anterior">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={href(vista, hoy)} className="inline-flex h-10 items-center rounded-lg border px-3 text-sm hover:bg-muted">
            Hoy
          </Link>
          <Link href={href(vista, mover(1))} className="grid size-10 place-items-center rounded-lg border hover:bg-muted" aria-label="Siguiente">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
      <h2 className="mb-3 text-lg font-semibold first-letter:uppercase">{titulo}</h2>

      {vista === "mes" && (
        <div className="mb-4 overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-[11px] font-medium text-muted-foreground">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const its = porDia.get(d) ?? [];
              const fuera = d.slice(0, 7) !== mesActual;
              return (
                <Link
                  key={d}
                  href={href("agenda", d)}
                  className={cn("min-h-16 border-b border-r p-1 text-left hover:bg-muted/50 sm:min-h-24", fuera && "bg-muted/30 text-muted-foreground")}
                  aria-label={`${d}: ${its.length} actividades`}
                >
                  <span className={cn("inline-grid size-6 place-items-center rounded-full text-xs", d === hoy && "bg-primary font-bold text-primary-foreground")}>{Number(d.slice(8))}</span>
                  <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                    {its.slice(0, 4).map((it) => (
                      <span key={it.id} className={cn("size-1.5 rounded-full", COLOR[it.tipo])} />
                    ))}
                  </div>
                  <ul className="mt-0.5 hidden space-y-0.5 sm:block">
                    {its.slice(0, 3).map((it) => (
                      <li key={it.id} className={cn("truncate rounded px-1 text-[11px] text-white", COLOR[it.tipo])}>
                        {it.titulo}
                      </li>
                    ))}
                    {its.length > 3 && <li className="text-[11px] text-muted-foreground">+{its.length - 3} más</li>}
                  </ul>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {vista !== "mes" && (
        <>
          {(vista === "semana" ? dias : conItems).length === 0 ? (
            <EmptyState titulo="Sin actividades" descripcion="No hay eventos ni reservas en este periodo." />
          ) : (
            <div className="space-y-4">
              {(vista === "semana" ? dias : conItems).map((d) => {
                const its = porDia.get(d) ?? [];
                return (
                  <section key={d} aria-label={d}>
                    <h3 className={cn("mb-1.5 text-sm font-semibold first-letter:uppercase", d === hoy && "text-primary")}>
                      {d === hoy ? "Hoy · " : ""}
                      {formatInTimeZone(parseLocal(d), TZ, "EEEE d 'de' MMMM", { locale: es })}
                    </h3>
                    {its.length ? (
                      <ul className="space-y-2">
                        {its.map((it) => (
                          <Item key={`${it.origen}-${it.id}`} it={it} />
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin actividades</p>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Convenciones">
        {LEYENDA.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", COLOR[t])} /> {etiqueta(t)}
          </li>
        ))}
      </ul>
    </>
  );
}
