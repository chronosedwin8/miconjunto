"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FileField, MoneyField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { calificarAction, cancelarReservaAction, checkInAction, checkOutAction, rechazarReservaAction } from "./actions";

/** Lista de chequeo del acta (casillas grandes, envía `checklist[]` y `items[]`). */
function Checklist({ items, marcadosPorDefecto }: { items: string[]; marcadosPorDefecto?: boolean }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-sm font-medium">Lista de chequeo</legend>
      {items.map((i) => (
        <label key={i} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="hidden" name="items[]" value={i} />
          <input type="checkbox" name="checklist[]" value={i} defaultChecked={marcadosPorDefecto} className="size-5 accent-[var(--brand)]" />
          {i}
        </label>
      ))}
    </fieldset>
  );
}

export function ActaDialog({ id, tipo, items, zona, trigger }: { id: string; tipo: "entrega" | "recepcion"; items: string[]; zona: string; trigger?: React.ReactNode }) {
  const [danos, setDanos] = useState(false);
  const entrega = tipo === "entrega";
  return (
    <FormDialog
      titulo={entrega ? `Entregar ${zona} (check-in)` : `Recibir ${zona} (check-out)`}
      descripcion={entrega ? "Revisa el estado de la zona con el residente y toma fotos." : "Verifica cómo se devuelve la zona. Si hay daños se crea un ticket."}
      action={entrega ? checkInAction : checkOutAction}
      extra={{ id }}
      submitLabel={entrega ? "Registrar entrega" : "Registrar recepción"}
      successMessage={entrega ? "Check-in registrado" : "Check-out registrado"}
      trigger={trigger}
      triggerLabel={entrega ? "Check-in" : "Check-out"}
    >
      <Checklist items={items} marcadosPorDefecto={entrega} />
      <FileField name="fotos" label="Fotos del acta" multiple folder="reservas" hint="Toma fotos de la zona con la cámara" />
      <TextAreaField name="observaciones" label="Observaciones" placeholder="Estado general, elementos entregados, novedades…" />
      {!entrega && (
        <>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-destructive has-[:checked]:bg-destructive/5">
            <input type="hidden" name="danos" value="false" />
            <input type="checkbox" name="danos" value="true" checked={danos} onChange={(e) => setDanos(e.target.checked)} className="mt-0.5 size-5 accent-[var(--brand)]" />
            <span className="text-sm">
              <span className="font-medium">Se encontraron daños</span>
              <span className="block text-xs text-muted-foreground">Se crea un ticket de daño en zona común</span>
            </span>
          </label>
          {danos && (
            <>
              <TextAreaField name="descripcionDano" label="¿Qué daño encontraste?" required />
              <CheckboxField name="proponerMulta" label="Proponer multa a la unidad" hint="Queda en estado propuesta para el debido proceso" />
              <MoneyField name="valorMulta" label="Valor sugerido de la multa" hint="Vacío = valor del catálogo" />
            </>
          )}
        </>
      )}
    </FormDialog>
  );
}

export function CancelarDialog({ id, aviso }: { id: string; aviso: string }) {
  return (
    <FormDialog
      titulo="Cancelar reserva"
      descripcion={aviso}
      action={cancelarReservaAction}
      extra={{ id }}
      submitLabel="Sí, cancelar reserva"
      successMessage="Reserva cancelada"
      triggerLabel="Cancelar reserva"
      triggerVariant="destructive"
      confirm="¿Seguro que quieres cancelar la reserva?"
    >
      <TextField name="motivo" label="Motivo (opcional)" placeholder="Ej.: cambio de planes" />
    </FormDialog>
  );
}

export function RechazarDialog({ id }: { id: string }) {
  return (
    <FormDialog titulo="Rechazar reserva" action={rechazarReservaAction} extra={{ id }} submitLabel="Rechazar" successMessage="Reserva rechazada" triggerLabel="Rechazar" triggerVariant="destructive">
      <TextField name="motivo" label="Motivo del rechazo" required placeholder="Se le informará al residente" />
    </FormDialog>
  );
}

export function Calificar({ id }: { id: string }) {
  const [valor, setValor] = useState(0);
  return (
    <ActionForm action={calificarAction} extra={{ id, calificacion: String(valor) }} submitLabel="Enviar calificación" successMessage="¡Gracias por tu calificación!">
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={`${n} estrella${n > 1 ? "s" : ""}`} onClick={() => setValor(n)} className="grid size-12 place-items-center">
            <Star className={cn("size-9 transition", n <= valor ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      <TextAreaField name="comentario" label="Comentario (opcional)" placeholder="¿Cómo estuvo la zona?" />
    </ActionForm>
  );
}

export function BotonGrande({ children, className, ...p }: React.ComponentProps<typeof Button>) {
  return (
    <Button size="lg" className={cn("h-14 flex-1 text-base", className)} {...p}>
      {children}
    </Button>
  );
}
