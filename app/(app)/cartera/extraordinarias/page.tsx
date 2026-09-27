import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha, periodoActual, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { sumarMeses } from "@/lib/cartera/calculos";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { MoneyField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Medidor } from "@/components/charts/charts";
import { anularExtraordinariaAction, crearExtraordinariaAction } from "../actions";

export const metadata = { title: "Cuotas extraordinarias" };

export default async function ExtraordinariasPage() {
  const ctx = await requirePage("cartera.ver_todos");
  const cfg = conjuntoConfig(ctx);
  const [extras, asambleas] = await Promise.all([
    ctx.db.cuotaExtraordinaria.findMany({ orderBy: { createdAt: "desc" } }),
    ctx.db.asamblea.findMany({ orderBy: { fecha: "desc" }, take: 20, select: { id: true, titulo: true, fecha: true } }),
  ]);
  const stats = extras.length
    ? await ctx.db.cuota.groupBy({ by: ["cuotaExtraordinariaId"], where: { cuotaExtraordinariaId: { in: extras.map((e) => e.id) }, estado: { not: "ANULADA" } }, _sum: { valorBase: true, saldo: true }, _count: { _all: true } })
    : [];
  const st = new Map(stats.map((s) => [s.cuotaExtraordinariaId, s]));
  const asamb = new Map(asambleas.map((a) => [a.id, a]));
  const siguiente = sumarMeses(periodoActual(), 1);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">Cuotas aprobadas por la asamblea (Ley 675, art. 38): se distribuyen por coeficiente, en partes iguales o manualmente, y pueden fraccionarse en varios meses.</p>
        {can(ctx, "cartera.generar") && (
          <FormDialog
            titulo="Nueva cuota extraordinaria"
            descripcion="Se generarán las cuotas de cada unidad de inmediato (una por mes si se fracciona)."
            action={crearExtraordinariaAction}
            triggerLabel="Nueva extraordinaria"
            submitLabel="Crear y generar cuotas"
            successMessage="Cuota extraordinaria generada"
            confirm="¿Crear la cuota extraordinaria y generar las cuotas de todas las unidades?"
            wide
          >
            <TextField name="nombre" label="Nombre" placeholder="Ej.: Impermeabilización de cubiertas" required />
            <TextAreaField name="motivo" label="Motivo" />
            <SelectField name="asambleaId" label="Asamblea que la aprobó" options={asambleas.map((a) => ({ value: a.id, label: `${a.titulo} (${fecha(a.fecha)})` }))} placeholder="Sin asamblea vinculada" />
            <FormGrid>
              <MoneyField name="valorTotal" label="Valor total a distribuir" hint="No aplica para distribución manual" />
              <SelectField
                name="distribucion"
                label="Distribución"
                options={[
                  { value: "POR_COEFICIENTE", label: "Por coeficiente de copropiedad" },
                  { value: "IGUAL_POR_UNIDAD", label: "Igual para todas las unidades" },
                  { value: "MANUAL", label: "Manual (valor por unidad)" },
                ]}
                defaultValue="POR_COEFICIENTE"
                placeholder={false}
                required
              />
              <SelectField name="numeroCuotas" label="Número de cuotas" options={[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => ({ value: String(n), label: n === 1 ? "Una sola cuota" : `${n} cuotas mensuales` }))} defaultValue="1" placeholder={false} required />
              <TextField name="primerPeriodo" label="Primer mes" type="month" defaultValue={siguiente} required />
              <TextField name="diaVencimiento" label="Día de vencimiento" type="number" min={1} max={28} defaultValue={cfg.cartera.diaVencimiento} required />
            </FormGrid>
            <TextAreaField name="manualTexto" label="Distribución manual" hint="Una línea por unidad: código;valor total. Ej.: T1-101;250000" placeholder={"T1-101;250000\nT1-102;250000"} />
          </FormDialog>
        )}
      </div>
      {extras.length === 0 ? (
        <EmptyState titulo="No hay cuotas extraordinarias" descripcion="Cuando la asamblea apruebe una, créala aquí y se cobrará a todas las unidades." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {extras.map((e) => {
            const s = st.get(e.id);
            const total = toNumber(s?._sum.valorBase);
            const saldo = toNumber(s?._sum.saldo);
            const recaudo = total > 0 ? ((total - saldo) / total) * 100 : 0;
            const a = e.asambleaId ? asamb.get(e.asambleaId) : null;
            return (
              <li key={e.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{e.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {label(e.distribucion)} · {e.numeroCuotas} cuota(s) desde {fecha(e.fechaPrimeraCuota)}
                      {a ? ` · Aprobada en: ${a.titulo}` : ""}
                    </p>
                  </div>
                  <p className="text-right font-semibold tabular-nums">{cop(e.valorTotal)}</p>
                </div>
                {e.motivo && <p className="mt-2 text-sm text-muted-foreground">{e.motivo}</p>}
                <div className="mt-3">
                  <Medidor label={`Recaudado ${cop(total - saldo)} · pendiente ${cop(saldo)}`} valor={recaudo} tono={recaudo >= 90 ? "good" : "primary"} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" render={<a href={`/api/export/cartera-cuotas?formato=xlsx&q=${encodeURIComponent(e.nombre)}`} />}>
                    Exportar cuotas
                  </Button>
                  {can(ctx, "cartera.anular") && (
                    <FormDialog
                      titulo="Anular cuota extraordinaria"
                      descripcion="Se anularán todas sus cuotas. No es posible si alguna ya tiene pagos."
                      action={anularExtraordinariaAction}
                      extra={{ id: e.id }}
                      trigger={
                        <Button size="sm" variant="ghost" className="text-destructive">
                          Anular
                        </Button>
                      }
                      submitLabel="Anular"
                      confirm="¿Anular la cuota extraordinaria y todas sus cuotas?"
                      successMessage="Cuota extraordinaria anulada"
                    >
                      <TextAreaField name="motivo" label="Motivo" required />
                    </FormDialog>
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
