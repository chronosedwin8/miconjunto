import { FormGrid, MoneyField, SearchSelect, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { isoDate, toNumber } from "@/lib/format";

export type OrdenFieldsData = {
  titulo?: string;
  descripcion?: string | null;
  activoId?: string | null;
  zonaId?: string | null;
  proveedorId?: string | null;
  asignadoAId?: string | null;
  fechaProgramada?: Date;
  checklist?: string[];
  costo?: unknown;
};

/** Campos del formulario de orden de trabajo (crear / editar / asignar). */
export function OrdenFields({ o, activos, zonas, proveedores, responsables }: { o?: OrdenFieldsData; activos: Option[]; zonas: Option[]; proveedores: Option[]; responsables: Option[] }) {
  return (
    <>
      <TextField name="titulo" label="¿Qué hay que hacer?" defaultValue={o?.titulo} placeholder="Cambiar luminaria del parqueadero" required />
      <TextAreaField name="descripcion" label="Detalle" defaultValue={o?.descripcion ?? ""} />
      <FormGrid>
        <SearchSelect name="activoId" label="Activo" options={activos} defaultValue={o?.activoId} />
        <SelectField name="zonaId" label="Zona común" options={zonas} defaultValue={o?.zonaId} placeholder="Sin zona" />
        <SearchSelect name="asignadoAId" label="Responsable interno" options={responsables} defaultValue={o?.asignadoAId} />
        <SearchSelect name="proveedorId" label="Proveedor" options={proveedores} defaultValue={o?.proveedorId} />
        <TextField name="fechaProgramada" label="Fecha programada" type="date" defaultValue={isoDate(o?.fechaProgramada ?? new Date())} required />
        <MoneyField name="costo" label="Costo estimado" defaultValue={o?.costo !== undefined && o?.costo !== null ? toNumber(o.costo as number) : null} />
      </FormGrid>
      <TextAreaField name="checklistTexto" label="Lista de chequeo (un ítem por renglón)" defaultValue={(o?.checklist ?? []).join("\n")} placeholder={"Revisar tablero\nProbar funcionamiento"} />
    </>
  );
}
