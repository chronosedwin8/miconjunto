import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha, isoDate, mesNombre, pct, periodoActual, toNumber } from "@/lib/format";
import { estadoTasaMora, ibcDeFuente, textoTasa } from "@/lib/cartera/mora";
import { tasaMaximaMora } from "@/lib/cartera/calculos";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataList } from "@/components/app/data-list";
import { FormDialog } from "@/components/app/form-dialog";
import { FormGrid, TextField } from "@/components/form/fields";
import { Lineas } from "@/components/charts/charts";
import { registrarTasaAction } from "../actions";

export const metadata = { title: "Tasa de mora" };

export default async function TasaMoraPage() {
  const ctx = await requirePage("cartera.ver_todos");
  const [e, historial] = await Promise.all([estadoTasaMora(ctx), ctx.db.tasaMora.findMany({ orderBy: [{ vigenteDesde: "desc" }, { createdAt: "desc" }], take: 24 })]);
  const cfg = conjuntoConfig(ctx);
  const periodo = periodoActual();
  const primeroMes = new Date(`${periodo}-01T00:00:00-05:00`);
  const serie = [...historial].reverse().map((t) => ({ desde: fecha(t.vigenteDesde).slice(3), "Tasa E.A.": toNumber(t.tasaEfectivaAnual), "Máximo legal": ibcDeFuente(t.fuente) ? tasaMaximaMora(ibcDeFuente(t.fuente)!) : null }));
  return (
    <>
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3 text-sm ${e.actualizadaEsteMes && !e.excedeMaximo ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/10"}`}>
        {e.actualizadaEsteMes && !e.excedeMaximo ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />}
        <div>
          <p className="font-medium">
            {e.excedeMaximo ? "La tasa vigente supera el máximo legal." : e.actualizadaEsteMes ? `Tasa de ${mesNombre(periodo)} registrada.` : `Falta registrar la tasa de ${mesNombre(periodo)}.`}
          </p>
          <p className="text-muted-foreground">
            La Superintendencia Financiera certifica cada mes el interés bancario corriente (IBC). El interés de mora de las expensas no puede superar 1,5 veces ese valor (Ley 675 de 2001, art. 30; Código de Comercio, art. 884). El sistema
            liquida la mora cada día con la tasa vigente en cada fecha.
          </p>
          {e.cambioReciente && e.anterior && (
            <p className="mt-1">
              Cambió de {pct(e.anterior.tasaEA, 2)} a {pct(e.vigente.tasaEA, 2)} E.A. el {fecha(e.vigente.vigenteDesde)}.
            </p>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tasa vigente (E.A.)" value={pct(e.vigente.tasaEA, 2)} hint={e.vigente.vigenteDesde ? `desde el ${fecha(e.vigente.vigenteDesde)}` : "valor por defecto"} tone="primary" />
        <StatCard label="Tasa mensual" value={pct(e.vigente.tasaMensual, 3)} hint="equivalente, base de la liquidación diaria" />
        <StatCard label="IBC certificado" value={e.vigente.ibcEA ? pct(e.vigente.ibcEA, 2) : "—"} hint="Superintendencia Financiera" />
        <StatCard label="Máximo legal" value={e.maximoLegalEA ? pct(e.maximoLegalEA, 2) : "—"} hint="1,5 × IBC" tone={e.excedeMaximo ? "danger" : "default"} />
      </div>

      {can(ctx, "cartera.configurar") && (
        <div className="mb-6">
          <FormDialog
            titulo="Registrar tasa del mes"
            descripcion="Escribe el IBC efectivo anual certificado. Si dejas la tasa de mora vacía se usa la máxima legal (1,5 × IBC)."
            action={registrarTasaAction}
            triggerLabel="Registrar tasa del mes"
            submitLabel="Guardar tasa"
            successMessage="Tasa de mora registrada"
            confirm="¿Registrar esta tasa? Se aplicará a la liquidación de intereses desde la fecha indicada."
          >
            <FormGrid>
              <TextField name="ibcEA" label="IBC certificado (% E.A.)" inputMode="decimal" placeholder="Ej.: 16,52" defaultValue={e.vigente.ibcEA ? String(e.vigente.ibcEA).replace(".", ",") : ""} required />
              <TextField name="tasaEA" label="Tasa de mora (% E.A.)" inputMode="decimal" placeholder="Vacío = 1,5 × IBC" />
              <TextField name="vigenteDesde" label="Vigente desde" type="date" defaultValue={isoDate(primeroMes)} required />
              <TextField name="fuente" label="Fuente / resolución" placeholder="Ej.: Resolución 1234 de 2026" />
            </FormGrid>
          </FormDialog>
        </div>
      )}

      {serie.length > 1 && (
        <div className="mb-6">
          <Lineas titulo="Evolución de la tasa de mora" descripcion="% efectivo anual" data={serie} xKey="desde" series={[{ key: "Tasa E.A.", label: "Tasa de mora" }, { key: "Máximo legal", label: "Máximo legal" }]} formato="pct" alto={200} />
        </div>
      )}

      <Section titulo="Historial">
        <DataList
          rows={historial}
          rowKey={(t) => t.id}
          columns={[
            { key: "d", header: "Vigente desde", primary: true, cell: (t) => fecha(t.vigenteDesde) },
            { key: "e", header: "E.A.", align: "right", cell: (t) => pct(t.tasaEfectivaAnual, 2) },
            { key: "m", header: "Mensual", align: "right", cell: (t) => pct(t.tasaMensual, 3) },
            { key: "f", header: "Fuente", cell: (t) => t.fuente ?? "—" },
          ]}
        />
        <p className="mt-2 text-xs text-muted-foreground">Configuración actual: {textoTasa({ tasaMensual: cfg.cartera.tasaMoraMensual, tasaEA: cfg.cartera.tasaMoraEA })}. Días de gracia antes de causar mora: {cfg.cartera.diasGraciaMora}.</p>
      </Section>
    </>
  );
}
