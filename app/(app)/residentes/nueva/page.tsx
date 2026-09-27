import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { unidadOptions } from "@/lib/conjunto/options";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FormGrid, TextField } from "@/components/form/fields";
import { Section } from "@/components/app/page-header";
import { EmergenciaFields, HorarioFields, PersonaFields, VinculoFields } from "../_components/campos";
import { registrarPersonaAction } from "../actions";

export const metadata = { title: "Registrar persona" };

const TIPOS = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE", "AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"] as const;

export default async function NuevaPersonaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("residentes.crear");
  const sp = await searchParams;
  const unidades = await unidadOptions(ctx);
  return (
    <div className="max-w-3xl">
      <ActionForm action={registrarPersonaAction} successMessage="Persona registrada" redirectTo="/residentes/{id}" draftKey="residentes-nueva" submitLabel="Registrar">
        <Section titulo="1. Unidad y vínculo">
          <VinculoFields unidades={unidades} tipos={TIPOS} unidadId={spGet(sp, "unidad")} tipo={spGet(sp, "tipo")} />
          <FormGrid>
            <TextField name="porcentajePropiedad" label="% de propiedad (copropietarios)" inputMode="decimal" />
            <TextField name="fechaInicio" label="Desde" type="date" />
          </FormGrid>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <CheckboxField name="principal" label="Contacto principal de la unidad" />
            <CheckboxField name="puedeVerCuenta" label="Puede ver el estado de cuenta" hint="Para arrendatarios autorizados por el propietario" />
          </div>
        </Section>
        <Section titulo="2. Datos de la persona">
          <PersonaFields />
        </Section>
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-medium">Horario permitido (empleados y visitantes frecuentes)</summary>
          <div className="mt-3">
            <HorarioFields />
            <p className="mt-2 text-xs text-muted-foreground">Solo se guarda para empleados, cuidadores y visitantes frecuentes.</p>
          </div>
        </details>
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-medium">Información de emergencia</summary>
          <div className="mt-3 space-y-3">
            <EmergenciaFields />
          </div>
        </details>
      </ActionForm>
    </div>
  );
}
