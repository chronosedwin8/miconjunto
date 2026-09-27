import type { Proveedor } from "@prisma/client";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { CATEGORIAS_PROVEEDOR } from "@/lib/proveedores/service";

export function ProveedorFields({ p, usuarios }: { p?: Proveedor | null; usuarios: Option[] }) {
  return (
    <>
      <FormGrid>
        <TextField name="nit" label="NIT" defaultValue={p?.nit} placeholder="900123456-7" inputMode="numeric" required />
        <TextField name="razonSocial" label="Razón social" defaultValue={p?.razonSocial} required />
        <TextField name="categoria" label="Categoría" defaultValue={p?.categoria} list="categorias-proveedor" required />
        <TextField name="contactoNombre" label="Persona de contacto" defaultValue={p?.contactoNombre ?? ""} />
        <TextField name="telefono" label="Teléfono" type="tel" defaultValue={p?.telefono ?? ""} />
        <TextField name="email" label="Correo" type="email" defaultValue={p?.email ?? ""} />
      </FormGrid>
      <datalist id="categorias-proveedor">
        {CATEGORIAS_PROVEEDOR.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <TextField name="direccion" label="Dirección" defaultValue={p?.direccion ?? ""} />
      <TextAreaField name="tarifas" label="Tarifas publicadas" defaultValue={p?.tarifas ?? ""} placeholder="Visita técnica $ 60.000 · Hora adicional $ 45.000" />
      <CheckboxField name="directorioComunitario" label="Mostrar en el directorio comunitario" hint="Los residentes lo ven, lo contratan y lo califican." defaultChecked={p?.directorioComunitario} />
      <TextField name="beneficioComunidad" label="Beneficio para la comunidad" defaultValue={p?.beneficioComunidad ?? ""} placeholder="10 % de descuento para residentes" />
      {usuarios.length > 0 && (
        <SelectField name="usuarioId" label="Usuario de acceso (rol Proveedor)" options={usuarios} defaultValue={p?.usuarioId} placeholder="Sin acceso a la app" hint="Verá solo las órdenes asignadas a este proveedor y podrá adjuntar evidencias." />
      )}
      <CheckboxField name="activo" label="Proveedor activo" defaultChecked={p?.activo ?? true} />
    </>
  );
}
