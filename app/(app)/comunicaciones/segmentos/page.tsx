import { Pencil } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { contarDestinatarios, describirDef, listarSegmentos, nombresDesdeOpciones, normalizarDef, opcionesSegmento } from "@/lib/segmentos";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SegmentoBuilder } from "../_components/segmento-builder";
import { contarSegmentoAction, eliminarSegmentoAction, guardarSegmentoAction } from "./actions";

export const metadata = { title: "Segmentos" };

export default async function SegmentosPage() {
  const ctx = await requirePage("comunicaciones.segmentos");
  const [segmentos, opciones] = await Promise.all([listarSegmentos(ctx), opcionesSegmento(ctx)]);
  const nombres = nombresDesdeOpciones(opciones);
  const conteos = await Promise.all(segmentos.map((s) => contarDestinatarios(ctx, s.definicion)));

  const campos = (s?: (typeof segmentos)[number]) => (
    <>
      <TextField name="nombre" label="Nombre" defaultValue={s?.nombre} required placeholder="Ej.: Torre 2 en mora" maxLength={80} />
      <TextField name="descripcion" label="Descripción (opcional)" defaultValue={s?.descripcion ?? ""} maxLength={300} />
      <div className="space-y-1.5">
        <Label>Filtros</Label>
        <SegmentoBuilder name="definicion" opciones={opciones} contar={contarSegmentoAction} defaultDef={s ? (normalizarDef(s.definicion) as never) : null} permitirTodos={false} />
      </div>
    </>
  );

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Los segmentos son filtros reutilizables de destinatarios para el muro, el correo masivo, encuestas y votaciones. Los destinatarios se calculan en el momento del envío.
      </p>
      <div className="mb-4">
        <FormDialog titulo="Nuevo segmento" action={guardarSegmentoAction} triggerLabel="Nuevo segmento" wide successMessage="Segmento guardado">
          {campos()}
        </FormDialog>
      </div>
      {segmentos.length === 0 ? (
        <EmptyState titulo="Aún no hay segmentos" descripcion="Crea filtros como “Torre 1”, “Propietarios en mora” o “Hogares con mascotas”." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {segmentos.map((s, i) => (
            <li key={s.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{s.nombre}</p>
                  {s.descripcion && <p className="text-sm text-muted-foreground">{s.descripcion}</p>}
                </div>
                <FormDialog
                  titulo={`Editar ${s.nombre}`}
                  action={guardarSegmentoAction}
                  extra={{ id: s.id }}
                  wide
                  successMessage="Segmento actualizado"
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Editar ${s.nombre}`}>
                      <Pencil />
                    </Button>
                  }
                >
                  {campos(s)}
                </FormDialog>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {describirDef(normalizarDef(s.definicion), nombres).map((c) => (
                  <Badge key={c} variant="secondary">
                    {c}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  <b className="text-foreground tabular-nums">{conteos[i].usuarios}</b> usuarios · <b className="text-foreground tabular-nums">{conteos[i].correos}</b> correos
                  {conteos[i].unidades !== null && (
                    <>
                      {" "}
                      · <b className="text-foreground tabular-nums">{conteos[i].unidades}</b> unidades
                    </>
                  )}
                </span>
                <ActionButton action={eliminarSegmentoAction} input={{ id: s.id }} variant="ghost" size="sm" confirm={`¿Eliminar el segmento “${s.nombre}”?`} successMessage="Segmento eliminado">
                  Eliminar
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
