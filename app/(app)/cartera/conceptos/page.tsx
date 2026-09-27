import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { label } from "@/lib/labels";
import { toNumber, pct } from "@/lib/format";
import { DataList } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FormGrid, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { eliminarConceptoAction, guardarConceptoAction } from "../actions";

export const metadata = { title: "Conceptos de cobro" };

const TIPOS = ["ADMINISTRACION", "EXTRAORDINARIA", "MULTA", "INTERES_MORA", "ALQUILER_ZONA", "PARQUEADERO", "SERVICIO", "OTRO"];

type C = { id: string; nombre: string; tipo: string; cuentaContable: string | null; gravaIva: boolean; tarifaIva: unknown; facturaElectronica: boolean; activo: boolean };

function ConceptoForm({ c }: { c?: C }) {
  return (
    <>
      <TextField name="nombre" label="Nombre" defaultValue={c?.nombre} required />
      <FormGrid>
        <SelectField name="tipo" label="Tipo" options={TIPOS.map((t) => ({ value: t, label: label(t) }))} defaultValue={c?.tipo ?? "OTRO"} placeholder={false} required />
        <TextField name="cuentaContable" label="Cuenta contable (PUC)" defaultValue={c?.cuentaContable ?? ""} inputMode="numeric" placeholder="Ej.: 417005" />
        <TextField name="tarifaIva" label="Tarifa de IVA %" type="number" step="0.01" min={0} max={100} defaultValue={c ? toNumber(c.tarifaIva as number) : 0} />
      </FormGrid>
      <CheckboxField name="gravaIva" label="Grava IVA" hint="Solo alquiler de zonas comunes o servicios independientes de la cuota (DIAN)." defaultChecked={c?.gravaIva} />
      <CheckboxField name="facturaElectronica" label="Genera factura electrónica" defaultChecked={c?.facturaElectronica} />
      <CheckboxField name="activo" label="Activo" defaultChecked={c?.activo ?? true} />
    </>
  );
}

export default async function ConceptosPage() {
  const ctx = await requirePage("cartera.ver_todos");
  const conceptos = await ctx.db.conceptoCobro.findMany({ orderBy: [{ activo: "desc" }, { tipo: "asc" }, { nombre: "asc" }], include: { _count: { select: { cuotas: true } } } });
  const editar = can(ctx, "cartera.configurar");
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-muted-foreground">Conceptos con los que se cobra a las unidades. La cuenta contable se usa en la exportación a Siigo, World Office, Alegra y Helisa.</p>
        {editar && (
          <FormDialog titulo="Nuevo concepto de cobro" action={guardarConceptoAction} triggerLabel="Nuevo concepto" successMessage="Concepto creado">
            <ConceptoForm />
          </FormDialog>
        )}
      </div>
      <DataList
        rows={conceptos}
        rowKey={(c) => c.id}
        columns={[
          { key: "n", header: "Concepto", primary: true, cell: (c) => c.nombre },
          { key: "t", header: "Tipo", cell: (c) => label(c.tipo) },
          { key: "c", header: "Cuenta", cell: (c) => c.cuentaContable ?? "—" },
          { key: "i", header: "IVA", cell: (c) => (c.gravaIva ? pct(toNumber(c.tarifaIva), 0) : "No") },
          { key: "f", header: "Factura", hideOnMobile: true, cell: (c) => (c.facturaElectronica ? "Sí" : "No") },
          { key: "u", header: "Cuotas", align: "right", hideOnMobile: true, cell: (c) => c._count.cuotas },
          { key: "e", header: "Estado", cell: (c) => <StatusBadge value={c.activo ? "ACTIVO" : "INACTIVO"} /> },
          ...(editar
            ? [
                {
                  key: "x",
                  header: "",
                  cell: (c: (typeof conceptos)[number]) => (
                    <span className="flex gap-1">
                      <FormDialog titulo="Editar concepto" action={guardarConceptoAction} extra={{ id: c.id }} trigger={<Button size="sm" variant="ghost">Editar</Button>} successMessage="Concepto actualizado">
                        <ConceptoForm c={c} />
                      </FormDialog>
                      <ActionButton size="sm" variant="ghost" className="text-destructive" action={eliminarConceptoAction} input={{ id: c.id }} confirm={c._count.cuotas ? "El concepto tiene cuotas: se desactivará. ¿Continuar?" : "¿Eliminar este concepto?"}>
                        {c._count.cuotas ? "Desactivar" : "Eliminar"}
                      </ActionButton>
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
