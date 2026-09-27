"use client";

import { ActionForm } from "@/components/form/action-form";
import { FormGrid, SelectField, TextField } from "@/components/form/fields";
import { salidaAction } from "../actions";
import { offlineAction } from "./offline-action";
import { bigBtn } from "./kiosk";

const accion = offlineAction("SALIDA", (i) => `Salida de ${String(i.nombre ?? i.placa ?? "")}`, salidaAction);

/** Salida de alguien cuyo ingreso no quedó registrado (queda anotado en la bitácora). */
export function SalidaLibreForm({ placa }: { placa?: string }) {
  return (
    <ActionForm action={accion} submitLabel="Registrar salida" successMessage="Salida registrada" resetOnSuccess submitClassName={`${bigBtn} w-full`}>
      <FormGrid>
        <TextField name="nombre" label="Nombre" required className="[&_input]:h-14 [&_input]:text-lg" />
        <TextField name="placa" label="Placa" defaultValue={placa} className="[&_input]:h-14 [&_input]:font-mono [&_input]:text-lg [&_input]:uppercase" />
      </FormGrid>
      <SelectField
        name="sujeto"
        label="Tipo"
        placeholder={false}
        defaultValue="VISITANTE"
        options={[
          { value: "VISITANTE", label: "Visitante" },
          { value: "RESIDENTE", label: "Residente" },
          { value: "EMPLEADO", label: "Empleado" },
          { value: "PROVEEDOR", label: "Proveedor" },
          { value: "DOMICILIARIO", label: "Domiciliario" },
          { value: "VEHICULO", label: "Vehículo" },
        ]}
      />
      <TextField name="observaciones" label="Observaciones" />
    </ActionForm>
  );
}
