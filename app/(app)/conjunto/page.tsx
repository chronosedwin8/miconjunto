import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { planoLogico, resumenEstructura } from "@/lib/conjunto/service";
import { StatCard } from "@/components/app/stat-card";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { MoneyField } from "@/components/form/fields";
import { cop, num } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { recalcularCuotasAction } from "./actions";

export const metadata = { title: "Conjunto" };

const COLOR: Record<string, string> = {
  MORA: "bg-red-500 text-white",
  AL_DIA: "bg-emerald-500 text-white",
  ARRENDADA: "ring-2 ring-inset ring-blue-500",
  AIRBNB: "ring-2 ring-inset ring-fuchsia-500",
  DESOCUPADA: "opacity-50",
  MOVILIDAD: "",
};

export default async function ConjuntoPage() {
  const ctx = await requirePage("conjunto.ver");
  const verFin = can(ctx, ["cartera.ver_todos", "campos.unidad_financiero"]);
  const [res, plano] = await Promise.all([resumenEstructura(ctx), planoLogico(ctx, verFin)]);
  const cfg = conjuntoConfig(ctx);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Torres" value={res.torres} href="/conjunto/torres" />
        <StatCard label="Unidades" value={res.unidades} hint={res.unidadesPorTipo.map((u) => `${u.total} ${label(u.tipo).toLowerCase()}`).join(" · ")} href="/conjunto/unidades" />
        <StatCard label="Parqueaderos" value={res.parqueaderos} href="/conjunto/parqueaderos" />
        <StatCard label="Bodegas" value={res.bodegas} href="/conjunto/bodegas" />
        <StatCard label="Zonas comunes" value={res.zonas} href="/conjunto/zonas" />
      </div>

      <div className={cn("mb-6 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center", res.coeficientes.ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/10")}>
        {res.coeficientes.ok ? <CheckCircle2 className="size-6 text-success" /> : <AlertTriangle className="size-6 text-warning" />}
        <div className="flex-1 text-sm">
          <p className="font-semibold">Suma de coeficientes: {num(res.coeficientes.suma, 6)} %</p>
          <p className="text-muted-foreground">
            {res.coeficientes.ok
              ? "Los coeficientes de copropiedad suman 100 % (Ley 675 de 2001)."
              : `Faltan ${num(res.coeficientes.diferencia, 6)} puntos para llegar al 100 %. Revisa los coeficientes de las unidades.`}
          </p>
          {cfg.cartera.calculoCuota === "COEFICIENTE" && (
            <p className="text-muted-foreground">Cuotas calculadas por coeficiente sobre un presupuesto mensual de {cop(cfg.cartera.presupuestoMensual)}.</p>
          )}
        </div>
        {can(ctx, "conjunto.coeficientes") && (
          <FormDialog
            titulo="Recalcular cuotas por coeficiente"
            descripcion="Cada unidad pagará presupuesto mensual × coeficiente. Aplica para las próximas cuotas generadas."
            action={recalcularCuotasAction}
            triggerLabel="Recalcular cuotas"
            triggerVariant="outline"
            submitLabel="Recalcular"
            confirm="¿Recalcular la cuota de administración de todas las unidades?"
          >
            <MoneyField name="presupuestoMensual" label="Presupuesto mensual de gastos" defaultValue={cfg.cartera.presupuestoMensual} required />
          </FormDialog>
        )}
      </div>

      <Section titulo="Plano lógico">
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {verFin && (
            <>
              <Legend cls="bg-emerald-500" text="Al día" />
              <Legend cls="bg-red-500" text="En mora" />
            </>
          )}
          <Legend cls="ring-2 ring-inset ring-blue-500" text="Arrendada" />
          <Legend cls="ring-2 ring-inset ring-fuchsia-500" text="Renta corta" />
          <Legend cls="bg-muted opacity-50" text="Desocupada" />
          <Legend cls="bg-muted" text="♿ Movilidad reducida" />
        </div>
        <div className="space-y-6">
          {plano.map((b) => (
            <div key={b.id}>
              <h3 className="mb-2 text-sm font-semibold">{b.nombre}</h3>
              <div className="space-y-1.5 overflow-x-auto">
                {b.pisos.map((p) => (
                  <div key={p.piso} className="flex items-center gap-1.5">
                    {b.id !== "casas" && <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">P{p.piso}</span>}
                    <div className={cn("flex gap-1.5", b.id === "casas" && "flex-wrap")}>
                      {p.unidades.map((u) => (
                        <Link
                          key={u.id}
                          href={`/conjunto/unidades/${u.id}`}
                          title={`${u.codigo}${u.mora > 0 ? ` · mora ${cop(u.mora)}` : ""}`}
                          className={cn(
                            "grid h-12 min-w-16 place-items-center rounded-lg bg-muted px-2 text-xs font-semibold",
                            u.estados.map((e) => COLOR[e]).join(" "),
                          )}
                        >
                          <span>
                            {u.codigo.replace(/^T\d-/, "")}
                            {u.estados.includes("MOVILIDAD") && " ♿"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function Legend({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-4 rounded", cls)} /> {text}
    </span>
  );
}
