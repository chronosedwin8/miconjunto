import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { cop, fecha, mesNombre, pct, periodoActual } from "@/lib/format";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { previsualizarGeneracion } from "@/lib/cartera/generacion";
import { periodoValido, sumarMeses } from "@/lib/cartera/calculos";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataList } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { Button } from "@/components/ui/button";
import { generarCuotasAction } from "../actions";

export const metadata = { title: "Generar cuotas" };

export default async function GenerarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("cartera.generar");
  const sp = await searchParams;
  const actual = periodoActual();
  const pedido = spGet(sp, "periodo");
  const periodo = pedido && periodoValido(pedido) ? pedido : actual;
  const cfg = conjuntoConfig(ctx);
  const p = await previsualizarGeneracion(ctx, periodo);
  return (
    <>
      <div className="mb-4 rounded-xl border bg-card p-4 text-sm">
        <p>
          Las cuotas se generan <b>automáticamente el día {cfg.cartera.diaGeneracion} de cada mes a las 12:10 a. m.</b> ({cfg.cartera.calculoCuota === "COEFICIENTE" ? `por coeficiente sobre un presupuesto de ${cop(cfg.cartera.presupuestoMensual)}` : "con la cuota fija de cada unidad"}). Aquí puedes revisarlas y generarlas manualmente; si ya existen, no se duplican.
        </p>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block text-xs text-muted-foreground">Periodo</span>
            <input type="month" name="periodo" defaultValue={periodo} className="h-11 rounded-lg border bg-background px-3" />
          </label>
          <Button type="submit" variant="outline">
            Ver previsualización
          </Button>
          {[sumarMeses(actual, -1), actual, sumarMeses(actual, 1)].map((x) => (
            <Link key={x} href={`/cartera/generar?periodo=${x}`} className={`inline-flex h-9 items-center rounded-full border px-3 text-xs ${x === periodo ? "border-primary bg-primary/10 text-primary" : ""}`}>
              {mesNombre(x)}
            </Link>
          ))}
        </form>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cuotas nuevas" value={p.nuevas} hint={`${p.existentes} ya generadas`} tone={p.nuevas ? "primary" : "success"} />
        <StatCard label="Total a facturar" value={cop(p.totalNuevas)} />
        <StatCard label="Vencimiento" value={fecha(p.vencimiento)} hint={`Emisión ${fecha(p.emision)}`} />
        <StatCard label="Pronto pago" value={p.prontoPago ? pct(p.porcentajeProntoPago, 0) : "—"} hint={p.prontoPago ? `hasta el ${fecha(p.prontoPago)}` : "Sin descuento"} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <CalendarCheck className="size-6 text-primary" />
        <p className="flex-1 text-sm">
          {p.nuevas > 0 ? (
            <>
              Se crearán <b>{p.nuevas}</b> cuotas de administración de <b>{mesNombre(periodo)}</b> por <b>{cop(p.totalNuevas)}</b>. Los saldos a favor se cruzarán automáticamente.
            </>
          ) : (
            <>Todas las unidades ya tienen la cuota de {mesNombre(periodo)}.</>
          )}
          {p.sinValor > 0 && <span className="block text-warning">{p.sinValor} unidad(es) sin cuota de administración: revisa el coeficiente o el valor fijo.</span>}
        </p>
        <ActionButton
          action={generarCuotasAction}
          input={{ periodo }}
          disabled={p.nuevas === 0}
          confirm={`¿Generar ${p.nuevas} cuotas de ${mesNombre(periodo)} por ${cop(p.totalNuevas)}?`}
          successMessage="Cuotas generadas"
        >
          Generar {p.nuevas} cuotas
        </ActionButton>
      </div>

      <Section titulo="Previsualización por unidad">
        <DataList
          rows={p.filas}
          rowKey={(f) => f.unidadId}
          columns={[
            { key: "u", header: "Unidad", primary: true, cell: (f) => f.codigo },
            { key: "t", header: "Torre", cell: (f) => f.torre ?? "Casas" },
            { key: "v", header: "Cuota", align: "right", cell: (f) => cop(f.valor) },
            { key: "e", header: "Estado", cell: (f) => (f.existente ? <StatusBadge value="COMPLETADA" text="Ya generada" /> : f.valor <= 0 ? <StatusBadge value="ERROR" text="Sin valor" /> : <StatusBadge value="PENDIENTE" text="Nueva" />) },
          ]}
        />
      </Section>
    </>
  );
}
