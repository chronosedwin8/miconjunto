import { requirePage } from "@/lib/auth/guard";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FileField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { options } from "@/lib/labels";
import { guardarDatosConjuntoAction } from "./actions";

export const metadata = { title: "Configuración" };

export default async function ConfigDatosPage() {
  const ctx = await requirePage("configuracion.ver");
  const c = await ctx.db.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } });
  return (
    <ActionForm action={guardarDatosConjuntoAction} successMessage="Datos del conjunto guardados">
      <FormGrid cols={3}>
        <TextField name="nombre" label="Nombre de la copropiedad" defaultValue={c.nombre} required className="sm:col-span-2" />
        <SelectField name="tipo" label="Tipo" options={options(["EDIFICIO", "CONJUNTO_CASAS", "MIXTO"])} defaultValue={c.tipo} placeholder={false} />
        <TextField name="nit" label="NIT" defaultValue={c.nit ?? ""} inputMode="numeric" />
        <TextField name="digitoVerificacion" label="Dígito de verificación" defaultValue={c.digitoVerificacion ?? ""} maxLength={1} />
        <TextField name="telefono" label="Teléfono" defaultValue={c.telefono ?? ""} />
        <TextField name="email" label="Correo de la administración" type="email" defaultValue={c.email ?? ""} />
        <TextField name="direccion" label="Dirección" defaultValue={c.direccion ?? ""} className="sm:col-span-2" />
        <TextField name="ciudad" label="Ciudad" defaultValue={c.ciudad ?? ""} />
        <TextField name="departamento" label="Departamento" defaultValue={c.departamento ?? ""} />
        <TextField name="municipioCodigo" label="Código DIVIPOLA del municipio" defaultValue={c.municipioCodigo ?? ""} hint="Barranquilla: 08001, Bogotá: 11001, Medellín: 05001" />
        <TextField name="matriculaInmobiliaria" label="Matrícula inmobiliaria de la PH" defaultValue={c.matriculaInmobiliaria ?? ""} />
        <TextField name="personeriaJuridica" label="Personería jurídica" defaultValue={c.personeriaJuridica ?? ""} className="sm:col-span-2" />
        <TextField name="regimenTributario" label="Régimen tributario" defaultValue={c.regimenTributario ?? ""} className="sm:col-span-3" />
      </FormGrid>
      <CheckboxField name="responsableIva" label="Responsable de IVA" hint="Necesario si cobra alquiler de zonas comunes por separado (factura electrónica)." defaultChecked={c.responsableIva} />
      <FormGrid>
        <FileField name="logoUrl" label="Logo" folder="publico" defaultValue={c.logoUrl} />
        <TextField name="colorPrimario" label="Color principal" type="color" defaultValue={c.colorPrimario ?? "#0f766e"} className="[&_input]:h-11 [&_input]:w-24 [&_input]:p-1" />
      </FormGrid>
      <CheckboxField name="paginaPublica" label="Publicar página pública del conjunto" hint={`Disponible en /c/${c.slug} con información general, contacto y formulario PQRS para no residentes.`} defaultChecked={c.paginaPublica} />
      <TextAreaField name="descripcionPublica" label="Descripción para la página pública" defaultValue={c.descripcionPublica ?? ""} />
    </ActionForm>
  );
}
