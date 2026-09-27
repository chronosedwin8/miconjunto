import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarPlus, Pencil, ShieldCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { zonaOptions } from "@/lib/conjunto/options";
import { activoOptions, listarPlanes, proveedorOptions, responsablesOptions, vePlanes } from "@/lib/mantenimiento/service";
import { diasHasta } from "@/lib/mantenimiento/calculos";
import { cop, fecha, isoDate, startOfDayBogota, toNumber } from "@/lib/format";
import { options } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FormGrid, MoneyField, SearchSelect, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { eliminarPlanAction, generarOrdenAhoraAction, guardarPlanAction } from "../actions";

export const metadata = { title: "Plan de mantenimiento" };

type PlanRow = Awaited<ReturnType<typeof listarPlanes>>[number];

function PlanFields({ p, activos, zonas, proveedores, responsables, activoId }: { p?: PlanRow; activos: Option[]; zonas: Option[]; proveedores: Option[]; responsables: Option[]; activoId?: string }) {
  return (
    <>
      <TextField name="nombre" label="Nombre del mantenimiento" defaultValue={p?.nombre} placeholder="Certificación anual del ascensor" required />
      <FormGrid>
        <SelectField
          name="tipo"
          label="Tipo"
          options={[
            { value: "PREVENTIVO", label: "Preventivo" },
            { value: "LEGAL", label: "Legal (certificación, recarga, análisis)" },
            { value: "CORRECTIVO", label: "Correctivo programado" },
          ]}
          defaultValue={p?.tipo ?? "PREVENTIVO"}
          placeholder={false}
        />
        <SearchSelect name="activoId" label="Activo" options={activos} defaultValue={p?.activoId ?? activoId} />
        <SelectField name="zonaId" label="Zona (si no es un activo)" options={zonas} defaultValue={p?.zonaId} placeholder="Sin zona" />
        <TextField name="frecuenciaDias" label="Cada cuántos días" type="number" inputMode="numeric" defaultValue={p?.frecuenciaDias ?? 30} hint="30 mensual · 90 trimestral · 365 anual" required />
        <TextField name="proximaFecha" label="Próxima fecha" type="date" defaultValue={isoDate(p?.proximaFecha ?? new Date())} required />
        <TextField name="diasAnticipacion" label="Generar la orden con (días de anticipación)" type="number" inputMode="numeric" defaultValue={p?.diasAnticipacion ?? 7} />
        <SearchSelect name="responsableId" label="Responsable interno" options={responsables} defaultValue={p?.responsableId} />
        <SearchSelect name="proveedorId" label="Proveedor" options={proveedores} defaultValue={p?.proveedorId} />
        <MoneyField name="costoEstimado" label="Costo estimado" defaultValue={p?.costoEstimado ? toNumber(p.costoEstimado) : null} />
      </FormGrid>
      <TextAreaField name="checklistTexto" label="Lista de chequeo (un ítem por renglón)" defaultValue={(p?.checklist ?? []).join("\n")} />
      <CheckboxField name="activoPlan" label="Plan activo" hint="Si lo desactivas, no se generan más órdenes." defaultChecked={p?.activoPlan ?? true} />
    </>
  );
}

