import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { addDays, isoDate } from "@/lib/format";
import { unidadOptions } from "@/lib/conjunto/options";
import { recursosMudanza } from "@/lib/obras/service";
import { HORARIO_MUDANZAS } from "@/lib/obras/reglas";
import { Section } from "@/components/app/page-header";
import { ActionForm } from "@/components/form/action-form";
import { ChoiceCards, FormGrid, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { solicitarMudanzaAction } from "../../actions";

export const metadata = { title: "Programar mudanza" };

export default async function NuevaMudanzaPage() {
  const ctx = await requirePage(["obras.solicitar", "obras.aprobar"]);
  const gestor = can(ctx, "obras.aprobar");
  const [unidades, recursos] = await Promise.all([unidadOptions(ctx, { soloPropias: !gestor }), recursosMudanza(ctx)]);
  return (
    <Section titulo="Programar mudanza">
      <ActionForm action={solicitarMudanzaAction} submitLabel="Solicitar mudanza" successMessage="Mudanza solicitada" redirectTo="/obras/mudanzas/{id}" className="max-w-2xl">
        {unidades.length > 1 || gestor ? (
          <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={unidades.length === 1 ? unidades[0].value : undefined} required />
        ) : (
          <input type="hidden" name="unidadId" value={unidades[0]?.value ?? ""} />
        )}
        <ChoiceCards
          name="tipo"
          defaultValue="INGRESO"
          options={[
            { value: "INGRESO", label: "Ingreso", description: "Llego al conjunto" },
            { value: "SALIDA", label: "Salida", description: "Requiere paz y salvo" },
          ]}
        />
        <FormGrid cols={3}>
          <TextField name="fecha" label="Fecha" type="date" defaultValue={isoDate(addDays(new Date(), 2))} required />
          <TextField name="horaInicio" label="Desde" type="time" defaultValue="08:00" min={HORARIO_MUDANZAS.desde} max={HORARIO_MUDANZAS.hasta} required />
          <TextField name="horaFin" label="Hasta" type="time" defaultValue="12:00" min={HORARIO_MUDANZAS.desde} max={HORARIO_MUDANZAS.hasta} required />
        </FormGrid>
        <p className="-mt-2 text-xs text-muted-foreground">
          Lunes a sábado (no festivos), de {HORARIO_MUDANZAS.desde} a {HORARIO_MUDANZAS.hasta}. No se permiten cruces con otras mudanzas en el mismo recurso.
        </p>
        <SelectField name="recurso" label="Ascensor o zona" options={recursos.map((r) => ({ value: r, label: r }))} defaultValue={recursos[0]} placeholder={false} />
        <FormGrid>
          <TextField name="empresa" label="Empresa de mudanzas (opcional)" />
          <TextField name="placaVehiculo" label="Placa del vehículo" placeholder="ABC123" autoCapitalize="characters" />
        </FormGrid>
        <TextAreaField name="enseres" label="Enseres (uno por línea)" placeholder={"1 x Nevera\n1 x Sofá de 3 puestos\n12 x Cajas"} hint="Para salidas es obligatorio: portería solo autoriza la salida de lo relacionado." rows={5} />
        <TextAreaField name="observaciones" label="Observaciones (opcional)" />
      </ActionForm>
    </Section>
  );
}
