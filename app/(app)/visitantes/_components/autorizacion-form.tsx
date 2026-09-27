"use client";

import { useState } from "react";
import { Bike, Briefcase, CalendarClock, CalendarDays, HardHat, Repeat, Sun, User, UserCog } from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import { ChoiceCards, FileField, FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { crearAutorizacionAction as crearAccion } from "../actions";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Nueva autorización en ≤ 3 toques: tipo y "Hoy" vienen preseleccionados; solo se escribe el nombre. */
export function AutorizacionForm({ unidades, exigirSeguridadSocial }: { unidades: Option[]; exigirSeguridadSocial: boolean }) {
  const [tipo, setTipo] = useState("VISITA");
  const [cuando, setCuando] = useState("HOY");
  const [mas, setMas] = useState(false);
  return (
    <ActionForm action={crearAccion} submitLabel="Generar código de ingreso" successMessage="Autorización creada" redirectTo="/visitantes/{id}?nuevo=1" submitClassName="h-14 w-full text-lg font-bold">
      {unidades.length > 1 ? <SelectField name="unidadId" label="Unidad" options={unidades} defaultValue={unidades[0]?.value} placeholder={false} /> : <input type="hidden" name="unidadId" value={unidades[0]?.value ?? ""} />}
      <ChoiceCards
        name="tipo"
        columns={3}
        defaultValue="VISITA"
        onChange={(v) => {
          setTipo(v);
          if (v === "CONTRATISTA" || v === "TECNICO") setMas(true);
        }}
        options={[
          { value: "VISITA", label: "Visita", icon: <User className="size-5" /> },
          { value: "DOMICILIO", label: "Domicilio", icon: <Bike className="size-5" /> },
          { value: "TECNICO", label: "Técnico", icon: <UserCog className="size-5" /> },
          { value: "PROVEEDOR", label: "Proveedor", icon: <Briefcase className="size-5" /> },
          { value: "CONTRATISTA", label: "Contratista", icon: <HardHat className="size-5" /> },
          { value: "OTRO", label: "Empleado / otro", icon: <User className="size-5" /> },
        ]}
      />
      <TextField name="nombreVisitante" label="¿Quién viene?" placeholder="Nombre del visitante" required autoFocus autoComplete="off" className="[&_input]:h-12 [&_input]:text-lg" />
      <div>
        <p className="mb-2 text-sm font-medium">¿Cuándo?</p>
        <ChoiceCards
          name="cuando"
          columns={2}
          defaultValue="HOY"
          onChange={setCuando}
          options={[
            { value: "HOY", label: "Hoy", icon: <Sun className="size-5" /> },
            { value: "MANANA", label: "Mañana", icon: <CalendarDays className="size-5" /> },
            { value: "RANGO", label: "Otras fechas", icon: <CalendarClock className="size-5" /> },
            { value: "RECURRENTE", label: "Recurrente", description: "Empleados, cuidadores, clases", icon: <Repeat className="size-5" /> },
          ]}
        />
      </div>
      {cuando === "RANGO" && (
        <FormGrid>
          <TextField name="fechaInicio" type="datetime-local" label="Desde" required />
          <TextField name="fechaFin" type="datetime-local" label="Hasta" required />
        </FormGrid>
      )}
      {cuando === "RECURRENTE" && (
        <div className="space-y-3 rounded-xl border p-3">
          <p className="text-sm font-medium">Días que puede ingresar</p>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((d, i) => (
              <label key={d} className="grid h-11 min-w-12 cursor-pointer place-items-center rounded-lg border px-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground">
                <input type="checkbox" name="diasSemana[]" value={i} defaultChecked={i >= 1 && i <= 5} className="sr-only" />
                {d}
              </label>
            ))}
          </div>
          <FormGrid cols={3}>
            <TextField name="horaInicio" type="time" label="Desde las" defaultValue="07:00" />
            <TextField name="horaFin" type="time" label="Hasta las" defaultValue="18:00" />
            <TextField name="hasta" type="date" label="Hasta el día" required />
          </FormGrid>
        </div>
      )}
      {tipo === "CONTRATISTA" && (
        <FileField
          name="soporteSeguridadSocialUrl"
          label={`Soporte de seguridad social (planilla PILA)${exigirSeguridadSocial ? " *" : ""}`}
          accept="image/*,application/pdf"
          folder="porteria"
          hint={exigirSeguridadSocial ? "Portería no permitirá el ingreso sin este soporte." : undefined}
        />
      )}
      {!mas ? (
        <button type="button" onClick={() => setMas(true)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          + Documento, placa, número de ingresos y notas
        </button>
      ) : (
        <div className="space-y-4">
          <FormGrid>
            <TextField name="documentoVisitante" label="Documento del visitante" inputMode="numeric" />
            <TextField name="placa" label="Placa del vehículo" className="[&_input]:uppercase" />
          </FormGrid>
          {cuando !== "RECURRENTE" && <TextField name="usosPermitidos" type="number" min={1} max={50} label="Número de ingresos permitidos" defaultValue="1" />}
          <TextAreaField name="observaciones" label="Nota para portería" rows={2} placeholder="Ej.: trae un mueble; déjalo subir por el ascensor de carga" />
        </div>
      )}
    </ActionForm>
  );
}

