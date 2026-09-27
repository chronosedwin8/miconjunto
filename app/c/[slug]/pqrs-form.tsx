"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, ChoiceCards, FormGrid, TextAreaField, TextField } from "@/components/form/fields";
import { radicarPqrsPublicaAction } from "./actions";

const TIPOS = [
  { value: "PETICION", label: "Petición", description: "Información o trámite" },
  { value: "QUEJA", label: "Queja", description: "Inconformidad" },
  { value: "RECLAMO", label: "Reclamo", description: "Algo incorrecto" },
  { value: "SUGERENCIA", label: "Sugerencia", description: "Una idea" },
  { value: "FELICITACION", label: "Felicitación", description: "Un reconocimiento" },
];

/** Formulario PQRS para personas que no residen en el conjunto. */
export function PqrsPublicaForm({ slug, renderizadoEn, politicaUrl }: { slug: string; renderizadoEn: number; politicaUrl: string }) {
  const [res, setRes] = useState<{ radicado: string | null; fechaLimite: string | null } | null>(null);
  if (res) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center" role="status">
        <CircleCheck className="mx-auto size-12 text-success" />
        <p className="mt-2 text-lg font-bold">Recibimos tu solicitud</p>
        {res.radicado ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">Número de radicado</p>
            <p className="font-mono text-3xl font-bold text-primary">{res.radicado}</p>
            <p className="mt-3 text-sm">Te enviamos una copia a tu correo. Te responderemos dentro de los 15 días hábiles siguientes.</p>
          </>
        ) : (
          <p className="mt-3 text-sm">Te responderemos al correo que indicaste.</p>
        )}
      </div>
    );
  }
  return (
    <ActionForm
      action={radicarPqrsPublicaAction}
      extra={{ slug, ts: renderizadoEn }}
      refresh={false}
      submitLabel="Radicar solicitud"
      submitClassName="w-full h-12 text-base"
      onDone={(d) => setRes(d as { radicado: string | null; fechaLimite: string | null })}
      className="rounded-2xl border bg-card p-4"
    >
      <ChoiceCards name="tipo" options={TIPOS} defaultValue="PETICION" columns={2} />
      <FormGrid>
        <TextField name="nombre" label="Nombre completo" autoComplete="name" required />
        <TextField name="correo" label="Correo electrónico" type="email" autoComplete="email" inputMode="email" required />
      </FormGrid>
      <TextField name="telefono" label="Teléfono (opcional)" type="tel" autoComplete="tel" inputMode="tel" />
      <TextAreaField name="descripcion" label="Tu solicitud" placeholder="Describe con detalle tu petición, queja, reclamo o sugerencia." rows={6} required />
      {/* Campo trampa para robots: oculto para las personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <CheckboxField
        name="acepta"
        label="Autorizo el tratamiento de mis datos personales"
        hint={
          <>
            Solo para responder esta solicitud (Ley 1581 de 2012).{" "}
            <a href={politicaUrl} className="underline" target="_blank" rel="noreferrer">
              Política de datos
            </a>
          </>
        }
      />
    </ActionForm>
  );
}
