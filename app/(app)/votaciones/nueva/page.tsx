import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { PageHeader } from "@/components/app/page-header";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { ListaEditable } from "@/components/gobierno/lista-editable";
import { addDays, isoDateTimeLocal } from "@/lib/format";
import { crearVotacionAction } from "../actions";

export const metadata = { title: "Nueva votación" };

export default async function NuevaVotacionPage() {
  const ctx = await requirePage("votaciones.crear");
  const cfg = conjuntoConfig(ctx);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader titulo="Nueva votación" volver="/votaciones" descripcion="Se abre de inmediato y se avisa a quienes pueden votar. Cierra sola en la fecha indicada." />
      <ActionForm action={crearVotacionAction} submitLabel="Abrir votación" successMessage="Votación abierta" redirectTo="/votaciones/{id}" draftKey="nueva-votacion" confirm="Al abrirla, los propietarios podrán votar de inmediato. ¿Continuar?">
        <TextField name="pregunta" label="Pregunta" required placeholder="¿Aprueba pintar las fachadas de las torres?" />
        <TextAreaField name="descripcion" label="Contexto (opcional)" placeholder="Valor, cotizaciones, plazos…" />
        <ListaEditable name="opciones" label="Opciones de respuesta" defaultValue={["Sí", "No", "Me abstengo"]} />
        <FormGrid>
          <SelectField
            name="tipoMayoria"
            label="Mayoría exigida"
            placeholder={false}
            defaultValue="SIMPLE"
            options={[
              { value: "SIMPLE", label: "Simple (más de la mitad)" },
              { value: "CALIFICADA_70", label: "Calificada 70 % (art. 46 Ley 675)" },
              { value: "UNANIME", label: "Unanimidad" },
            ]}
            hint="La calificada se mide sobre el total de coeficientes del conjunto."
          />
          <SelectField
            name="ponderacion"
            label="Cómo se cuenta cada voto"
            placeholder={false}
            defaultValue="COEFICIENTE"
            options={[
              { value: "COEFICIENTE", label: "Por coeficiente de copropiedad" },
              { value: "UNIDAD", label: "Una unidad, un voto" },
            ]}
          />
          <SelectField
            name="quienVota"
            label="Quién puede votar"
            placeholder={false}
            defaultValue={cfg.bloqueoMora.votacion ? "PROPIETARIOS_AL_DIA" : "PROPIETARIOS"}
            options={[
              { value: "PROPIETARIOS", label: "Propietarios" },
              { value: "PROPIETARIOS_AL_DIA", label: "Propietarios al día" },
              { value: "TODOS", label: "Todos los residentes (un voto por unidad)" },
            ]}
            hint={cfg.bloqueoMora.votacion ? "El conjunto bloquea el voto de unidades en mora." : undefined}
          />
          <TextField name="fin" label="Cierra" type="datetime-local" required defaultValue={isoDateTimeLocal(addDays(new Date(), 7))} />
        </FormGrid>
        <CheckboxField name="secreto" label="Voto secreto" hint="No se guarda quién votó; cada unidad recibe un comprobante para verificar su voto." />
      </ActionForm>
    </div>
  );
}
