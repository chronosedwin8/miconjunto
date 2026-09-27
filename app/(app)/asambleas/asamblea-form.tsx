import type { Asamblea } from "@prisma/client";
import { ActionForm } from "@/components/form/action-form";
import { FormGrid, SelectField, TextField } from "@/components/form/fields";
import { addDays, isoDateTimeLocal, toNumber } from "@/lib/format";
import { guardarAsambleaAction } from "./actions";

/** Formulario de creación/edición de una asamblea (Server Component con campos de formulario). */
export function AsambleaForm({ a }: { a?: Asamblea | null }) {
  const fechaDefecto = new Date(addDays(new Date(), 20).setHours(19, 0, 0, 0));
  return (
    <ActionForm action={guardarAsambleaAction} extra={a ? { id: a.id } : undefined} submitLabel={a ? "Guardar cambios" : "Crear asamblea"} successMessage="Asamblea guardada" redirectTo={a ? undefined : "/asambleas/{id}"}>
      <TextField name="titulo" label="Título" required defaultValue={a?.titulo ?? `Asamblea general ordinaria ${new Date().getFullYear()}`} />
      <FormGrid>
        <SelectField
          name="tipo"
          label="Tipo"
          placeholder={false}
          defaultValue={a?.tipo ?? "ORDINARIA"}
          options={[
            { value: "ORDINARIA", label: "Ordinaria" },
            { value: "EXTRAORDINARIA", label: "Extraordinaria" },
          ]}
          hint="Ordinaria: convocar con mínimo 15 días calendario (Ley 675, art. 39)."
        />
        <SelectField
          name="modalidad"
          label="Modalidad"
          placeholder={false}
          defaultValue={a?.modalidad ?? "MIXTA"}
          options={[
            { value: "PRESENCIAL", label: "Presencial" },
            { value: "VIRTUAL", label: "Virtual" },
            { value: "MIXTA", label: "Mixta (presencial y virtual)" },
          ]}
          hint="La votación siempre se hace en la app."
        />
        <TextField name="fecha" label="Fecha y hora" type="datetime-local" required defaultValue={isoDateTimeLocal(a?.fecha ?? fechaDefecto)} />
        <TextField name="lugar" label="Lugar (presencial)" defaultValue={a?.lugar ?? "Salón social"} />
        <TextField name="enlace" label="Enlace de videoconferencia (Zoom, Meet…)" type="url" placeholder="https://meet.google.com/…" defaultValue={a?.enlace ?? ""} className="sm:col-span-2" />
        <TextField name="quorumRequerido" label="Quórum requerido (%)" inputMode="decimal" defaultValue={a ? toNumber(a.quorumRequerido) : ""} placeholder="Más del 50 % (Ley 675)" hint="Vacío = más de la mitad de los coeficientes." />
        <TextField name="limitePoderes" label="Máximo de poderes por apoderado" type="number" inputMode="numeric" defaultValue={a?.limitePoderes ?? 2} hint="Según el reglamento de propiedad horizontal." />
      </FormGrid>
    </ActionForm>
  );
}
