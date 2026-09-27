"use client";

import { useState } from "react";
import { CalendarDays, Megaphone, Newspaper, SearchCheck, Siren } from "lucide-react";
import { ActionForm, type AnyAction } from "@/components/form/action-form";
import { CheckboxField, ChoiceCards, FormGrid, TextField } from "@/components/form/fields";
import { Label } from "@/components/ui/label";
import { SegmentoBuilder } from "@/app/(app)/comunicaciones/_components/segmento-builder";
import { EditorBloques } from "./editor-bloques";

type Opt = { value: string; label: string; group?: string };

const CATS = [
  { value: "AVISO", label: "Aviso", description: "Información oficial", icon: <Megaphone className="size-4" /> },
  { value: "NOTICIA", label: "Noticia", description: "Novedades del conjunto", icon: <Newspaper className="size-4" /> },
  { value: "EVENTO", label: "Evento", description: "Actividades y encuentros", icon: <CalendarDays className="size-4" /> },
  { value: "EMERGENCIA", label: "Emergencia", description: "Alerta urgente a todos", icon: <Siren className="size-4" /> },
  { value: "PERDIDO_ENCONTRADO", label: "Perdido / encontrado", description: "Objetos y mascotas", icon: <SearchCheck className="size-4" /> },
];

export function PublicacionForm({
  guardar,
  contar,
  opciones,
  segmentos,
  encuestas,
  inicial,
}: {
  guardar: AnyAction;
  contar: AnyAction;
  opciones: { torres: Opt[]; unidades: Opt[]; roles: Opt[] };
  segmentos: Opt[];
  encuestas: Opt[];
  inicial?: { id: string; titulo: string; categoria: string; contenido: unknown; fijada: boolean; permiteComentarios: boolean; venceEn: string; segmentoId: string | null; audiencia: unknown };
}) {
  const [categoria, setCategoria] = useState(inicial?.categoria ?? "AVISO");
  return (
    <ActionForm
      action={guardar}
      extra={{ id: inicial?.id }}
      submitLabel={inicial ? "Guardar cambios" : "Publicar"}
      successMessage={inicial ? "Publicación actualizada" : "Publicado en el muro"}
      redirectTo="/muro/{id}"
      draftKey={inicial ? undefined : "publicacion-nueva"}
      submitClassName="w-full"
    >
      <div className="space-y-1.5">
        <Label>Tipo de publicación</Label>
        <ChoiceCards name="categoria" options={CATS} defaultValue={categoria} onChange={setCategoria} />
      </div>
      {categoria === "EMERGENCIA" && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">Las emergencias se notifican de inmediato por push y WhatsApp (si está activo) a toda la audiencia.</p>
      )}
      <TextField name="titulo" label="Título" defaultValue={inicial?.titulo} required maxLength={150} placeholder="Ej.: Mantenimiento de ascensores Torre 2" />
      <div className="space-y-1.5">
        <Label>Contenido</Label>
        <EditorBloques name="contenido" defaultValue={inicial?.contenido} encuestas={encuestas} />
      </div>
      <div className="space-y-1.5">
        <Label>¿Quién lo ve?</Label>
        <SegmentoBuilder
          name="audiencia"
          segmentoName="segmentoId"
          segmentos={segmentos}
          opciones={opciones}
          contar={contar}
          defaultDef={(inicial?.audiencia as never) ?? null}
          defaultSegmentoId={inicial?.segmentoId}
          etiquetaTodos="Todo el conjunto"
        />
      </div>
      <FormGrid>
        <CheckboxField name="fijada" label="Fijar arriba del muro" defaultChecked={inicial?.fijada ?? false} />
        <CheckboxField name="permiteComentarios" label="Permitir comentarios" defaultChecked={inicial?.permiteComentarios ?? true} />
      </FormGrid>
      {!inicial && (
        <CheckboxField
          name="notificar"
          label="Enviar notificación push a la audiencia"
          hint="Los avisos y emergencias siempre notifican."
          defaultChecked={categoria === "AVISO" || categoria === "EMERGENCIA"}
          key={categoria}
        />
      )}
      <TextField name="venceEn" label="Deja de mostrarse el (opcional)" type="date" defaultValue={inicial?.venceEn ?? ""} />
    </ActionForm>
  );
}
