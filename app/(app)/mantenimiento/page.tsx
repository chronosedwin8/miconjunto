import Link from "next/link";
import { CalendarClock, ChevronRight, MapPin, Wrench } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { zonaOptions } from "@/lib/conjunto/options";
import { activoOptions, conteoOrdenes, listarOrdenes, proveedorOptions, responsablesOptions } from "@/lib/mantenimiento/service";
import { ordenAtrasada, parseChecklist } from "@/lib/mantenimiento/calculos";
import { cop, fecha, startOfDayBogota } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { OrdenFields } from "./orden-fields";
import { guardarOrdenAction } from "./actions";

export const metadata = { title: "Órdenes de trabajo" };

const VISTAS = [
  { value: "abiertas", label: "Abiertas" },
  { value: "atrasadas", label: "Atrasadas" },
  { value: "cerradas", label: "Cerradas" },
  { value: "todas", label: "Todas" },
];

export default async function OrdenesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("mantenimiento.ver");
  const sp = await searchParams;
  const vista = spGet(sp, "vista") ?? "abiertas";
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const filtros = { q: spGet(sp, "q"), estado: spGet(sp, "estado"), origen: spGet(sp, "origen"), activoId: spGet(sp, "activoId"), proveedorId: spGet(sp, "proveedorId"), vista };
  const puedeCrear = can(ctx, ["mantenimiento.crear", "mantenimiento.gestionar"]);
  const verCosto = can(ctx, ["mantenimiento.ver_todos", "presupuesto.ver"]) || ctx.rolBase === "PROVEEDOR";
  const [{ items, total }, conteo, activos, zonas, proveedores, responsables] = await Promise.all([
    listarOrdenes(ctx, filtros, { skip, take }),
    conteoOrdenes(ctx),
    puedeCrear ? activoOptions(ctx) : Promise.resolve([]),
    puedeCrear ? zonaOptions(ctx) : Promise.resolve([]),
    puedeCrear ? proveedorOptions(ctx) : Promise.resolve([]),
    puedeCrear ? responsablesOptions(ctx) : Promise.resolve([]),
  ]);
  const hoy = startOfDayBogota();
  const hrefVista = (v: string) => {
    const p = new URLSearchParams(Object.entries(spFlat(sp)).filter(([k, val]) => val && k !== "page" && k !== "vista") as [string, string][]);
    p.set("vista", v);
    return `/mantenimiento?${p.toString()}`;
  };
  const activoFiltrado = filtros.activoId ? await ctx.db.activo.findUnique({ where: { id: filtros.activoId }, select: { nombre: true } }) : null;

  return (
    <>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Contador href={hrefVista("abiertas")} n={conteo.abiertas} label="Abiertas" activo={vista === "abiertas"} />
        <Contador href={hrefVista("atrasadas")} n={conteo.atrasadas} label="Atrasadas" activo={vista === "atrasadas"} tono={conteo.atrasadas ? "danger" : undefined} />
        <Contador href={hrefVista("abiertas")} n={conteo.hoy} label="Para hoy" tono={conteo.hoy ? "primary" : undefined} />
      </div>
      <nav className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Vista">
        {VISTAS.map((v) => (
          <Link
            key={v.value}
            href={hrefVista(v.value)}
            aria-current={vista === v.value ? "page" : undefined}
            className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", vista === v.value ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <ListToolbar
        placeholder="Buscar por título, número o activo…"
        exportRecurso="ordenes"
        filters={[
          { name: "origen", label: "Origen", options: options(["PLAN", "TICKET", "MANUAL"]) },
          { name: "estado", label: "Estado", options: options(["PENDIENTE", "PROGRAMADA", "EN_PROCESO", "COMPLETADA", "CANCELADA"]) },
        ]}
      >
        {puedeCrear && (
          <FormDialog titulo="Nueva orden de trabajo" action={guardarOrdenAction} triggerLabel="Nueva orden" triggerSize="sm" redirectTo="/mantenimiento/ordenes/{id}" wide>
            <OrdenFields activos={activos} zonas={zonas} proveedores={proveedores} responsables={responsables} />
          </FormDialog>
        )}
      </ListToolbar>
      {activoFiltrado && (
        <p className="mb-3 text-sm text-muted-foreground">
          Órdenes de <b className="text-foreground">{activoFiltrado.nombre}</b> ·{" "}
          <Link href="/mantenimiento" className="text-primary">
            ver todas
          </Link>
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          titulo={vista === "atrasadas" ? "No hay órdenes atrasadas" : vista === "abiertas" ? "No tienes órdenes abiertas" : "No hay órdenes"}
          descripcion={vista === "abiertas" ? "Cuando te asignen un trabajo aparecerá aquí." : "Prueba con otra vista o filtro."}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 [&>li]:min-w-0">
          {items.map((o) => {
            const atrasada = ordenAtrasada(o, hoy);
            const check = parseChecklist(o.checklist);
            const hechos = check.filter((c) => c.ok).length;
            return (
              <li key={o.id}>
                <Link
                  href={`/mantenimiento/ordenes/${o.id}`}
                  className={cn("flex min-h-24 items-stretch gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50 active:opacity-80", atrasada && "border-destructive/40")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-snug">
                        <span className="text-muted-foreground">#{o.numero}</span> {o.titulo}
                      </p>
                      <StatusBadge value={o.estado} className="shrink-0" />
                    </div>
                    {(o.activo || o.proveedor) && (
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {[o.activo?.nombre, o.activo?.ubicacion, o.proveedor?.razonSocial].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={cn("inline-flex items-center gap-1", atrasada ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        <CalendarClock className="size-3.5" aria-hidden />
                        {o.estado === "COMPLETADA" ? `Cerrada ${fecha(o.fechaCierre)}` : `${atrasada ? "Atrasada · " : ""}${fecha(o.fechaProgramada)}`}
                      </span>
                      <span className="text-muted-foreground">{label(o.origen)}{o.plan?.tipo === "LEGAL" ? " legal" : ""}</span>
                      {check.length > 0 && <span className="text-muted-foreground">{hechos}/{check.length} ítems</span>}
                      {o.asignadoNombre && <span className="text-muted-foreground">{o.asignadoNombre}</span>}
                      {verCosto && o.costo && <span className="text-muted-foreground">{cop(o.costo)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="size-4 self-center text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/mantenimiento" />
    </>
  );
}

function Contador({ href, n, label: l, activo, tono }: { href: string; n: number; label: string; activo?: boolean; tono?: "danger" | "primary" }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-xl border bg-card p-3 text-center transition-colors hover:bg-muted/50",
        activo && "border-primary ring-2 ring-primary/20",
        tono === "danger" && "border-destructive/40 bg-destructive/5",
        tono === "primary" && "border-primary/30 bg-primary/5",
      )}
    >
      <p className={cn("text-2xl font-bold tabular-nums", tono === "danger" && "text-destructive", tono === "primary" && "text-primary")}>{n}</p>
      <p className="text-xs text-muted-foreground">{l}</p>
    </Link>
  );
}
