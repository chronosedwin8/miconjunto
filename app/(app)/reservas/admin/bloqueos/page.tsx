import { Trash2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fechaHora, isoDate } from "@/lib/format";
import { label } from "@/lib/labels";
import { describirRegla, festivosColombia, REGLA_LABEL } from "@/lib/reservas/reglas";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, SelectField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { bloquearFestivosAction, crearBloqueoAction, eliminarBloqueoAction, eliminarReglaAction, guardarReglaAction } from "../../actions";

export const metadata = { title: "Bloqueos y reglas de reservas" };

function Zonas({ zonas }: { zonas: { id: string; nombre: string }[] }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium">Zonas</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {zonas.map((z) => (
          <label key={z.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="checkbox" name="zonaIds[]" value={z.id} className="size-5 accent-[var(--brand)]" />
            {z.nombre}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default async function BloqueosPage() {
  const ctx = await requirePage("reservas.bloquear");
  const anio = new Date().getFullYear();
  const [zonas, bloqueos, reglas] = await Promise.all([
    ctx.db.zonaComun.findMany({ where: { reservable: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    ctx.db.bloqueoZona.findMany({ where: { fin: { gt: new Date() } }, include: { zona: { select: { nombre: true } } }, orderBy: { inicio: "asc" }, take: 100 }),
    ctx.db.reglaReserva.findMany({ where: { activa: true }, include: { zona: { select: { nombre: true } } } }),
  ]);
  const festivos = festivosColombia(anio).filter((f) => f.fecha >= isoDate(new Date()));
  const hoy = isoDate(new Date());
  return (
    <>
      <PageHeader titulo="Bloqueos y reglas" descripcion="Mantenimientos, eventos del conjunto, festivos y reglas extra por zona." volver="/reservas/admin" />
      <Section
        titulo="Fechas bloqueadas"
        acciones={
          <div className="flex gap-2">
            <FormDialog titulo={`Bloquear festivos ${anio}`} descripcion={`${festivos.length} festivos restantes: ${festivos.map((f) => f.fecha.slice(5)).join(", ")}`} action={bloquearFestivosAction} extra={{ anio }} triggerLabel="Festivos" triggerVariant="outline" triggerSize="sm" successMessage="Festivos bloqueados">
              <Zonas zonas={zonas} />
            </FormDialog>
            <FormDialog titulo="Nuevo bloqueo" action={crearBloqueoAction} triggerLabel="Bloquear" triggerSize="sm" successMessage="Bloqueo creado">
              <Zonas zonas={zonas} />
              <SelectField name="tipo" label="Tipo" options={[{ value: "MANTENIMIENTO", label: "Mantenimiento" }, { value: "EVENTO", label: "Evento del conjunto" }, { value: "FESTIVO", label: "Festivo" }, { value: "OTRO", label: "Otro" }]} defaultValue="MANTENIMIENTO" placeholder={false} />
              <TextField name="motivo" label="Motivo" required placeholder="Ej.: mantenimiento de la piscina" />
              <div className="grid grid-cols-2 gap-3">
                <TextField name="desde" type="datetime-local" label="Desde" required defaultValue={`${hoy}T00:00`} />
                <TextField name="hasta" type="datetime-local" label="Hasta" required defaultValue={`${hoy}T23:59`} />
              </div>
              <CheckboxField name="cancelarAfectadas" label="Cancelar reservas afectadas" hint="Se cancelan con reembolso total y se avisa a los residentes" />
            </FormDialog>
          </div>
        }
      >
        {bloqueos.length === 0 ? (
          <EmptyState titulo="Sin bloqueos vigentes" descripcion="Bloquea fechas por mantenimiento, eventos o festivos." />
        ) : (
          <ul className="space-y-2">
            {bloqueos.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {b.zona.nombre} <Badge variant="warning">{label(b.tipo)}</Badge>
                  </p>
                  <p className="text-muted-foreground">{b.motivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {fechaHora(b.inicio)} → {fechaHora(b.fin)}
                  </p>
                </div>
                <ActionButton action={eliminarBloqueoAction} input={{ id: b.id }} variant="ghost" size="icon" confirm="¿Quitar este bloqueo?" successMessage="Bloqueo eliminado">
                  <Trash2 />
                  <span className="sr-only">Quitar bloqueo</span>
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        titulo="Reglas extra por zona"
        acciones={
          (can(ctx, "reservas.bloquear") || can(ctx, "zonas.editar")) && (
            <FormDialog titulo="Nueva regla" action={guardarReglaAction} triggerLabel="Agregar regla" triggerSize="sm" successMessage="Regla guardada">
              <SelectField name="zonaId" label="Zona" required options={zonas.map((z) => ({ value: z.id, label: z.nombre }))} />
              <SelectField name="tipo" label="Regla" required options={Object.entries(REGLA_LABEL).map(([value, l]) => ({ value, label: l }))} />
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Días permitidos (solo para “Solo algunos días”)</legend>
                <div className="grid grid-cols-4 gap-1.5">
                  {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d, i) => (
                    <label key={d} className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="checkbox" name="dias[]" value={i} className="size-4 accent-[var(--brand)]" /> {d}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextField name="max" type="number" inputMode="numeric" label="Máximo de asistentes (solo para esa regla)" />
              <TextField name="descripcion" label="Texto para el residente (opcional)" />
            </FormDialog>
          )
        }
      >
        {reglas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay reglas extra. La capacidad, horario, duración y anticipación se configuran en cada zona común.</p>
        ) : (
          <ul className="space-y-2">
            {reglas.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{r.zona.nombre}</p>
                  <p className="text-muted-foreground">{describirRegla(r)}</p>
                </div>
                <ActionButton action={eliminarReglaAction} input={{ id: r.id }} variant="ghost" size="icon" confirm="¿Quitar esta regla?" successMessage="Regla eliminada">
                  <Trash2 />
                  <span className="sr-only">Quitar regla</span>
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
