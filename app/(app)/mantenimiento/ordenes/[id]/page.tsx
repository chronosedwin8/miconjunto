import Link from "next/link";
import { CalendarClock, ExternalLink, MapPin, Phone, User } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { zonaOptions } from "@/lib/conjunto/options";
import { activoOptions, fichaOrden, proveedorOptions, responsablesOptions } from "@/lib/mantenimiento/service";
import { ordenAtrasada } from "@/lib/mantenimiento/calculos";
import { cop, fecha, fechaHora, startOfDayBogota, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { OrdenFields } from "../../orden-fields";
import { cancelarOrdenAction, guardarOrdenAction } from "../../actions";
import { Ejecucion } from "./ejecucion";

export const metadata = { title: "Orden de trabajo" };

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("mantenimiento.ver");
  const { id } = await params;
  const o = await fichaOrden(ctx, id);
  const gestiona = can(ctx, "mantenimiento.gestionar");
  const ejecuta = can(ctx, ["mantenimiento.ejecutar", "mantenimiento.gestionar"]);
  const verCosto = can(ctx, ["mantenimiento.ver_todos", "presupuesto.ver"]) || ctx.rolBase === "PROVEEDOR";
  const abierta = !["COMPLETADA", "CANCELADA"].includes(o.estado);
  const atrasada = ordenAtrasada(o, startOfDayBogota());
  const [activos, zonas, proveedores, responsables] = gestiona && abierta ? await Promise.all([activoOptions(ctx), zonaOptions(ctx), proveedorOptions(ctx), responsablesOptions(ctx)]) : [[], [], [], []];

  return (
    <>
      <Link href="/mantenimiento" className="mb-1 inline-flex min-h-8 items-center text-sm text-muted-foreground">
        ← Órdenes
      </Link>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge value={o.estado} />
          {o.plan && <StatusBadge value={o.plan.tipo} />}
          <span className="text-xs text-muted-foreground">
            OT #{o.numero} · {label(o.origen)}
          </span>
        </div>
        <h2 className="mt-1 text-xl font-bold leading-tight">{o.titulo}</h2>
        <div className="mt-2 space-y-1 text-sm">
          <p className={atrasada ? "flex items-center gap-2 font-semibold text-destructive" : "flex items-center gap-2 text-muted-foreground"}>
            <CalendarClock className="size-4" aria-hidden /> Programada para el {fecha(o.fechaProgramada)}
            {atrasada && " · atrasada"}
          </p>
          {(o.activo || o.zona) && (
            <p className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {o.activo ? (
                  can(ctx, "activos.ver") ? (
                    <Link href={`/activos/${o.activo.id}`} className="text-primary">
                      {o.activo.nombre}
                    </Link>
                  ) : (
                    o.activo.nombre
                  )
                ) : null}
                {[o.activo?.ubicacion, o.zona?.nombre].filter(Boolean).length > 0 && ` · ${[o.activo?.ubicacion, o.zona?.nombre].filter(Boolean).join(" · ")}`}
              </span>
            </p>
          )}
          {(o.asignado || o.proveedor) && (
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <User className="size-4" aria-hidden />
              {[o.asignado?.nombre, o.proveedor?.razonSocial].filter(Boolean).join(" · ")}
              {o.proveedor?.telefono && (
                <a href={`tel:${o.proveedor.telefono}`} className="inline-flex items-center gap-1 text-primary">
                  <Phone className="size-3.5" /> {o.proveedor.telefono}
                </a>
              )}
            </p>
          )}
        </div>
        {o.descripcion && <p className="mt-3 whitespace-pre-line rounded-xl bg-muted/50 p-3 text-sm">{o.descripcion}</p>}
      </div>

      {o.ticket && (
        <Section titulo="Reporte de origen">
          <Link href={`/tickets/${o.ticket.id}`} className="block rounded-xl border bg-card p-3 text-sm hover:bg-muted/50">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">
                {o.ticket.radicado} · {o.ticket.titulo}
              </p>
              <StatusBadge value={o.ticket.estado} />
            </div>
            <p className="mt-1 line-clamp-3 text-muted-foreground">{o.ticket.descripcion}</p>
          </Link>
          {o.ticket.adjuntos.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {o.ticket.adjuntos.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener">
                  { }
                  <img src={u} alt="Foto del reporte" className="size-20 rounded-lg border object-cover" />
                </a>
              ))}
            </div>
          )}
        </Section>
      )}

      {ejecuta ? (
        <Ejecucion id={o.id} estado={o.estado} checklist={o.checklistItems} evidencias={o.evidencias} costo={o.costo !== null ? toNumber(o.costo) : null} verCosto={verCosto} />
      ) : (
        <p className="text-sm text-muted-foreground">Solo lectura.</p>
      )}

      {!abierta && (
        <Section titulo="Cierre" className="mt-6">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Inicio</dt>
              <dd>{fechaHora(o.fechaInicio)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cierre</dt>
              <dd>{fechaHora(o.fechaCierre)}</dd>
            </div>
            {verCosto && (
              <div>
                <dt className="text-xs text-muted-foreground">Costo</dt>
                <dd className="font-semibold">{o.costo ? cop(o.costo) : "Sin costo"}</dd>
              </div>
            )}
            {o.gasto && can(ctx, "presupuesto.ver") && (
              <div>
                <dt className="text-xs text-muted-foreground">Gasto</dt>
                <dd>
                  <Link href="/presupuesto/gastos" className="inline-flex items-center gap-1 text-primary">
                    <StatusBadge value={o.gasto.estado} /> <ExternalLink className="size-3.5" />
                  </Link>
                </dd>
              </div>
            )}
            {o.notasCierre && <p className="col-span-2 whitespace-pre-line">{o.notasCierre}</p>}
          </dl>
        </Section>
      )}

      {gestiona && abierta && (
        <div className="mt-6 flex flex-wrap gap-2">
          <FormDialog
            titulo={`Editar orden #${o.numero}`}
            action={guardarOrdenAction}
            extra={{ id: o.id }}
            triggerLabel="Editar / asignar"
            triggerVariant="outline"
            successMessage="Orden actualizada"
            wide
          >
            <OrdenFields
              o={{ ...o, checklist: o.checklistItems.map((c) => c.item) }}
              activos={activos}
              zonas={zonas}
              proveedores={proveedores}
              responsables={responsables}
            />
          </FormDialog>
          <FormDialog titulo="Cancelar orden" action={cancelarOrdenAction} extra={{ id: o.id }} trigger={<Button variant="ghost" className="text-destructive">Cancelar orden</Button>} submitLabel="Cancelar orden" successMessage="Orden cancelada" confirm="¿Cancelar esta orden de trabajo?">
            <TextField name="motivo" label="Motivo" required />
          </FormDialog>
        </div>
      )}
    </>
  );
}
