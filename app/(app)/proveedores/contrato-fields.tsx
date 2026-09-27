import type { Contrato } from "@prisma/client";
import { CheckboxField, FileField, FormGrid, MoneyField, SearchSelect, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { isoDate, toNumber } from "@/lib/format";

export function ContratoFields({ c, proveedores }: { c?: Contrato | null; proveedores?: Option[] }) {
  return (
    <>
      {proveedores && <SearchSelect name="proveedorId" label="Proveedor" options={proveedores} defaultValue={c?.proveedorId} required />}
      <TextAreaField name="objeto" label="Objeto del contrato" defaultValue={c?.objeto} placeholder="Prestación del servicio de vigilancia 24 horas" required />
      <FormGrid>
        <MoneyField name="valor" label="Valor (mensual o total)" defaultValue={c ? toNumber(c.valor) : null} required />
        <TextField name="diasAlerta" label="Avisar con (días)" type="number" inputMode="numeric" defaultValue={c?.diasAlerta ?? 30} />
        <TextField name="inicio" label="Inicio" type="date" defaultValue={isoDate(c?.inicio ?? new Date())} required />
        <TextField name="fin" label="Fin" type="date" defaultValue={isoDate(c?.fin)} required />
      </FormGrid>
      <CheckboxField name="renovacionAutomatica" label="Renovación automática" hint="Al vencer se prorroga por el mismo periodo y se avisa a la administración." defaultChecked={c?.renovacionAutomatica} />
      <FileField name="documentoUrl" label="Documento del contrato" accept="application/pdf,image/*" capture={false} folder="contratos" defaultValue={c?.documentoUrl ?? null} />
    </>
  );
}
