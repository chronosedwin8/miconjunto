import { Siren } from "lucide-react";
import { FormDialog } from "@/components/app/form-dialog";
import { CheckboxField, ChoiceCards, TextAreaField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { activarAlertaAction } from "./actions";

/** Botón para activar una emergencia general (administración o portería). */
export function ActivarEmergencia({ aTodosPorDefecto }: { aTodosPorDefecto: boolean }) {
  return (
    <FormDialog
      titulo="Activar emergencia"
      descripcion="Se notificará de inmediato a administración, consejo y portería."
      action={activarAlertaAction}
      submitLabel="Activar alerta"
      successMessage="Alerta activada y notificada"
      confirm="¿Confirmas que quieres activar la alerta de emergencia?"
      trigger={
        <Button className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto" size="lg">
          <Siren /> Activar emergencia
        </Button>
      }
    >
      <ChoiceCards
        name="tipo"
        columns={2}
        defaultValue="EMERGENCIA_GENERAL"
        options={[
          { value: "EMERGENCIA_GENERAL", label: "Emergencia general" },
          { value: "INCENDIO", label: "Incendio" },
          { value: "SISMO", label: "Sismo" },
          { value: "MEDICA", label: "Médica" },
          { value: "SEGURIDAD", label: "Seguridad" },
        ]}
      />
      <TextAreaField name="mensaje" label="Instrucciones o detalle" placeholder="Ej.: evacuar la torre 2 por la escalera norte hacia el punto de encuentro del parque" />
      <CheckboxField name="aTodos" label="Avisar a todos los residentes" hint="Envía una notificación push a todas las personas del conjunto." defaultChecked={aTodosPorDefecto} />
    </FormDialog>
  );
}
