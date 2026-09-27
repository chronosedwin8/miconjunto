import Link from "next/link";
import { Check, FileText, Pencil, Receipt, Trash2, Wrench, X } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { listarGastos, rubroOptions } from "@/lib/presupuesto/service";
import { proveedorOptions } from "@/lib/mantenimiento/service";
import { cop, fecha, isoDate, nowBogota, toNumber } from "@/lib/format";
import { options } from "@/lib/labels";
import { Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { FileField, FormGrid, MoneyField, SearchSelect, SelectField, TextField, type Option } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { aprobarGastoAction, eliminarGastoAction, guardarGastoAction, pagarGastoAction } from "../actions";

export const metadata = { title: "Gastos" };

type GastoRow = Awaited<ReturnType<typeof listarGastos>>["items"][number];

function GastoFields({ g, rubros, proveedores }: { g?: GastoRow; rubros: Option[]; proveedores: Option[] }) {
  return (
    <>
      <TextField name="descripcion" label="Descripción" defaultValue={g?.descripcion} placeholder="Compra de bombillos LED zonas comunes" required />
      <FormGrid>
        <TextField name="fecha" label="Fecha" type="date" defaultValue={isoDate(g?.fecha ?? new Date())} required />
        <MoneyField name="valor" label="Valor" defaultValue={g ? toNumber(g.valor) : null} required />
        <SelectField name="rubroId" label="Rubro del presupuesto" options={rubros} defaultValue={g?.rubroId} placeholder="Sin rubro" />
        <TextField name="cuentaContable" label="Cuenta contable (opcional)" defaultValue={g?.cuentaContable ?? ""} inputMode="numeric" hint="Si la dejas vacía se usa la del rubro." />
      </FormGrid>
      <SearchSelect name="proveedorId" label="Proveedor / tercero" options={proveedores} defaultValue={g?.proveedorId} />
      <FileField name="comprobanteUrl" label="Comprobante (factura o cuenta de cobro)" accept="application/pdf,image/*" folder="gastos" defaultValue={g?.comprobanteUrl ?? null} />
    </>
  );
}

export default async function GastosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("presupuesto.ver");
  const sp = await searchParams;
  const anio = Number(spGet(sp, "anio")) || nowBogota().year;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const filtros = { q: spGet(sp, "q"), estado: spGet(sp, "estado"), rubroId: spGet(sp, "rubroId"), anio: String(anio) };
  const edita = can(ctx, "presupuesto.editar");
  const aprueba = can(ctx, "presupuesto.aprobar_gastos");
  const [{ items, total, suma }, rubros, proveedores] = await Promise.all([listarGastos(ctx, filtros, { skip, take }), rubroOptions(ctx, anio), edita ? proveedorOptions(ctx) : Promise.resolve([])]);
  return (
    <>
      <ListToolbar
        placeholder="Buscar gasto…"
        exportRecurso="gastos"
        filters={[
          { name: "estado", label: "Estado", options: options(["PENDIENTE_APROBACION", "APROBADO", "PAGADO", "RECHAZADO"]) },
          { name: "rubroId", label: "Rubro", options: [...rubros, { value: "sin", label: "Sin rubro" }] },
          { name: "anio", label: "Año", options: [anio + 1, anio, anio - 1, anio - 2].map((a) => ({ value: String(a), label: String(a) })) },
        ]}
      >
        {edita && (
          <FormDialog titulo="Registrar gasto" action={guardarGastoAction} triggerLabel="Gasto" triggerSize="sm" successMessage="Gasto registrado: queda pendiente de aprobación" wide>
            <GastoFields rubros={rubros} proveedores={proveedores} />
          </FormDialog>
        )}
      </ListToolbar>
      <p className="mb-3 text-sm text-muted-foreground">
        {total} gasto(s) · total <b className="text-foreground">{cop(suma)}</b>
      </p>
      {items.length === 0 ? (
        <EmptyState icon={Receipt} titulo="Sin gastos" descripcion="Los gastos se registran aquí o se crean solos al cerrar una orden de trabajo con costo." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((g) => (
            <li key={g.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{g.descripcion}</p>
                  <p className="text-xs text-muted-foreground">
                    {fecha(g.fecha)} · {g.rubro?.nombre ?? "Sin rubro"}
                    {g.proveedor && ` · ${g.proveedor.razonSocial}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{cop(g.valor)}</p>
                  <StatusBadge value={g.estado} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {g.ordenTrabajoId && (
                  <Button size="sm" variant="ghost" render={<Link href={`/mantenimiento/ordenes/${g.ordenTrabajoId}`} />}>
                    <Wrench /> Orden
                  </Button>
                )}
                {g.comprobanteUrl && (
                  <Button size="sm" variant="ghost" render={<a href={g.comprobanteUrl} target="_blank" rel="noopener" />}>
                    <FileText /> Comprobante
                  </Button>
                )}
                {aprueba && g.estado === "PENDIENTE_APROBACION" && (
                  <>
                    <FormDialog
                      titulo="Aprobar gasto"
                      descripcion={`${g.descripcion} · ${cop(g.valor)}`}
                      action={aprobarGastoAction}
                      extra={{ id: g.id, estado: "APROBADO" }}
                      trigger={
                        <Button size="sm">
                          <Check /> Aprobar
                        </Button>
                      }
                      submitLabel="Aprobar"
                      successMessage="Gasto aprobado"
                      confirm={`¿Aprobar el gasto de ${cop(g.valor)}?`}
                    >
                      <SelectField name="rubroId" label="Rubro" options={rubros} defaultValue={g.rubroId} placeholder="Sin rubro" />
                    </FormDialog>
                    <FormDialog titulo="Rechazar gasto" action={aprobarGastoAction} extra={{ id: g.id, estado: "RECHAZADO" }} trigger={<Button size="sm" variant="outline"><X /> Rechazar</Button>} submitLabel="Rechazar" successMessage="Gasto rechazado">
                      <TextField name="motivo" label="Motivo" required />
                    </FormDialog>
                  </>
                )}
                {(edita || aprueba) && g.estado === "APROBADO" && (
                  <FormDialog titulo="Registrar pago" descripcion={`${g.descripcion} · ${cop(g.valor)}`} action={pagarGastoAction} extra={{ id: g.id }} trigger={<Button size="sm" variant="outline">Marcar pagado</Button>} submitLabel="Marcar pagado" successMessage="Gasto pagado" confirm={`¿Confirmas el pago de ${cop(g.valor)}?`}>
                    <FileField name="comprobanteUrl" label="Comprobante de egreso (opcional)" accept="application/pdf,image/*" folder="gastos" defaultValue={g.comprobanteUrl} />
                  </FormDialog>
                )}
                {edita && (g.estado === "PENDIENTE_APROBACION" || g.estado === "RECHAZADO") && (
                  <>
                    <FormDialog titulo="Editar gasto" action={guardarGastoAction} extra={{ id: g.id }} trigger={<Button size="sm" variant="ghost"><Pencil /> Editar</Button>} successMessage="Gasto actualizado" wide>
                      <GastoFields g={g} rubros={rubros} proveedores={proveedores} />
                    </FormDialog>
                    <ActionButton size="sm" variant="ghost" className="text-destructive" action={eliminarGastoAction} input={{ id: g.id }} confirm="¿Eliminar este gasto?" successMessage="Gasto eliminado">
                      <Trash2 />
                    </ActionButton>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/presupuesto/gastos" />
    </>
  );
}
