import { CheckboxField, FileField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { isoDate } from "@/lib/format";
import { label } from "@/lib/labels";
import { CATEGORIAS_DOCUMENTO } from "@/lib/documentos/service";

type Opt = { value: string; label: string };

export const ACEPTA_DOCS = "application/pdf,image/*,.doc,.docx,.xls,.xlsx";

/** Casillas de roles (vacío = todos). Envía `rolesVisibles[]`. */
export function RolesVisibles({ roles, seleccionados = [], nombre = "rolesVisibles" }: { roles: Opt[]; seleccionados?: string[]; nombre?: string }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">¿Quién puede verlo?</legend>
      <p className="text-xs text-muted-foreground">Si no marcas ninguno, lo ven todos los roles.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {roles.map((r) => (
          <label key={r.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="checkbox" name={`${nombre}[]`} value={r.value} defaultChecked={seleccionados.includes(r.value)} className="size-4 accent-[var(--brand)]" />
            {r.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CamposDocumento({
  carpetas,
  roles,
  inicial,
}: {
  carpetas: Opt[];
  roles: Opt[];
  inicial?: { titulo: string; descripcion: string | null; categoria: string; carpetaId: string | null; rolesVisibles: string[]; requiereAcuse: boolean; vence: Date | null; publicado: boolean; codigoVerificacion: string | null };
}) {
  return (
    <>
      {!inicial && <FileField name="archivoUrl" label="Archivo" accept={ACEPTA_DOCS} capture={false} folder="documentos" hint="PDF recomendado (máx. 10 MB). Del PDF se extrae el texto para búsquedas y el asistente." />}
      <TextField name="titulo" label="Título" required maxLength={150} defaultValue={inicial?.titulo} placeholder="Ej.: Reglamento de propiedad horizontal" />
      <FormGrid>
        <SelectField name="categoria" label="Categoría" required placeholder={false} defaultValue={inicial?.categoria ?? "OTRO"} options={CATEGORIAS_DOCUMENTO.map((c) => ({ value: c, label: label(c) }))} />
        <SelectField name="carpetaId" label="Carpeta" placeholder="Sin carpeta" defaultValue={inicial?.carpetaId} options={carpetas} />
      </FormGrid>
      <TextAreaField name="descripcion" label="Descripción (opcional)" maxLength={1000} defaultValue={inicial?.descripcion ?? ""} rows={2} />
      <RolesVisibles roles={roles} seleccionados={inicial?.rolesVisibles} />
      <FormGrid>
        <TextField name="vence" label="Vence (pólizas, contratos)" type="date" defaultValue={isoDate(inicial?.vence)} />
        {!inicial && <TextField name="notas" label="Notas de la versión" maxLength={500} placeholder="Ej.: Aprobado en asamblea 2026" />}
      </FormGrid>
      <CheckboxField name="requiereAcuse" label="Pedir confirmación de lectura" hint="Cada residente deberá confirmar “Leí el documento” (por versión)." defaultChecked={inicial?.requiereAcuse} />
      <CheckboxField name="publicado" label="Publicado" hint="Si lo desmarcas, solo la administración lo ve." defaultChecked={inicial?.publicado ?? true} />
      <CheckboxField name="generarCodigo" label="Generar código de verificación pública" hint={inicial?.codigoVerificacion ? `Código actual: ${inicial.codigoVerificacion}` : "Permite verificar su autenticidad en /verificar."} defaultChecked={!!inicial?.codigoVerificacion} />
      {!inicial && <CheckboxField name="notificar" label="Notificar a quienes pueden verlo" defaultChecked />}
    </>
  );
}
