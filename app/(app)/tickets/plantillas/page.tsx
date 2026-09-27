import { Pencil } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { label, options } from "@/lib/labels";
import { listarPlantillas } from "@/lib/tickets/service";
import { TIPOS_TICKET } from "@/lib/tickets/reglas";
import { PageHeader } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { TabsGestion } from "../tabs";
import { eliminarPlantillaAction, guardarPlantillaAction } from "../actions";

export const metadata = { title: "Plantillas de respuesta" };

export default async function PlantillasPage() {
  const ctx = await requirePage("tickets.gestionar");
  const plantillas = await listarPlantillas(ctx);
  const campos = (p?: (typeof plantillas)[number]) => (
    <>
      <TextField name="titulo" label="Título" defaultValue={p?.titulo} required />
      <SelectField name="tipoTicket" label="Tipo de ticket" options={options(TIPOS_TICKET)} defaultValue={p?.tipoTicket ?? ""} placeholder="Todos los tipos" />
      <TextAreaField name="contenido" label="Texto" defaultValue={p?.contenido} rows={7} required hint="Puedes usar {{radicado}}, {{nombre}}, {{fecha_limite}} y {{conjunto}}." />
    </>
  );
  return (
    <>
      <PageHeader
        titulo="PQRS y daños"
        descripcion="Respuestas frecuentes para contestar más rápido y con un tono uniforme."
        acciones={
          <FormDialog titulo="Nueva plantilla" action={guardarPlantillaAction} triggerLabel="Nueva plantilla" successMessage="Plantilla guardada" wide>
            {campos()}
          </FormDialog>
        }
      />
      <TabsGestion />
      {plantillas.length === 0 ? (
        <EmptyState titulo="Aún no hay plantillas" descripcion="Crea respuestas para los casos más comunes: daño recibido, visita técnica programada, solicitud resuelta…" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {plantillas.map((p) => (
            <li key={p.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">{p.tipoTicket ? label(p.tipoTicket) : "Todos los tipos"}</p>
                </div>
                <div className="flex gap-1">
                  <FormDialog titulo="Editar plantilla" action={guardarPlantillaAction} extra={{ id: p.id }} successMessage="Plantilla actualizada" wide trigger={<Button variant="ghost" size="icon-sm" aria-label="Editar"><Pencil /></Button>}>
                    {campos(p)}
                  </FormDialog>
                  <ActionButton action={eliminarPlantillaAction} input={{ id: p.id }} variant="ghost" size="sm" confirm={`¿Eliminar la plantilla "${p.titulo}"?`} successMessage="Plantilla eliminada">
                    Eliminar
                  </ActionButton>
                </div>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">{p.contenido}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
