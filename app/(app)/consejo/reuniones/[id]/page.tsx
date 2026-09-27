import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { obtenerReunion } from "@/lib/consejo/service";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { TextAreaField, TextField } from "@/components/form/fields";
import { fechaHora, isoDateTimeLocal } from "@/lib/format";
import { eliminarReunionAction, guardarReunionAction } from "../../actions";

export const metadata = { title: "Reunión del consejo" };

export default async function ReunionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("consejo.ver");
  const { id } = await params;
  const r = await obtenerReunion(ctx, id);
  const gestiona = can(ctx, "consejo.gestionar");
  const decisiones = (r.decisiones ?? "").split("\n").map((d) => d.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">{r.tema}</h2>
          <p className="text-sm text-muted-foreground">{fechaHora(r.fecha)}</p>
        </div>
        {gestiona && (
          <div className="flex gap-2">
            <FormDialog titulo="Editar reunión" action={guardarReunionAction} extra={{ id }} triggerLabel="Editar" triggerVariant="outline" wide>
              <TextField name="tema" label="Tema" required defaultValue={r.tema} />
              <TextField name="fecha" label="Fecha y hora" type="datetime-local" required defaultValue={isoDateTimeLocal(r.fecha)} />
              <TextField name="asistentes" label="Asistentes (separados por coma)" defaultValue={r.asistentes.join(", ")} />
              <TextAreaField name="decisiones" label="Decisiones" defaultValue={r.decisiones ?? ""} />
              <TextAreaField name="actaTexto" label="Acta" rows={10} defaultValue={r.actaTexto ?? ""} />
            </FormDialog>
            <ActionButton action={eliminarReunionAction} input={{ id }} variant="destructive" confirm="¿Eliminar esta reunión?" redirectTo="/consejo/reuniones">
              Eliminar
            </ActionButton>
          </div>
        )}
      </div>
      <Section titulo="Asistentes">
        <p className="text-sm">{r.asistentes.length ? r.asistentes.join(", ") : "—"}</p>
      </Section>
      <Section titulo="Decisiones">
        {decisiones.length ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {decisiones.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Sin decisiones registradas.</p>
        )}
      </Section>
      <Section titulo="Acta">
        <div className="whitespace-pre-line rounded-xl border bg-card p-4 text-sm leading-relaxed">{r.actaTexto || "Sin acta."}</div>
      </Section>
    </div>
  );
}
