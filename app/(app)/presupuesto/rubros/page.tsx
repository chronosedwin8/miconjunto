import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import type { RubroPresupuesto } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { aniosConPresupuesto, presupuestoDelAnio } from "@/lib/presupuesto/service";
import { cop, nowBogota, toNumber } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { FormGrid, MoneyField, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { AnioSelector, aniosDisponibles } from "../anio-selector";
import { eliminarRubroAction, guardarRubroAction } from "../actions";

export const metadata = { title: "Rubros del presupuesto" };

function RubroFields({ r, tipo }: { r?: RubroPresupuesto; tipo?: "INGRESO" | "GASTO" }) {
  return (
    <>
      <SelectField name="tipo" label="Tipo" options={[{ value: "INGRESO", label: "Ingreso" }, { value: "GASTO", label: "Gasto" }]} defaultValue={r?.tipo ?? tipo ?? "GASTO"} placeholder={false} />
      <TextField name="nombre" label="Rubro" defaultValue={r?.nombre} placeholder="Mantenimiento de ascensores" required />
      <FormGrid>
        <TextField name="cuentaContable" label="Cuenta contable (PUC)" defaultValue={r?.cuentaContable ?? ""} inputMode="numeric" placeholder="514510" hint="Los ingresos se cruzan con la cuenta del concepto de cobro." />
        <MoneyField name="valorAnual" label="Valor anual" defaultValue={r ? toNumber(r.valorAnual) : null} required />
      </FormGrid>
    </>
  );
}

export default async function RubrosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("presupuesto.ver");
  const sp = await searchParams;
  const hoy = nowBogota().year;
  const anio = Number(spGet(sp, "anio")) || hoy;
  const [anios, p] = await Promise.all([aniosConPresupuesto(ctx), presupuestoDelAnio(ctx, anio)]);
  const edita = can(ctx, "presupuesto.editar") && p?.estado !== "CERRADO";
  return (
    <>
      <AnioSelector anios={aniosDisponibles(anios, hoy)} actual={anio} base="/presupuesto/rubros" />
      {!p ? (
        <EmptyState titulo={`No hay presupuesto ${anio}`} accion={<Button render={<Link href={`/presupuesto?anio=${anio}`} />}>Crear presupuesto</Button>} />
      ) : (
        (["INGRESO", "GASTO"] as const).map((tipo) => {
          const rubros = p.rubros.filter((r) => r.tipo === tipo);
          const total = rubros.reduce((a, r) => a + toNumber(r.valorAnual), 0);
          return (
            <Section
              key={tipo}
              titulo={`${tipo === "INGRESO" ? "Ingresos" : "Gastos"} · ${cop(total)}`}
              acciones={
                edita ? (
                  <FormDialog titulo={`Nuevo rubro de ${tipo === "INGRESO" ? "ingresos" : "gastos"}`} action={guardarRubroAction} extra={{ presupuestoId: p.id }} triggerLabel="Rubro" triggerSize="sm" successMessage="Rubro guardado">
                    <RubroFields tipo={tipo} />
                  </FormDialog>
                ) : undefined
              }
            >
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {rubros.length === 0 && <li className="p-4 text-muted-foreground">Sin rubros.</li>}
                {rubros.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.cuentaContable ? `Cuenta ${r.cuentaContable}` : "Sin cuenta"} · {cop(toNumber(r.valorAnual) / 12)} al mes
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-semibold tabular-nums">{cop(r.valorAnual)}</span>
                      {edita && (
                        <>
                          <FormDialog titulo="Editar rubro" action={guardarRubroAction} extra={{ id: r.id, presupuestoId: p.id }} trigger={<Button variant="ghost" size="icon-sm" aria-label="Editar rubro"><Pencil /></Button>} successMessage="Rubro actualizado">
                            <RubroFields r={r} />
                          </FormDialog>
                          <ActionButton action={eliminarRubroAction} input={{ id: r.id }} variant="ghost" size="icon-sm" confirm={`¿Eliminar el rubro ${r.nombre}?`} successMessage="Rubro eliminado">
                            <Trash2 />
                          </ActionButton>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          );
        })
      )}
    </>
  );
}
