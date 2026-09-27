"use client";

import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, ChoiceCards, FileField, SearchSelect, TextAreaField, type Option } from "@/components/form/fields";
import { novedadAction } from "../actions";
import { offlineAction } from "./offline-action";
import { bigBtn } from "./kiosk";

const accion = offlineAction("NOVEDAD", (i) => `Novedad: ${String(i.descripcion ?? "").slice(0, 40)}`, novedadAction);

export function NovedadForm({ unidades, puedeTicket }: { unidades: Option[]; puedeTicket: boolean }) {
  return (
    <ActionForm action={accion} submitLabel="Registrar novedad" successMessage="Novedad registrada" redirectTo="/porteria/novedades" submitClassName={`${bigBtn} w-full`} draftKey="porteria-novedad">
      <div>
        <p className="mb-2 text-lg font-bold">¿Qué pasó?</p>
        <ChoiceCards
          name="tipo"
          columns={3}
          defaultValue="INCIDENTE"
          options={[
            { value: "RUIDO", label: "🔊 Ruido" },
            { value: "DANO", label: "🛠️ Daño" },
            { value: "SEGURIDAD", label: "🛡️ Seguridad" },
            { value: "INCIDENTE", label: "⚠️ Incidente" },
            { value: "SERVICIOS", label: "💡 Servicios" },
            { value: "EMERGENCIA", label: "🚨 Emergencia" },
          ]}
        />
      </div>
      <div>
        <p className="mb-2 text-lg font-bold">Severidad</p>
        <ChoiceCards
          name="severidad"
          columns={2}
          defaultValue="BAJA"
          options={[
            { value: "BAJA", label: "Baja" },
            { value: "MEDIA", label: "Media" },
            { value: "ALTA", label: "Alta", description: "Se avisa al administrador" },
            { value: "CRITICA", label: "Crítica", description: "Aviso inmediato por todos los canales" },
          ]}
        />
      </div>
      <TextAreaField name="descripcion" label="Descripción" required rows={4} className="[&_textarea]:text-lg" />
      <SearchSelect name="unidadId" label="Unidad relacionada (opcional)" options={unidades} />
      <FileField name="fotos" label="Fotos" multiple folder="porteria" />
      {puedeTicket && <CheckboxField name="crearTicket" label="Crear ticket de PQRS / daño" hint="Para que la administración le haga seguimiento (radicado y fecha límite)." />}
    </ActionForm>
  );
}
