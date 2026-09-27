import { CheckCircle2, CircleAlert, Send } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { obtenerAsamblea, plantillaConvocatoria, propietariosDestinatarios, revisarAntelacion } from "@/lib/asambleas/service";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton, ActionForm } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { fechaHora } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AsambleaForm } from "../../asamblea-form";
import { cancelarAsambleaAction, enviarConvocatoriaAction, guardarConvocatoriaAction } from "../../actions";

export const metadata = { title: "Convocatoria" };

export default async function ConvocatoriaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.crear");
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const ant = revisarAntelacion(a);
  const dest = await propietariosDestinatarios(ctx.conjuntoId);
  const editable = a.estado === "BORRADOR" || a.estado === "CONVOCADA";
  const texto = a.convocatoriaTexto ?? plantillaConvocatoria(ctx.conjunto.nombre, a);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <div className={cn("flex gap-3 rounded-xl border p-4 text-sm", ant.bloquea ? "border-destructive/40 bg-destructive/5" : ant.dias < ant.minimo ? "border-warning/40 bg-warning/10" : "border-success/40 bg-success/5")}>
          {ant.bloquea ? <CircleAlert className="size-6 shrink-0 text-destructive" /> : <CheckCircle2 className="size-6 shrink-0 text-success" />}
          <div>
            <p className="font-semibold">Antelación de la convocatoria (Ley 675, art. 39)</p>
            <p>{ant.mensaje}</p>
            {a.convocatoriaEnviadaEn && <p className="mt-1 text-muted-foreground">Enviada el {fechaHora(a.convocatoriaEnviadaEn)}.</p>}
          </div>
        </div>

        <Section titulo="Texto de la convocatoria">
          <ActionForm action={guardarConvocatoriaAction} extra={{ id }} submitLabel="Guardar texto" successMessage="Convocatoria guardada">
            <TextAreaField name="texto" label="Se envía por correo y notificación a todos los propietarios" defaultValue={texto} rows={18} className="[&_textarea]:min-h-96 [&_textarea]:font-mono [&_textarea]:text-sm" hint="Deja el campo vacío y guarda para restablecer la plantilla con el orden del día actual." />
          </ActionForm>
        </Section>
      </div>

      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">Envío masivo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {dest.correos.length} propietario(s) con correo · {dest.usuarioIds.length} con cuenta en la app (reciben notificación).
          </p>
          {editable && (
            <ActionButton
              action={enviarConvocatoriaAction}
              input={{ id }}
              className="mt-3 w-full"
              disabled={ant.bloquea}
              confirm={`¿Enviar la convocatoria a ${dest.correos.length} propietario(s)?`}
              successMessage="Convocatoria enviada"
            >
              <Send /> {a.convocatoriaEnviadaEn ? "Reenviar convocatoria" : "Enviar convocatoria"}
            </ActionButton>
          )}
          {ant.bloquea && <p className="mt-2 text-xs text-destructive">Cambia la fecha de la reunión para poder convocar.</p>}
        </div>
        {editable && (
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-3 font-semibold">Datos de la asamblea</p>
            <AsambleaForm a={a} />
          </div>
        )}
        {a.estado !== "FINALIZADA" && a.estado !== "CANCELADA" && (
          <FormDialog titulo="Cancelar asamblea" descripcion="Se avisará a los propietarios con el motivo." action={cancelarAsambleaAction} extra={{ id }} triggerLabel="Cancelar asamblea" triggerVariant="destructive" submitLabel="Cancelar asamblea" confirm="¿Cancelar la asamblea?">
            <TextAreaField name="motivo" label="Motivo" required />
          </FormDialog>
        )}
      </aside>
    </div>
  );
}
