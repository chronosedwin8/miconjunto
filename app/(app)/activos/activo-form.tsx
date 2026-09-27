import type { Activo } from "@prisma/client";
import { ActionForm } from "@/components/form/action-form";
import { FileField, FormGrid, MoneyField, SearchSelect, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { CATEGORIAS_ACTIVO, ESTADOS_ACTIVO } from "@/lib/activos/constants";
import { isoDate, toNumber } from "@/lib/format";
import { options } from "@/lib/labels";
import { guardarActivoAction } from "./actions";

export function ActivoForm({ activo, zonas, proveedores }: { activo?: Activo | null; zonas: Option[]; proveedores: Option[] }) {
  return (
    <ActionForm
      action={guardarActivoAction}
      extra={activo ? { id: activo.id } : undefined}
      successMessage={activo ? "Activo actualizado" : "Activo creado"}
      redirectTo={activo ? undefined : "/activos/{id}"}
      draftKey={activo ? undefined : "nuevo-activo"}
    >
      <FormGrid>
        <TextField name="nombre" label="Nombre" defaultValue={activo?.nombre} placeholder="Ascensor Torre 1" required />
        <TextField name="categoria" label="Categoría" defaultValue={activo?.categoria} list="categorias-activo" placeholder="Ascensor, motobomba…" required />
        <datalist id="categorias-activo">
          {CATEGORIAS_ACTIVO.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <SelectField name="zonaId" label="Zona común" options={zonas} defaultValue={activo?.zonaId} placeholder="Sin zona" />
        <TextField name="ubicacion" label="Ubicación" defaultValue={activo?.ubicacion ?? ""} placeholder="Sótano, cuarto de máquinas" />
        <TextField name="marca" label="Marca" defaultValue={activo?.marca ?? ""} />
        <TextField name="modelo" label="Modelo" defaultValue={activo?.modelo ?? ""} />
        <TextField name="serie" label="Número de serie" defaultValue={activo?.serie ?? ""} />
        <SelectField name="estado" label="Estado" options={options(ESTADOS_ACTIVO)} defaultValue={activo?.estado ?? "OPERATIVO"} placeholder={false} />
      </FormGrid>
      <FormGrid cols={3}>
        <TextField name="fechaCompra" label="Fecha de compra" type="date" defaultValue={isoDate(activo?.fechaCompra)} />
        <MoneyField name="valor" label="Valor de compra" defaultValue={activo?.valor ? toNumber(activo.valor) : null} />
        <TextField name="vidaUtilAnios" label="Vida útil (años)" type="number" inputMode="numeric" defaultValue={activo?.vidaUtilAnios ?? ""} />
        <TextField name="garantiaVence" label="Garantía vence" type="date" defaultValue={isoDate(activo?.garantiaVence)} />
      </FormGrid>
      <SearchSelect name="proveedorId" label="Proveedor de mantenimiento" options={proveedores} defaultValue={activo?.proveedorId} />
      <FileField name="fotos" label="Fotos" multiple folder="activos" defaultValue={activo?.fotos ?? []} />
      <FileField name="manuales" label="Manuales y fichas técnicas" multiple accept="application/pdf,image/*" capture={false} folder="activos" defaultValue={activo?.manuales ?? []} />
      <TextAreaField name="notas" label="Notas" defaultValue={activo?.notas ?? ""} />
    </ActionForm>
  );
}
