"use client";

import { useState } from "react";
import { Bike, Briefcase, HardHat, Truck, User, UserCog } from "lucide-react";
import { ActionForm } from "@/components/form/action-form";
import { ChoiceCards, FileField, FormGrid, SearchSelect, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { ingresoManualAction } from "../actions";
import { offlineAction } from "./offline-action";
import { bigBtn } from "./kiosk";

const TIPOS = [
  { value: "VISITA", label: "Visita", sujeto: "VISITANTE", icon: <User className="size-5" /> },
  { value: "DOMICILIO", label: "Domicilio", sujeto: "DOMICILIARIO", icon: <Bike className="size-5" /> },
  { value: "PROVEEDOR", label: "Proveedor", sujeto: "PROVEEDOR", icon: <Briefcase className="size-5" /> },
  { value: "TECNICO", label: "Técnico", sujeto: "PROVEEDOR", icon: <UserCog className="size-5" /> },
  { value: "TRANSPORTE", label: "Transporte", sujeto: "PROVEEDOR", icon: <Truck className="size-5" /> },
  { value: "CONTRATISTA", label: "Contratista", sujeto: "PROVEEDOR", icon: <HardHat className="size-5" /> },
] as const;

const accion = offlineAction("INGRESO_MANUAL", (i) => `Ingreso de ${String(i.nombre ?? "")}`, ingresoManualAction);

export function IngresoManualForm({
  unidades,
  parqueaderos,
  inicial,
}: {
  unidades: Option[];
  parqueaderos: Option[];
  inicial?: { visitanteId?: string; nombre?: string; documento?: string | null; empresa?: string | null; tipo?: string; unidadId?: string; placa?: string | null; fotoUrl?: string | null };
}) {
  const [tipo, setTipo] = useState<string>(inicial?.tipo ?? "VISITA");
  const sujeto = TIPOS.find((t) => t.value === tipo)?.sujeto ?? "VISITANTE";
  return (
    <ActionForm action={accion} extra={{ sujeto, tipoVisitante: tipo, visitanteId: inicial?.visitanteId }} submitLabel="Registrar ingreso" successMessage="Ingreso registrado" redirectTo="/porteria" submitClassName={`${bigBtn} w-full`}>
      <ChoiceCards name="tipoSel" columns={3} defaultValue={tipo} onChange={setTipo} options={TIPOS.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} />
      <FormGrid>
        <TextField name="nombre" label="Nombre completo" defaultValue={inicial?.nombre} required autoFocus className="[&_input]:h-14 [&_input]:text-lg" />
        <TextField name="documento" label="Cédula / documento" inputMode="numeric" defaultValue={inicial?.documento ?? ""} className="[&_input]:h-14 [&_input]:text-lg" />
      </FormGrid>
      <SearchSelect name="unidadId" label="Unidad que visita" options={unidades} defaultValue={inicial?.unidadId} placeholder="Buscar unidad…" />
      {sujeto === "PROVEEDOR" && <TextField name="empresa" label="Empresa" defaultValue={inicial?.empresa ?? ""} />}
      <FormGrid>
        <TextField name="placa" label="Placa del vehículo" defaultValue={inicial?.placa ?? ""} className="[&_input]:h-14 [&_input]:font-mono [&_input]:text-lg [&_input]:uppercase" />
        <SelectField name="parqueaderoId" label="Parqueadero de visitantes" options={parqueaderos} placeholder="Sin parqueadero" />
      </FormGrid>
      <FileField name="fotoUrl" label="Foto (opcional)" folder="porteria" defaultValue={inicial?.fotoUrl ?? null} />
      <TextAreaField name="observaciones" label="Observaciones" rows={2} />
    </ActionForm>
  );
}
