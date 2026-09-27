import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { addDays, isoDate } from "@/lib/format";
import { unidadOptions } from "@/lib/conjunto/options";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { Section } from "@/components/app/page-header";
import { ActionForm } from "@/components/form/action-form";
import { FormGrid, MoneyField, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { ContratistasEditor } from "../contratistas-editor";
import { solicitarObraAction } from "../actions";

export const metadata = { title: "Solicitar obra" };

const TIPOS = [
  { value: "REMODELACION", label: "Remodelación" },
  { value: "REPARACION", label: "Reparación" },
  { value: "PINTURA", label: "Pintura" },
  { value: "INSTALACION", label: "Instalación (gas, aire, redes)" },
  { value: "OTRA", label: "Otra" },
];

export default async function NuevaObraPage() {
  const ctx = await requirePage(["obras.solicitar", "obras.aprobar"]);
  const gestor = can(ctx, "obras.aprobar");
  const unidades = await unidadOptions(ctx, { soloPropias: !gestor });
  const exige = conjuntoConfig(ctx).porteria.exigirSeguridadSocialContratistas;
  return (
    <Section titulo="Solicitar autorización de obra">
      <ActionForm action={solicitarObraAction} submitLabel="Enviar solicitud" successMessage="Solicitud enviada" redirectTo="/obras/{id}" draftKey="nueva-obra" className="max-w-2xl">
        {unidades.length > 1 || gestor ? (
          <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={unidades.length === 1 ? unidades[0].value : undefined} required />
        ) : (
          <input type="hidden" name="unidadId" value={unidades[0]?.value ?? ""} />
        )}
        <SelectField name="tipo" label="Tipo de obra" options={TIPOS} defaultValue="REMODELACION" placeholder={false} />
        <TextAreaField name="descripcion" label="¿Qué trabajos se harán?" placeholder="Cambio de piso de la cocina y baño social; no se intervienen muros estructurales." required />
        <FormGrid>
          <TextField name="fechaInicio" label="Inicio" type="date" defaultValue={isoDate(addDays(new Date(), 3))} required />
          <TextField name="fechaFin" label="Fin" type="date" defaultValue={isoDate(addDays(new Date(), 10))} required />
        </FormGrid>
        <TextField name="horario" label="Horario de trabajo" defaultValue="L-V 8:00-17:00, S 8:00-13:00" hint="Según el manual de convivencia. La administración puede ajustarlo al aprobar." />
        {gestor && <MoneyField name="deposito" label="Depósito (opcional)" />}
        <ContratistasEditor />
        {exige && <p className="text-xs text-muted-foreground">Para aprobar la obra, cada contratista debe tener seguridad social vigente hasta la fecha de fin.</p>}
      </ActionForm>
    </Section>
  );
}
