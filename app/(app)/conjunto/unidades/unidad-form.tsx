import type { Unidad } from "@prisma/client";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { options } from "@/lib/labels";
import { toNumber } from "@/lib/format";
import { guardarUnidadAction } from "../actions";

export function UnidadForm({ unidad, torres, puedeCoeficientes }: { unidad?: Unidad | null; torres: { value: string; label: string }[]; puedeCoeficientes: boolean }) {
  const med = (unidad?.medidores ?? {}) as Record<string, string>;
  return (
    <ActionForm
      action={guardarUnidadAction}
      extra={unidad ? { id: unidad.id } : undefined}
      successMessage={unidad ? "Unidad actualizada" : "Unidad creada"}
      redirectTo={unidad ? undefined : "/conjunto/unidades/{id}"}
      draftKey={unidad ? undefined : "nueva-unidad"}
    >
      <FormGrid cols={3}>
        <TextField name="codigo" label="Código" placeholder="T2-501 o Casa 14" defaultValue={unidad?.codigo} required />
        <SelectField name="torreId" label="Torre / bloque" options={torres} placeholder="Sin torre (casa)" defaultValue={unidad?.torreId} />
        <SelectField name="tipo" label="Tipo" options={options(["APARTAMENTO", "CASA", "LOCAL", "OFICINA", "DEPOSITO", "PARQUEADERO"])} defaultValue={unidad?.tipo ?? "APARTAMENTO"} placeholder={false} />
        <TextField name="piso" label="Piso" type="number" inputMode="numeric" defaultValue={unidad?.piso ?? ""} />
        <TextField name="areaPrivada" label="Área privada (m²)" inputMode="decimal" defaultValue={unidad?.areaPrivada?.toString() ?? ""} />
        <TextField name="areaConstruida" label="Área construida (m²)" inputMode="decimal" defaultValue={unidad?.areaConstruida?.toString() ?? ""} />
        {puedeCoeficientes && (
          <>
            <TextField name="coeficiente" label="Coeficiente de copropiedad (%)" inputMode="decimal" step="0.000001" defaultValue={unidad ? toNumber(unidad.coeficiente).toString() : ""} hint="Hasta 6 decimales" />
            <MoneyField name="cuotaAdministracion" label="Cuota de administración vigente" defaultValue={unidad ? toNumber(unidad.cuotaAdministracion) : undefined} hint="Vacío = calcular por coeficiente" />
            {unidad && <TextField name="motivoCambioCoeficiente" label="Motivo del cambio de coeficiente" placeholder="Acta de asamblea, reforma…" />}
          </>
        )}
        <SelectField name="estadoOcupacion" label="Ocupación" options={options(["PROPIETARIO_OCUPA", "ARRENDADA", "AIRBNB_O_SIMILAR", "DESOCUPADA", "EN_VENTA"])} defaultValue={unidad?.estadoOcupacion ?? "PROPIETARIO_OCUPA"} placeholder={false} />
        <TextField name="plataformaRentaCorta" label="Plataforma de renta corta" placeholder="Airbnb, Booking…" defaultValue={unidad?.plataformaRentaCorta ?? ""} />
        <TextField name="registroRnt" label="Registro RNT" defaultValue={unidad?.registroRnt ?? ""} />
        <TextField name="matriculaInmobiliaria" label="Matrícula inmobiliaria" defaultValue={unidad?.matriculaInmobiliaria ?? ""} />
        <TextField name="numeroCatastral" label="Número catastral" defaultValue={unidad?.numeroCatastral ?? ""} />
        <TextField name="estrato" label="Estrato" type="number" defaultValue={unidad?.estrato ?? ""} />
        <TextField name="habitaciones" label="Habitaciones" type="number" defaultValue={unidad?.habitaciones ?? ""} />
        <TextField name="banos" label="Baños" type="number" defaultValue={unidad?.banos ?? ""} />
        <TextField name="medidores.agua" label="Medidor de agua" defaultValue={med.agua ?? ""} />
        <TextField name="medidores.luz" label="Medidor de energía" defaultValue={med.luz ?? ""} />
        <TextField name="medidores.gas" label="Medidor de gas" defaultValue={med.gas ?? ""} />
      </FormGrid>
      <TextAreaField name="notasEstructura" label="Notas de estructura (acabados, cuarto técnico…)" defaultValue={unidad?.notasEstructura ?? ""} />
      <FormGrid cols={3}>
        <CheckboxField name="balconTerraza" label="Balcón o terraza" defaultChecked={unidad?.balconTerraza} />
        <CheckboxField name="tienePersonaMovilidadReducida" label="Persona con movilidad reducida" defaultChecked={unidad?.tienePersonaMovilidadReducida} />
        <CheckboxField name="requiereAsistenciaEvacuacion" label="Requiere asistencia en evacuación" defaultChecked={unidad?.requiereAsistenciaEvacuacion} />
      </FormGrid>
    </ActionForm>
  );
}
