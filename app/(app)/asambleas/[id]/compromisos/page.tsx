import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cuotasExtraordinarias, cuotasSinAsamblea, obtenerAsamblea } from "@/lib/asambleas/service";
import { parseCompromisos } from "@/lib/votaciones/calculos";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { SelectAction } from "@/components/form/select-action";
import { SelectField, TextField } from "@/components/form/fields";
import { cop, fecha } from "@/lib/format";
import { agregarCompromisoAction, estadoCompromisoAction, vincularCuotaAction } from "../../actions";

export const metadata = { title: "Compromisos" };

const ESTADOS = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "EN_CURSO", label: "En curso" },
  { value: "CUMPLIDO", label: "Cumplido" },
  { value: "ELIMINAR", label: "Eliminar…" },
];

export default async function CompromisosPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.ver");
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const gestor = can(ctx, "asambleas.gestionar");
  const compromisos = parseCompromisos(a.compromisos);
  const [cuotas, libres] = await Promise.all([cuotasExtraordinarias(ctx, id), gestor ? cuotasSinAsamblea(ctx) : Promise.resolve([])]);
  const hoy = new Date().toISOString().slice(0, 10);
  const cumplidos = compromisos.filter((c) => c.estado === "CUMPLIDO").length;
  const vencidos = compromisos.filter((c) => c.estado !== "CUMPLIDO" && c.fecha && c.fecha < hoy).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Compromisos" value={compromisos.length} />
        <StatCard label="Cumplidos" value={cumplidos} tone="success" />
        <StatCard label="Vencidos" value={vencidos} tone={vencidos ? "danger" : "default"} />
      </div>
      <Section
        titulo="Seguimiento de compromisos"
        acciones={
          gestor ? (
            <FormDialog titulo="Nuevo compromiso" action={agregarCompromisoAction} extra={{ asambleaId: id }} triggerLabel="Agregar">
              <TextField name="tarea" label="Tarea" required />
              <TextField name="responsable" label="Responsable" required placeholder="Administración, consejo, comité…" />
              <TextField name="fecha" label="Fecha límite" type="date" />
            </FormDialog>
          ) : null
        }
      >
        {compromisos.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No se registraron compromisos.</p>
        ) : (
          <ul className="space-y-2">
            {compromisos.map((c) => {
              const vencido = c.estado !== "CUMPLIDO" && c.fecha && c.fecha < hoy;
              return (
                <li key={c.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{c.tarea}</p>
                    <p className={vencido ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                      {c.responsable}
                      {c.fecha ? ` · ${vencido ? "venció" : "hasta"} el ${fecha(`${c.fecha}T12:00:00-05:00`)}` : ""}
                    </p>
                  </div>
                  {gestor ? (
                    <SelectAction action={estadoCompromisoAction} input={{ asambleaId: id, compromisoId: c.id }} field="estado" value={c.estado} options={ESTADOS} ariaLabel={`Estado de ${c.tarea}`} className="h-11 rounded-lg border bg-background px-2 text-sm" />
                  ) : (
                    <StatusBadge value={c.estado} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        titulo="Cuotas extraordinarias aprobadas en esta asamblea"
        acciones={
          gestor && libres.length ? (
            <FormDialog titulo="Enlazar cuota extraordinaria" descripcion="Elige la cuota creada en Cartera → Extraordinarias que aprobó esta asamblea." action={vincularCuotaAction} extra={{ asambleaId: id }} triggerLabel="Enlazar cuota" triggerVariant="outline">
              <SelectField name="cuotaExtraordinariaId" label="Cuota extraordinaria" options={libres.map((c) => ({ value: c.id, label: `${c.nombre} · ${cop(c.valorTotal)}` }))} required />
            </FormDialog>
          ) : null
        }
      >
        {cuotas.length ? (
          <ul className="space-y-2">
            {cuotas.map((c) => (
              <li key={c.id} className="rounded-xl border bg-card p-3 text-sm">
                <b>{c.nombre}</b> · {cop(c.valorTotal)} en {c.numeroCuotas} cuota(s) desde {fecha(c.fechaPrimeraCuota)} {c.generada ? "· generada" : "· pendiente de generar"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ninguna.{" "}
            {gestor && (
              <>
                Créala en{" "}
                <Link href={`/cartera/extraordinarias?asambleaId=${id}`} className="text-primary underline">
                  Cartera → Extraordinarias
                </Link>{" "}
                (requiere mayoría calificada del 70 %, art. 46) y enlázala aquí.
              </>
            )}
          </p>
        )}
      </Section>
    </div>
  );
}
