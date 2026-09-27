import Link from "next/link";
import { AlertTriangle, PiggyBank } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { aniosConPresupuesto, ejecucion } from "@/lib/presupuesto/service";
import { cop, nowBogota, pct, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { AnioSelector, aniosDisponibles } from "./anio-selector";
import { Barras } from "./graficos";
import { aprobarPresupuestoAction, crearPresupuestoAction } from "./actions";

export const metadata = { title: "Ejecución presupuestal" };

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const GRIS = "color-mix(in oklab, var(--muted-foreground) 45%, transparent)";

export default async function EjecucionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("presupuesto.ver");
  const sp = await searchParams;
  const hoy = nowBogota().year;
  const anio = Number(spGet(sp, "anio")) || hoy;
  const [anios, e] = await Promise.all([aniosConPresupuesto(ctx), ejecucion(ctx, anio)]);

  if (!e) {
    return (
      <>
        <AnioSelector anios={aniosDisponibles(anios, hoy)} actual={anio} base="/presupuesto" />
        <EmptyState
          icon={PiggyBank}
          titulo={`No hay presupuesto ${anio}`}
          descripcion="Crea el presupuesto anual con sus rubros de ingresos y gastos (puedes copiar el de otro año con un incremento)."
          accion={
            can(ctx, "presupuesto.editar") ? (
              <FormDialog titulo={`Presupuesto ${anio}`} action={crearPresupuestoAction} extra={{ anio }} triggerLabel="Crear presupuesto" successMessage="Presupuesto creado">
                <SelectField name="copiarDe" label="Copiar rubros de" options={anios.map((a) => ({ value: String(a), label: String(a) }))} placeholder="Empezar vacío" />
                <TextField name="incrementoPct" label="Incremento (%)" inputMode="decimal" defaultValue="5" hint="Se aplica a los valores copiados (p. ej. IPC + ajuste)." />
                <TextAreaField name="notas" label="Notas" />
              </FormDialog>
            ) : undefined
          }
        />
      </>
    );
  }

  const gastos = e.filas.filter((f) => f.tipo === "GASTO");
  const ingresos = e.filas.filter((f) => f.tipo === "INGRESO");
  const mesesMostrar = e.mesesTranscurridos;

  return (
    <>
      <AnioSelector anios={aniosDisponibles(anios, hoy)} actual={anio} base="/presupuesto" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge value={e.presupuesto.estado} />
        <span className="text-sm text-muted-foreground">
          Presupuesto {anio} · {mesesMostrar} {mesesMostrar === 1 ? "mes" : "meses"} transcurridos
        </span>
        {can(ctx, "presupuesto.aprobar_gastos") && e.presupuesto.estado === "BORRADOR" && (
          <FormDialog titulo="Aprobar presupuesto" action={aprobarPresupuestoAction} extra={{ id: e.presupuesto.id, estado: "APROBADO" }} triggerLabel="Aprobar" triggerSize="sm" triggerVariant="outline" submitLabel="Aprobar presupuesto" confirm={`¿Aprobar el presupuesto ${anio}?`}>
            <TextAreaField name="notas" label="Acta o nota de aprobación" defaultValue={e.presupuesto.notas ?? ""} placeholder="Aprobado en asamblea ordinaria del 15 de marzo" />
          </FormDialog>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" render={<a href={`/api/export/presupuesto?formato=xlsx&anio=${anio}`} />}>
          Descargar Excel
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Ingresos recaudados" value={<span className="whitespace-nowrap text-lg sm:text-2xl">{cop(e.ingresos.ejecutado)}</span>} hint={`${pct(e.ingresos.pct)} de ${cop(e.ingresos.presupuestado)}`} tone={e.ingresos.pctALaFecha < 90 ? "warning" : "success"} />
        <StatCard label="Gastos ejecutados" value={<span className="whitespace-nowrap text-lg sm:text-2xl">{cop(e.gastos.ejecutado)}</span>} hint={`${pct(e.gastos.pct)} de ${cop(e.gastos.presupuestado)}`} tone={e.gastos.pctALaFecha > 105 ? "danger" : "default"} />
        <StatCard label="Resultado del año" value={<span className="whitespace-nowrap text-lg sm:text-2xl">{cop(e.superavit)}</span>} hint={e.superavit >= 0 ? "Superávit" : "Déficit"} tone={e.superavit >= 0 ? "success" : "danger"} />
        <StatCard label="Gastos por aprobar" value={e.pendientesAprobacion.cantidad} hint={cop(e.pendientesAprobacion.valor)} tone={e.pendientesAprobacion.cantidad ? "warning" : "default"} href="/presupuesto/gastos?estado=PENDIENTE_APROBACION" />
      </div>

      <Section titulo="Ingresos y gastos por mes">
        <div className="rounded-xl border bg-card p-3">
          <Barras
            categoria="mes"
            datos={MESES.slice(0, Math.max(mesesMostrar, 1)).map((m, i) => ({ mes: m, Ingresos: e.ingresos.porMes[i], Gastos: e.gastos.porMes[i] }))}
            series={[
              { key: "Ingresos", nombre: "Ingresos recaudados", color: "var(--primary)" },
              { key: "Gastos", nombre: "Gastos ejecutados", color: "color-mix(in oklab, var(--warning) 80%, black)" },
            ]}
          />
        </div>
      </Section>

      <Section titulo="Gastos: presupuesto a la fecha vs. ejecutado">
        <div className="rounded-xl border bg-card p-3">
          <Barras
            horizontal
            categoria="rubro"
            datos={gastos.map((f) => ({ rubro: f.nombre, "A la fecha": f.presupuestadoALaFecha, Ejecutado: f.ejecutado }))}
            series={[
              { key: "A la fecha", nombre: "Presupuesto a la fecha", color: GRIS },
              { key: "Ejecutado", nombre: "Ejecutado", color: "var(--primary)" },
            ]}
          />
        </div>
      </Section>

      {[
        { titulo: "Rubros de ingresos", filas: ingresos },
        { titulo: "Rubros de gastos", filas: gastos },
      ].map((g) => (
        <Section key={g.titulo} titulo={g.titulo}>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {g.filas.length === 0 && <li className="p-4 text-muted-foreground">Sin rubros.</li>}
            {g.filas.map((f) => (
              <li key={f.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-medium">
                    {f.nombre} {f.cuentaContable && <span className="text-xs font-normal text-muted-foreground">· {f.cuentaContable}</span>}
                  </p>
                  {f.alerta && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="size-3.5" aria-hidden /> {f.alerta === "BAJO" ? "Recaudo bajo" : label(f.alerta)}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={f.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Ejecución de ${f.nombre}`}>
                  <div className={cn("h-full rounded-full", f.pct > 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, f.pct)}%` }} />
                </div>
                <p className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
                  <span>
                    {cop(f.ejecutado)} de {cop(toNumber(f.valorAnual))} ({pct(f.pct)})
                  </span>
                  <span>A la fecha: {pct(f.pctALaFecha)}</span>
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ))}
      {(e.ingresosSinRubro > 0 || e.gastosSinRubro > 0) && (
        <p className="text-xs text-muted-foreground">
          Sin rubro asignado: ingresos {cop(e.ingresosSinRubro)} · gastos {cop(e.gastosSinRubro)}.{" "}
          <Link href="/presupuesto/rubros" className="text-primary">
            Revisa las cuentas contables de los rubros
          </Link>{" "}
          (los ingresos se relacionan por la cuenta del concepto de cobro).
        </p>
      )}
    </>
  );
}
