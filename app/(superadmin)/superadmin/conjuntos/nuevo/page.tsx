import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/form/action-form";
import { FormGrid, SelectField, TextField } from "@/components/form/fields";
import { Section } from "@/components/app/page-header";
import { options } from "@/lib/labels";
import { cop } from "@/lib/format";
import { crearConjuntoAction } from "../../actions";

export const metadata = { title: "Nuevo conjunto" };

export default async function NuevoConjuntoPage() {
  const planes = await prisma.planSuscripcion.findMany({ where: { activo: true, deletedAt: null }, orderBy: { precioMensual: "asc" } });
  return (
    <Section titulo="Asistente de apertura · Paso 1: datos del conjunto">
      <p className="mb-4 text-sm text-muted-foreground">
        Crea la copropiedad con sus roles, conceptos de cobro, catálogo de infracciones, plan de emergencia y tasa de mora por defecto. Luego continúa la apertura dentro del conjunto
        (unidades, propietarios, saldos, zonas, parqueaderos, parámetros y usuarios).
      </p>
      <ActionForm action={crearConjuntoAction} successMessage="Conjunto creado" redirectTo="/superadmin/conjuntos/{id}" submitLabel="Crear conjunto">
        <FormGrid cols={3}>
          <TextField name="nombre" label="Nombre de la copropiedad" required className="sm:col-span-2" />
          <SelectField name="tipo" label="Tipo" options={options(["EDIFICIO", "CONJUNTO_CASAS", "MIXTO"])} defaultValue="MIXTO" placeholder={false} />
          <TextField name="nit" label="NIT" inputMode="numeric" />
          <TextField name="digitoVerificacion" label="DV" maxLength={1} />
          <TextField name="telefono" label="Teléfono" />
          <TextField name="direccion" label="Dirección" className="sm:col-span-2" />
          <TextField name="email" label="Correo" type="email" />
          <TextField name="ciudad" label="Ciudad" />
          <TextField name="departamento" label="Departamento" />
          <TextField name="municipioCodigo" label="Código DIVIPOLA" placeholder="08001" />
          <TextField name="fechaInicioOperacion" label="Fecha de inicio de operación" type="date" />
          <SelectField name="planId" label="Plan" options={planes.map((p) => ({ value: p.id, label: `${p.nombre} · ${cop(p.precioMensual)}/mes` }))} />
        </FormGrid>
        <fieldset className="rounded-xl border p-3">
          <legend className="px-1 text-sm font-semibold">Administrador del conjunto</legend>
          <FormGrid>
            <TextField name="adminNombre" label="Nombre" />
            <TextField name="adminEmail" label="Correo (recibirá la invitación)" type="email" />
          </FormGrid>
        </fieldset>
      </ActionForm>
    </Section>
  );
}
