import { FileSpreadsheet } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { isoDate, mesNombre, periodoActual } from "@/lib/format";
import { sumarMeses } from "@/lib/cartera/calculos";
import { CUENTAS_DEFECTO, FORMATO_LABEL, FORMATOS_CONTABLES } from "@/lib/cartera/contable";
import { Section } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Exportación contable" };

const CUENTAS: { key: keyof typeof CUENTAS_DEFECTO; label: string }[] = [
  { key: "cartera", label: "Cuentas por cobrar (cartera)" },
  { key: "bancos", label: "Bancos" },
  { key: "caja", label: "Caja (efectivo)" },
  { key: "iva", label: "IVA generado" },
  { key: "descuentos", label: "Descuentos pronto pago" },
  { key: "anticipos", label: "Anticipos (saldos a favor)" },
];

export default async function ExportarContablePage() {
  await requirePage(["cartera.exportar", "pagos.exportar"]);
  const anterior = sumarMeses(periodoActual(), -1);
  const desde = `${anterior}-01`;
  const hasta = isoDate(new Date(new Date(`${periodoActual()}-01T00:00:00-05:00`).getTime() - 86_400_000));
  const input = "h-11 w-full rounded-lg border bg-background px-3";
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Comprobantes de partida doble de la cartera: causación de cuotas (débito cartera / crédito ingreso según la cuenta del concepto, IVA si aplica), recibos de caja (débito bancos o caja / crédito cartera, anticipos) y descuentos por pronto pago. El
        tercero es el documento del propietario principal. Los gastos se exportan desde Presupuesto.
      </p>
      <form method="get" action="/api/cartera/contable" className="space-y-5">
        <Section titulo="Periodo y formato">
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Desde</span>
              <input type="date" name="desde" defaultValue={desde} required className={input} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Hasta</span>
              <input type="date" name="hasta" defaultValue={hasta} required className={input} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Software contable</span>
              <select name="formato" defaultValue="SIIGO" className={input}>
                {FORMATOS_CONTABLES.map((f) => (
                  <option key={f} value={f}>
                    {FORMATO_LABEL[f]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Qué exportar</span>
              <select name="tipo" defaultValue="todo" className={input}>
                <option value="todo">Causación y recaudo</option>
                <option value="cuotas">Solo causación de cuotas</option>
                <option value="pagos">Solo recaudo (recibos de caja)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Archivo</span>
              <select name="archivo" defaultValue="xlsx" className={input}>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV (separado por punto y coma)</option>
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Por defecto se propone el mes anterior ({mesNombre(anterior)}).</p>
        </Section>
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Cuentas contables (PUC)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CUENTAS.map((c) => (
              <label key={c.key} className="space-y-1 text-sm">
                <span>{c.label}</span>
                <input name={c.key} defaultValue={CUENTAS_DEFECTO[c.key]} inputMode="numeric" className={input} />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">La cuenta de ingreso de cada cobro se toma del concepto (Cartera → Conceptos).</p>
        </details>
        <Button type="submit">
          <FileSpreadsheet /> Descargar comprobantes
        </Button>
      </form>
      <Section titulo="Otras exportaciones" className="mt-8">
        <div className="flex flex-wrap gap-2">
          {[
            ["cartera", "Cartera por edades"],
            ["cartera-cuotas", "Cuotas"],
            ["cartera-pagos", "Pagos"],
            ["cartera-movimientos", "Libro auxiliar"],
            ["cartera-gestiones", "Gestiones de cobro"],
          ].map(([r, l]) => (
            <Button key={r} variant="outline" size="sm" render={<a href={`/api/export/${r}?formato=xlsx`} />}>
              {l} (Excel)
            </Button>
          ))}
        </div>
      </Section>
    </>
  );
}