export default async function PlanesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("mantenimiento.ver");
  if (!vePlanes(ctx)) redirect("/mantenimiento");
  const sp = await searchParams;
  const filtros = { q: spGet(sp, "q"), tipo: spGet(sp, "tipo"), activoId: spGet(sp, "activoId"), estado: spGet(sp, "estado") };
  const resaltar = spGet(sp, "plan");
  const crea = can(ctx, "mantenimiento.crear");
  const generar = can(ctx, ["mantenimiento.crear", "mantenimiento.gestionar"]);
  const [planes, activos, zonas, proveedores, responsables] = await Promise.all([
    listarPlanes(ctx, filtros),
    crea ? activoOptions(ctx) : Promise.resolve([]),
    crea ? zonaOptions(ctx) : Promise.resolve([]),
    crea ? proveedorOptions(ctx) : Promise.resolve([]),
    crea ? responsablesOptions(ctx) : Promise.resolve([]),
  ]);
  const hoy = startOfDayBogota();
  const legalesAlerta = planes.filter((p) => p.activoPlan && p.tipo === "LEGAL" && diasHasta(p.proximaFecha, hoy) <= 30);
  const opts = { activos, zonas, proveedores, responsables };

  return (
    <>
      {legalesAlerta.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-warning" aria-hidden /> Obligaciones legales próximas
          </p>
          <ul className="space-y-0.5">
            {legalesAlerta.map((p) => {
              const d = diasHasta(p.proximaFecha, hoy);
              return (
                <li key={p.id}>
                  {p.nombre}
                  {p.activo ? ` · ${p.activo.nombre}` : ""}: <b className={d < 0 ? "text-destructive" : ""}>{d < 0 ? `vencida hace ${-d} días` : d === 0 ? "vence hoy" : `en ${d} días`}</b> ({fecha(p.proximaFecha)})
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <ListToolbar
        placeholder="Buscar plan o activo…"
        exportRecurso="planes-mantenimiento"
        filters={[
          { name: "tipo", label: "Tipo", options: options(["PREVENTIVO", "LEGAL", "CORRECTIVO"]) },
          { name: "estado", label: "Estado", options: [{ value: "vencidos", label: "Vencidos" }, { value: "inactivos", label: "Inactivos" }] },
        ]}
      >
        {crea && (
          <FormDialog titulo="Nuevo plan de mantenimiento" action={guardarPlanAction} triggerLabel="Nuevo plan" triggerSize="sm" wide successMessage="Plan creado">
            <PlanFields {...opts} activoId={filtros.activoId} />
          </FormDialog>
        )}
      </ListToolbar>
      {planes.length === 0 ? (
        <EmptyState titulo="Sin planes de mantenimiento" descripcion="Programa el mantenimiento preventivo y las obligaciones legales: certificación de ascensores, recarga de extintores, análisis de agua de la piscina, planta eléctrica." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 [&>li]:min-w-0">
          {planes.map((p) => {
            const d = diasHasta(p.proximaFecha, hoy);
            const vencido = p.activoPlan && d < 0;
            const abierta = p.ordenes[0];
            return (
              <li key={p.id} id={`plan-${p.id}`} className={cn("rounded-xl border bg-card p-3", vencido && "border-destructive/40", resaltar === p.id && "ring-2 ring-primary", !p.activoPlan && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.activo ? (
                        <Link href={`/activos/${p.activo.id}`} className="text-primary">
                          {p.activo.nombre}
                        </Link>
                      ) : (
                        "Zona común"
                      )}
                      {" · "}cada {p.frecuenciaDias} días
                    </p>
                  </div>
                  <StatusBadge value={p.activoPlan ? p.tipo : "INACTIVO"} className="shrink-0" />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Próxima</dt>
                    <dd className={cn("font-medium", vencido && "text-destructive")}>
                      {vencido && <AlertTriangle className="mr-1 inline size-3.5" aria-hidden />}
                      {fecha(p.proximaFecha)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Última</dt>
                    <dd>{fecha(p.ultimaEjecucion)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] text-muted-foreground">Responsable</dt>
                    <dd className="truncate">{p.proveedor?.razonSocial ?? p.responsableNombre ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Costo estimado</dt>
                    <dd>{p.costoEstimado ? cop(p.costoEstimado) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {abierta ? (
                    <Button size="sm" variant="outline" render={<Link href={`/mantenimiento/ordenes/${abierta.id}`} />}>
                      Orden #{abierta.numero} · <StatusBadge value={abierta.estado} />
                    </Button>
                  ) : (
                    generar &&
                    p.activoPlan && (
                      <ActionButton size="sm" variant="outline" action={generarOrdenAhoraAction} input={{ id: p.id }} successMessage="Orden generada" redirectTo="/mantenimiento/ordenes/{id}">
                        <CalendarPlus /> Generar orden ahora
                      </ActionButton>
                    )
                  )}
                  {crea && (
                    <FormDialog titulo="Editar plan" action={guardarPlanAction} extra={{ id: p.id }} wide trigger={<Button size="sm" variant="ghost"><Pencil /> Editar</Button>} successMessage="Plan actualizado">
                      <PlanFields p={p} {...opts} />
                    </FormDialog>
                  )}
                  {crea && (
                    <ActionButton size="sm" variant="ghost" className="text-destructive" action={eliminarPlanAction} input={{ id: p.id }} confirm={`¿Eliminar el plan "${p.nombre}"?`} successMessage="Plan eliminado">
                      Eliminar
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
