import { Landmark } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fecha, periodoActual } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { DataList } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FileField, FormGrid, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Medidor } from "@/components/charts/charts";
import { cargarExtractoAction, eliminarCuentaAction, guardarCuentaAction } from "../actions";

export const metadata = { title: "Conciliación bancaria" };

function CuentaForm({ c }: { c?: { id: string; banco: string; tipo: string; numero: string; titular: string; convenio: string | null; activa: boolean } }) {
  return (
    <>
      <FormGrid>
        <TextField name="banco" label="Banco" defaultValue={c?.banco} placeholder="Bancolombia" required />
        <SelectField name="tipo" label="Tipo" options={[{ value: "AHORROS", label: "Ahorros" }, { value: "CORRIENTE", label: "Corriente" }]} defaultValue={c?.tipo ?? "AHORROS"} placeholder={false} required />
        <TextField name="numero" label="Número de cuenta" defaultValue={c?.numero} inputMode="numeric" required />
        <TextField name="convenio" label="Convenio de recaudo" defaultValue={c?.convenio ?? ""} placeholder="Opcional" />
      </FormGrid>
      <TextField name="titular" label="Titular" defaultValue={c?.titular} required />
      <CheckboxField name="activa" label="Cuenta activa" defaultChecked={c?.activa ?? true} />
    </>
  );
}

export default async function ConciliacionPage() {
  const ctx = await requirePage("pagos.conciliar");
  const [cuentas, conciliaciones] = await Promise.all([
    ctx.db.cuentaBancaria.findMany({ orderBy: { createdAt: "asc" } }),
    ctx.db.conciliacionBancaria.findMany({ include: { cuenta: { select: { banco: true, numero: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Carga el extracto del banco (CSV o Excel con columnas fecha, descripción, referencia y valor). El sistema empareja los abonos con los pagos por la referencia de pago de 14 dígitos, la referencia del pago o el valor y la fecha;
        los abonos sin identificar quedan pendientes para crearles el pago.{" "}
        <a href="/plantillas/extracto-bancario-ejemplo.csv" download className="text-primary underline">
          Descargar ejemplo
        </a>
      </p>

      <Section
        titulo="Cuentas bancarias"
        acciones={
          <FormDialog titulo="Nueva cuenta bancaria" action={guardarCuentaAction} triggerLabel="Nueva cuenta" triggerSize="sm" successMessage="Cuenta guardada">
            <CuentaForm />
          </FormDialog>
        }
      >
        {cuentas.length === 0 ? (
          <EmptyState icon={Landmark} titulo="Sin cuentas bancarias" descripcion="Registra la cuenta de recaudo del conjunto." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {cuentas.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <Landmark className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {c.banco} · {c.tipo === "AHORROS" ? "Ahorros" : "Corriente"} {c.numero}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.titular}
                    {c.convenio ? ` · Convenio ${c.convenio}` : ""}
                    {!c.activa ? " · inactiva" : ""}
                  </p>
                </div>
                <FormDialog titulo="Editar cuenta" action={guardarCuentaAction} extra={{ id: c.id }} trigger={<Button size="sm" variant="ghost">Editar</Button>} successMessage="Cuenta actualizada">
                  <CuentaForm c={c} />
                </FormDialog>
                <ActionButton size="sm" variant="ghost" className="text-destructive" action={eliminarCuentaAction} input={{ id: c.id }} confirm="¿Eliminar esta cuenta bancaria?">
                  Eliminar
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        titulo="Extractos cargados"
        acciones={
          <FormDialog titulo="Cargar extracto" descripcion="CSV (separado por coma o punto y coma) o Excel (.xlsx). Solo se toman los abonos (créditos)." action={cargarExtractoAction} triggerLabel="Cargar extracto" triggerSize="sm" successMessage="Extracto cargado y emparejado" redirectTo="/cartera/conciliacion/{id}">
            <SelectField name="cuentaId" label="Cuenta" options={cuentas.map((c) => ({ value: c.id, label: `${c.banco} ${c.numero}` }))} placeholder="Sin cuenta" />
            <TextField name="periodo" label="Periodo" type="month" defaultValue={periodoActual()} />
            <FileField name="archivoUrl" label="Archivo del extracto" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" folder="extractos" capture={false} />
          </FormDialog>
        }
      >
        <DataList
          rows={conciliaciones}
          rowKey={(c) => c.id}
          rowHref={(c) => `/cartera/conciliacion/${c.id}`}
          empty={<EmptyState titulo="Aún no has cargado extractos" />}
          columns={[
            { key: "a", header: "Archivo", primary: true, cell: (c) => c.archivoNombre },
            { key: "c", header: "Cuenta", cell: (c) => (c.cuenta ? `${c.cuenta.banco} ${c.cuenta.numero}` : "—") },
            { key: "p", header: "Periodo", cell: (c) => c.periodo ?? "—" },
            { key: "f", header: "Cargado", hideOnMobile: true, cell: (c) => fecha(c.createdAt) },
            { key: "m", header: "Avance", cell: (c) => <div className="w-32"><Medidor label={`${c.emparejadas}/${c.totalLineas}`} valor={c.totalLineas ? (c.emparejadas / c.totalLineas) * 100 : 0} tono={c.emparejadas === c.totalLineas ? "good" : "primary"} /></div> },
            { key: "e", header: "Estado", cell: (c) => <StatusBadge value={c.estado === "CERRADA" ? "CERRADO" : "EN_PROCESO"} text={c.estado === "CERRADA" ? "Cerrada" : "En proceso"} /> },
          ]}
        />
      </Section>
    </>
  );
}
