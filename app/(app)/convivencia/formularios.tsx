import type { Ctx } from "@/lib/auth/context";
import { options } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { infraccionOptions, personaOptions } from "@/lib/convivencia/options";
import { FormDialog } from "@/components/app/form-dialog";
import { FileField, MoneyField, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { crearLlamadoAction, proponerMultaAction } from "./actions";

/** Diálogo "Nuevo llamado de atención" (admin/consejo). */
export async function NuevoLlamado({ ctx, unidadId }: { ctx: Ctx; unidadId?: string }) {
  const [unidades, personas, infracciones] = await Promise.all([unidadOptions(ctx), personaOptions(ctx), infraccionOptions(ctx)]);
  return (
    <FormDialog
      titulo="Nuevo llamado de atención"
      descripcion="El residente lo recibirá en la app y por correo. Redáctalo de forma respetuosa y describe los hechos, no a la persona."
      action={crearLlamadoAction}
      triggerLabel="Nuevo llamado"
      submitLabel="Enviar llamado"
      successMessage="Llamado enviado"
      redirectTo="/convivencia/llamados/{id}"
      wide
    >
      <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={unidadId} required />
      <SearchSelect name="personaId" label="Persona (opcional)" options={personas} />
      <SelectField name="infraccionId" label="Motivo según el manual de convivencia" options={infracciones} placeholder="Otro motivo" />
      <TextField name="motivo" label="Otro motivo" hint="Solo si no está en el catálogo." />
      <SelectField name="gravedad" label="Gravedad" options={options(["LEVE", "MODERADA", "GRAVE"])} placeholder="Según el catálogo" />
      <TextAreaField name="descripcion" label="Descripción de los hechos" placeholder="Fecha, hora, lugar y qué sucedió." required />
      <FileField name="evidencias" label="Evidencia (fotos)" multiple folder="convivencia" />
    </FormDialog>
  );
}

/** Diálogo "Proponer multa" (inicia el debido proceso). */
export async function ProponerMulta({ ctx, unidadId, llamadoId, triggerLabel = "Proponer multa", variant = "default" }: { ctx: Ctx; unidadId?: string; llamadoId?: string; triggerLabel?: string; variant?: "default" | "outline" }) {
  const [unidades, infracciones] = await Promise.all([unidadOptions(ctx), infraccionOptions(ctx)]);
  return (
    <FormDialog
      titulo="Proponer multa"
      descripcion="La propuesta no se cobra: primero se notifica al residente, quien tiene un plazo para presentar descargos, y luego decide el consejo."
      action={proponerMultaAction}
      extra={llamadoId ? { llamadoId } : undefined}
      triggerLabel={triggerLabel}
      triggerVariant={variant}
      submitLabel="Guardar propuesta"
      successMessage="Multa propuesta"
      redirectTo="/convivencia/multas/{id}"
      wide
    >
      <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={unidadId} required />
      <SelectField name="infraccionId" label="Infracción" options={infracciones} placeholder={llamadoId ? "La del llamado" : "Selecciona…"} />
      <MoneyField name="valor" label="Valor" hint="Si lo dejas vacío se usa el valor sugerido del catálogo." />
      <TextAreaField name="descripcion" label="Descripción" placeholder="Hechos, reincidencia y artículo del manual que se incumple." required />
      <FileField name="evidencias" label="Evidencia (fotos)" multiple folder="convivencia" />
    </FormDialog>
  );
}
