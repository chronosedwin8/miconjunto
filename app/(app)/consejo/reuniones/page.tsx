import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarMiembros, listarReuniones } from "@/lib/consejo/service";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { TextAreaField, TextField } from "@/components/form/fields";
import { fechaHora, isoDateTimeLocal } from "@/lib/format";
import { guardarReunionAction } from "../actions";

export const metadata = { title: "Reuniones del consejo" };

export default async function ReunionesPage() {
  const ctx = await requirePage("consejo.ver");
  const [reuniones, miembros] = await Promise.all([listarReuniones(ctx), listarMiembros(ctx)]);
  const gestiona = can(ctx, "consejo.gestionar");
  return (
    <Section
      titulo="Reuniones"
      acciones={
        gestiona ? (
          <FormDialog titulo="Nueva reunión" action={guardarReunionAction} triggerLabel="Nueva reunión" redirectTo="/consejo/reuniones/{id}" wide>
            <TextField name="tema" label="Tema" required />
            <TextField name="fecha" label="Fecha y hora" type="datetime-local" required defaultValue={isoDateTimeLocal(new Date())} />
            <TextField name="asistentes" label="Asistentes (separados por coma)" defaultValue={miembros.filter((m) => m.vigente).map((m) => m.nombre).join(", ")} />
            <TextAreaField name="decisiones" label="Decisiones" placeholder="Una por línea" />
            <TextAreaField name="actaTexto" label="Acta" rows={8} />
          </FormDialog>
        ) : null
      }
    >
      {reuniones.length === 0 ? (
        <EmptyState icon={CalendarDays} titulo="Sin reuniones registradas" descripcion="Registra cada reunión con su acta y decisiones." />
      ) : (
        <ul className="space-y-2">
          {reuniones.map((r) => (
            <li key={r.id}>
              <Link href={`/consejo/reuniones/${r.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="font-semibold">{r.tema}</p>
                  <p className="text-xs text-muted-foreground">
                    {fechaHora(r.fecha)} · {r.asistentes.length} asistente(s) · {r.decisiones ? `${r.decisiones.split("\n").filter(Boolean).length} decisión(es)` : "sin decisiones"}
                    {r.actaTexto ? " · con acta" : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
