import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { isoDateTimeLocal } from "@/lib/format";
import { label } from "@/lib/labels";
import { TIPOS_EVENTO } from "@/lib/calendario/service";

type Opt = { value: string; label: string };

export function CamposEvento({
  zonas,
  inicial,
  fechaSugerida,
}: {
  zonas: Opt[];
  fechaSugerida?: string;
  inicial?: { titulo: string; descripcion: string | null; tipo: string; inicio: Date; fin: Date; todoElDia: boolean; lugar: string | null; zonaId: string | null; visibleResidentes: boolean };
}) {
  const ini = inicial ? isoDateTimeLocal(inicial.inicio) : fechaSugerida ? `${fechaSugerida}T08:00` : "";
  const fin = inicial ? isoDateTimeLocal(new Date(inicial.fin.getTime() - (inicial.todoElDia ? 60_000 : 0))) : fechaSugerida ? `${fechaSugerida}T12:00` : "";
  return (
    <>
      <TextField name="titulo" label="Título" required maxLength={150} defaultValue={inicial?.titulo} placeholder="Ej.: Fumigación de zonas comunes" />
      <SelectField name="tipo" label="Tipo" required placeholder={false} defaultValue={inicial?.tipo ?? "COMUNITARIO"} options={TIPOS_EVENTO.map((t) => ({ value: t, label: label(t) }))} />
      <FormGrid>
        <TextField name="inicio" label="Inicio" type="datetime-local" required defaultValue={ini} />
        <TextField name="fin" label="Fin" type="datetime-local" required defaultValue={fin} />
      </FormGrid>
      <CheckboxField name="todoElDia" label="Todo el día" defaultChecked={inicial?.todoElDia} />
      <FormGrid>
        <SelectField name="zonaId" label="Zona común (opcional)" placeholder="Ninguna" defaultValue={inicial?.zonaId} options={zonas} />
        <TextField name="lugar" label="Lugar" maxLength={150} defaultValue={inicial?.lugar ?? ""} placeholder="Ej.: Torre 2, sótano" />
      </FormGrid>
      <TextAreaField name="descripcion" label="Descripción" maxLength={2000} defaultValue={inicial?.descripcion ?? ""} rows={3} placeholder="Recomendaciones, horarios, a quién afecta…" />
      <CheckboxField name="visibleResidentes" label="Visible para los residentes" defaultChecked={inicial?.visibleResidentes ?? true} />
      {!inicial && <CheckboxField name="bloquearZona" label="Bloquear la zona común para reservas" hint="Útil para mantenimientos y fumigaciones." />}
      <CheckboxField name="notificar" label={inicial ? "Avisar del cambio a los residentes" : "Notificar a los residentes"} defaultChecked={!inicial} />
    </>
  );
}
