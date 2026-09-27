"use client";

import { ActionForm } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { abrirTurnoAction, cerrarTurnoAction } from "../actions";
import { SignaturePad } from "./signature-pad";
import { bigBtn } from "./kiosk";

/** Apertura / cierre de turno: checklist de elementos recibidos/entregados, novedades y firma en pantalla. */
export function TurnoForm({ modo, elementos }: { modo: "abrir" | "cerrar"; elementos: string[] }) {
  return (
    <ActionForm
      action={modo === "abrir" ? abrirTurnoAction : cerrarTurnoAction}
      submitLabel={modo === "abrir" ? "Abrir turno" : "Cerrar turno"}
      successMessage={modo === "abrir" ? "Turno abierto. ¡Buen turno!" : "Turno cerrado"}
      submitClassName={`${bigBtn} w-full`}
      confirm={modo === "cerrar" ? "¿Cerrar tu turno? Verifica que entregaste todos los elementos." : undefined}
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 text-lg font-bold">{modo === "abrir" ? "Elementos que recibes" : "Elementos que entregas"}</legend>
        {elementos.map((e, i) => (
          <div key={e} className="rounded-xl border-2 p-2">
            <input type="hidden" name={`checklist.${i}.elemento`} value={e} />
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-1 has-[:checked]:font-bold">
              <input type="hidden" name={`checklist.${i}.ok`} value="false" />
              <input type="checkbox" name={`checklist.${i}.ok`} value="true" defaultChecked className="size-7 accent-[var(--brand)]" />
              <span className="flex-1 text-lg">{e}</span>
            </label>
            <input name={`checklist.${i}.nota`} placeholder="Observación (opcional)" aria-label={`Observación de ${e}`} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-base" />
          </div>
        ))}
      </fieldset>
      <TextAreaField name="novedades" label={modo === "abrir" ? "Novedades al recibir el turno" : "Novedades al entregar el turno"} rows={3} placeholder="Ej.: la puerta vehicular quedó lenta; paquete grande en bodega…" />
      <SignaturePad name="firma" label="Firma del portero" />
    </ActionForm>
  );
}
