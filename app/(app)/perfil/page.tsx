import { requireCtx } from "@/lib/auth/context";
import { isoDate } from "@/lib/format";
import { label } from "@/lib/labels";
import { miUsuario } from "@/lib/perfil/service";
import { miPersona } from "@/lib/residentes/service";
import { Section } from "@/components/app/page-header";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FileField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { TIPOS_DOC } from "../residentes/_components/campos";
import { actualizarMisDatosAction } from "./actions";

export const metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const ctx = await requireCtx();
  const [u, p] = await Promise.all([miUsuario(ctx), miPersona(ctx)]);
  return (
    <ActionForm action={actualizarMisDatosAction} successMessage="Tus datos quedaron actualizados">
      <Section titulo="Cuenta">
        <div className="space-y-4 rounded-xl border bg-card p-4">
          <FileField name="fotoUrl" label="Foto de perfil" folder="perfil" defaultValue={u.fotoUrl} />
          <FormGrid>
            <TextField name="nombre" label="Nombre para mostrar" defaultValue={u.nombre} autoComplete="name" required />
            <TextField name="telefono" label="Celular" type="tel" inputMode="tel" autoComplete="tel" defaultValue={u.telefono ?? ""} hint="Para avisos por WhatsApp" />
          </FormGrid>
          <TextField name="email" label="Correo (usuario de acceso)" defaultValue={u.email} disabled hint="Para cambiarlo, escribe a la administración." />
        </div>
      </Section>
      {p ? (
        <>
          <Section titulo="Datos personales">
            <div className="rounded-xl border bg-card p-4">
              <FormGrid>
                <TextField name="persona.nombres" label="Nombres" defaultValue={p.nombres} required />
                <TextField name="persona.apellidos" label="Apellidos" defaultValue={p.apellidos} required />
                <SelectField name="persona.tipoDocumento" label="Tipo de documento" options={TIPOS_DOC.map((t) => ({ value: t, label: label(t) }))} defaultValue={p.tipoDocumento} placeholder={false} />
                <TextField name="persona.numeroDocumento" label="Número de documento" inputMode="numeric" defaultValue={p.numeroDocumento.startsWith("PEND-") ? "" : p.numeroDocumento} required />
                <TextField name="persona.fechaNacimiento" label="Fecha de nacimiento" type="date" defaultValue={isoDate(p.fechaNacimiento)} />
                <SelectField name="persona.genero" label="Género (opcional)" options={["Femenino", "Masculino", "Otro", "Prefiero no decir"].map((g) => ({ value: g, label: g }))} defaultValue={p.genero} />
                <TextField name="persona.ocupacion" label="Ocupación" defaultValue={p.ocupacion ?? ""} />
              </FormGrid>
            </div>
          </Section>
          <Section titulo="Salud y emergencias">
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">Solo la ven la administración, portería y los brigadistas para atenderte en una emergencia.</p>
              <FormGrid>
                <SelectField name="persona.tipoSangre" label="Tipo de sangre" options={["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((t) => ({ value: t, label: t }))} defaultValue={p.tipoSangre} />
                <TextField name="persona.eps" label="EPS" defaultValue={p.eps ?? ""} />
                <TextField name="persona.contactoEmergenciaNombre" label="Contacto de emergencia" defaultValue={p.contactoEmergenciaNombre ?? ""} />
                <TextField name="persona.contactoEmergenciaTelefono" label="Teléfono del contacto" type="tel" inputMode="tel" defaultValue={p.contactoEmergenciaTelefono ?? ""} />
              </FormGrid>
              <CheckboxField name="persona.movilidadReducida" label="Tengo movilidad reducida o discapacidad" defaultChecked={p.movilidadReducida} />
              <TextAreaField name="persona.movilidadDescripcion" label="¿Qué apoyo necesitas?" defaultValue={p.movilidadDescripcion ?? ""} />
              <CheckboxField name="persona.requiereAsistenciaEvacuacion" label="Necesito asistencia para evacuar" defaultChecked={p.requiereAsistenciaEvacuacion} />
            </div>
          </Section>
        </>
      ) : (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Tu cuenta no está vinculada a una persona registrada en este conjunto.</p>
      )}
    </ActionForm>
  );
}
