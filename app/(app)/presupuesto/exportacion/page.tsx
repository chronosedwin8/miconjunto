import { Download, FileSpreadsheet } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { lineasContables } from "@/lib/presupuesto/service";
import { OPCIONES_DEFECTO, PLANTILLAS, SOFTWARE_LABEL, SOFTWARES, tablaContable, type Software } from "@/lib/presupuesto/contable";
import { cop, isoDate, nowBogota } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Exportación contable" };

const input = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";

export default async function ExportacionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("presupuesto.exportar");
  const sp = await searchParams;
  const n = nowBogota();
  const software = (SOFTWARES as readonly string[]).includes(spGet(sp, "software") ?? "") ? (spGet(sp, "software") as Software) : "SIIGO";
  const desde = spGet(sp, "desde") ?? `${n.year}-${String(n.month).padStart(2, "0")}-01`;
  const hasta = spGet(sp, "hasta") ?? isoDate(new Date());
  const estado = spGet(sp, "estado") ?? "";
  const val = (k: keyof typeof OPCIONES_DEFECTO) => spGet(sp, k) ?? String(OPCIONES_DEFECTO[k]);
  const { lineas, gastos } = await lineasContables(ctx, { desde, hasta, estado: estado || undefined }, {
    cuentaBancos: val("cuentaBancos"),
    cuentaPorPagar: val("cuentaPorPagar"),
    centroCosto: spGet(sp, "centroCosto") ?? "",
    comprobanteEgreso: val("comprobanteEgreso"),
    comprobanteCausacion: val("comprobanteCausacion"),
  });
  const t = tablaContable(software, lineas.slice(0, 12));
  const plantilla = PLANTILLAS[software];
  const total = lineas.reduce((a, l) => a + l.debito, 0);
  const qs = new URLSearchParams(Object.entries({ software, desde, hasta, estado, cuentaBancos: val("cuentaBancos"), cuentaPorPagar: val("cuentaPorPagar"), centroCosto: spGet(sp, "centroCosto") ?? "", comprobanteEgreso: val("comprobanteEgreso"), comprobanteCausacion: val("comprobanteCausacion") }).filter(([, v]) => v) as [string, string][]);

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Genera el archivo de movimientos contables de los gastos aprobados (causación contra cuentas por pagar) y pagados (egreso contra bancos) listo para importar en tu software contable. No incluye retenciones: el contador las ajusta.
      </p>
      <form method="GET" className="mb-6 space-y-4 rounded-xl border bg-card p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Software contable</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SOFTWARES.map((s) => (
              <label key={s} className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border p-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-2 has-[:checked]:ring-primary/30">
                <input type="radio" name="software" value={s} defaultChecked={s === software} className="sr-only" />
                {SOFTWARE_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5 text-sm font-medium">
            Desde
            <input type="date" name="desde" defaultValue={desde} className={input} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Hasta
            <input type="date" name="hasta" defaultValue={hasta} className={input} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Gastos
            <select name="estado" defaultValue={estado} className={input}>
              <option value="">Aprobados y pagados</option>
              <option value="APROBADO">Solo aprobados (causación)</option>
              <option value="PAGADO">Solo pagados (egresos)</option>
            </select>
          </label>
        </div>
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary">Cuentas y comprobantes</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["cuentaBancos", "Cuenta de bancos"],
                ["cuentaPorPagar", "Cuenta por pagar"],
                ["comprobanteEgreso", "Comprobante de egreso"],
                ["comprobanteCausacion", "Comprobante de causación"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="space-y-1.5 text-sm font-medium">
                {l}
                <input name={k} defaultValue={val(k)} className={input} />
              </label>
            ))}
            <label className="space-y-1.5 text-sm font-medium">
              Centro de costo
              <input name="centroCosto" defaultValue={spGet(sp, "centroCosto") ?? ""} className={input} />
            </label>
          </div>
        </details>
        <Button type="submit" variant="outline">
          Ver vista previa
        </Button>
      </form>

      <Section
        titulo={`Vista previa · ${plantilla.nombre}`}
        acciones={
          lineas.length ? (
            <div className="flex gap-2">
              <Button size="sm" render={<a href={`/presupuesto/exportacion/descargar?${qs}&formato=csv`} />}>
                <Download /> CSV
              </Button>
              <Button size="sm" variant="outline" render={<a href={`/presupuesto/exportacion/descargar?${qs}&formato=xlsx`} />}>
                <FileSpreadsheet /> Excel
              </Button>
            </div>
          ) : undefined
        }
      >
        <p className="mb-2 text-sm text-muted-foreground">
          {gastos} gasto(s) · {lineas.length} líneas · débitos = créditos = {cop(total)}. {plantilla.nota}
        </p>
        {lineas.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay gastos aprobados o pagados en el periodo.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  {t.headers.map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r, i) => (
                  <tr key={i} className="border-t">
                    {r.map((c, j) => (
                      <td key={j} className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                        {String(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lineas.length > 12 && <p className="mt-1 text-xs text-muted-foreground">Mostrando 12 de {lineas.length} líneas.</p>}
      </Section>

      <Section titulo="Presupuesto mensualizado">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4 text-sm">
          <p className="flex-1 text-muted-foreground">Rubros con cuenta contable y valor por mes para cargar el presupuesto {n.year} en el software contable.</p>
          <Button size="sm" variant="outline" render={<a href={`/presupuesto/exportacion/descargar?tipo=presupuesto&anio=${n.year}&software=${software}&formato=xlsx`} />}>
            <FileSpreadsheet /> Excel
          </Button>
          <Button size="sm" variant="outline" render={<a href={`/presupuesto/exportacion/descargar?tipo=presupuesto&anio=${n.year}&software=${software}&formato=csv`} />}>
            <Download /> CSV
          </Button>
        </div>
      </Section>
    </>
  );
}
