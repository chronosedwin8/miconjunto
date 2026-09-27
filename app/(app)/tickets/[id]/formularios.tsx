"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import { FileField } from "@/components/form/fields";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { calificarAction, comentarAction } from "../actions";

/** Respuesta o comentario, con plantillas y opción de comentario interno. */
export function Responder({
  ticketId,
  plantillas,
  puedeInterno,
  placeholder = "Escribe un mensaje…",
  submitLabel = "Enviar",
}: {
  ticketId: string;
  plantillas: { id: string; titulo: string; contenido: string }[];
  puedeInterno: boolean;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const [clave, setClave] = useState(0);
  return (
    <ActionForm
      key={clave}
      action={comentarAction}
      extra={{ id: ticketId, interno: interno ? "true" : "false" }}
      submitLabel={interno ? "Guardar nota interna" : submitLabel}
      successMessage={interno ? "Nota interna guardada" : "Mensaje enviado"}
      onDone={() => {
        setTexto("");
        setInterno(false);
        setClave((k) => k + 1);
      }}
      className={cn("rounded-xl border p-3", interno && "border-amber-400 bg-amber-50 dark:bg-amber-950/30")}
    >
      {plantillas.length > 0 && !interno && (
        <select
          aria-label="Usar plantilla de respuesta"
          value=""
          onChange={(e) => {
            const p = plantillas.find((x) => x.id === e.target.value);
            if (p) setTexto((t) => (t ? `${t}\n\n${p.contenido}` : p.contenido));
          }}
          className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
        >
          <option value="">Usar una plantilla de respuesta…</option>
          {plantillas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo}
            </option>
          ))}
        </select>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`msg-${ticketId}`} className="sr-only">
          Mensaje
        </Label>
        <Textarea id={`msg-${ticketId}`} name="contenido" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={interno ? "Nota solo visible para el equipo de administración…" : placeholder} className="min-h-24" />
        {!interno && plantillas.length > 0 && <p className="text-xs text-muted-foreground">Variables: {"{{radicado}}"}, {"{{nombre}}"}, {"{{fecha_limite}}"}.</p>}
      </div>
      <FileField name="adjuntos" label="Adjuntos" multiple accept="image/*,video/mp4,application/pdf" folder="tickets" />
      {puedeInterno && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} className="size-5" />
          Comentario interno (el residente no lo ve)
        </label>
      )}
    </ActionForm>
  );
}

/** Calificación de 1 a 5 estrellas al cierre. */
export function Calificar({ ticketId }: { ticketId: string }) {
  const [valor, setValor] = useState(0);
  const textos = ["", "Muy mala", "Mala", "Regular", "Buena", "Excelente"];
  return (
    <ActionForm action={calificarAction} extra={{ id: ticketId, calificacion: valor || "" }} submitLabel="Enviar calificación" successMessage="¡Gracias por calificar!" className="rounded-xl border bg-primary/5 p-4">
      <p className="font-semibold">¿Cómo te atendimos?</p>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            onClick={() => setValor(n)}
            className="grid size-11 place-items-center rounded-lg"
          >
            <Star className={cn("size-8", n <= valor ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50")} />
          </button>
        ))}
        <span className="ml-2 text-sm text-muted-foreground">{textos[valor]}</span>
      </div>
      <Textarea name="comentario" placeholder="Comentario (opcional)" className="min-h-16" />
    </ActionForm>
  );
}
