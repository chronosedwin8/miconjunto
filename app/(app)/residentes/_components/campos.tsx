import type { Mascota, Persona, Vehiculo } from "@prisma/client";
import { CheckboxField, FileField, FormGrid, SearchSelect, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { isoDate } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { DIAS_SEMANA, type Horario } from "@/lib/residentes/calculos";

export const TIPOS_DOC = ["CC", "TI", "RC", "CE", "PA", "PPT", "PEP", "NIT"] as const;

/** Datos básicos de identificación de una persona (con foto desde la cámara). */
export function PersonaFields({ persona, conFoto = true, conContacto = true, compacto = false }: { persona?: Partial<Persona> | null; conFoto?: boolean; conContacto?: boolean; compacto?: boolean }) {
  return (
    <>
      <FormGrid>
        <TextField name="nombres" label="Nombres" defaultValue={persona?.nombres ?? ""} autoComplete="given-name" required />
        <TextField name="apellidos" label="Apellidos" defaultValue={persona?.apellidos ?? ""} autoComplete="family-name" required />
        <SelectField name="tipoDocumento" label="Tipo de documento" options={TIPOS_DOC.map((t) => ({ value: t, label: label(t) }))} defaultValue={persona?.tipoDocumento ?? "CC"} placeholder={false} />
        <TextField name="numeroDocumento" label="Número de documento" inputMode="numeric" defaultValue={persona?.numeroDocumento?.startsWith("PEND-") ? "" : (persona?.numeroDocumento ?? "")} required />
        <TextField name="fechaNacimiento" label="Fecha de nacimiento" type="date" defaultValue={isoDate(persona?.fechaNacimiento)} hint="Sirve para identificar menores y adultos mayores" />
        {!compacto && <SelectField name="genero" label="Género (opcional)" options={["Femenino", "Masculino", "Otro", "Prefiero no decir"].map((g) => ({ value: g, label: g }))} defaultValue={persona?.genero} />}
        {conContacto && (
          <>
            <TextField name="telefono" label="Celular" type="tel" inputMode="tel" autoComplete="tel" defaultValue={persona?.telefono ?? ""} />
            <TextField name="email" label="Correo" type="email" autoComplete="email" defaultValue={persona?.email ?? ""} />
          </>
        )}
      </FormGrid>
      {conFoto && <FileField name="fotoUrl" label="Foto" hint="Tómala con la cámara: portería la usa para reconocer a la persona" folder="personas" defaultValue={persona?.fotoUrl} />}
    </>
  );
}

/** Días y horas permitidos para empleados y visitantes frecuentes. */
export function HorarioFields({ horario }: { horario?: Horario | null }) {
  const dias = horario?.dias ?? [1, 2, 3, 4, 5];
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Días permitidos</legend>
      <div className="flex flex-wrap gap-1.5">
        {DIAS_SEMANA.map((d, i) => (
          <label key={d} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium">
            <input type="checkbox" name="horario.dias[]" value={i} defaultChecked={dias.includes(i)} className="sr-only" />
            {d.slice(0, 3)}
          </label>
        ))}
      </div>
      <FormGrid>
        <TextField name="horario.desde" label="Desde" type="time" defaultValue={horario?.desde ?? "07:00"} />
        <TextField name="horario.hasta" label="Hasta" type="time" defaultValue={horario?.hasta ?? "17:00"} />
      </FormGrid>
    </fieldset>
  );
}

/** Selección de unidad y tipo de vínculo (formulario del administrador). */
export function VinculoFields({ unidades, tipos, unidadId, tipo }: { unidades?: Option[]; tipos: readonly string[]; unidadId?: string; tipo?: string }) {
  return (
    <FormGrid>
      {unidades && <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={unidadId} required />}
      <SelectField name="tipo" label="Tipo de vínculo" options={options(tipos as string[])} defaultValue={tipo ?? tipos[0]} placeholder={false} />
    </FormGrid>
  );
}

export function EmergenciaFields({ persona }: { persona?: Partial<Persona> | null }) {
  return (
    <>
      <CheckboxField name="movilidadReducida" label="Tiene movilidad reducida o discapacidad" defaultChecked={persona?.movilidadReducida} />
      <TextAreaField name="movilidadDescripcion" label="¿Qué apoyo necesita?" placeholder="Ej.: usa silla de ruedas, necesita ayuda para bajar escaleras" defaultValue={persona?.movilidadDescripcion ?? ""} />
      <CheckboxField name="requiereAsistenciaEvacuacion" label="Requiere asistencia para evacuar" hint="Los brigadistas y portería la verán en la lista de evacuación" defaultChecked={persona?.requiereAsistenciaEvacuacion} />
      <FormGrid>
        <SelectField name="tipoSangre" label="Tipo de sangre" options={["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((t) => ({ value: t, label: t }))} defaultValue={persona?.tipoSangre} />
        <TextField name="eps" label="EPS" defaultValue={persona?.eps ?? ""} />
        <TextField name="contactoEmergenciaNombre" label="Contacto de emergencia" placeholder="Nombre y parentesco" defaultValue={persona?.contactoEmergenciaNombre ?? ""} />
        <TextField name="contactoEmergenciaTelefono" label="Teléfono del contacto" type="tel" inputMode="tel" defaultValue={persona?.contactoEmergenciaTelefono ?? ""} />
      </FormGrid>
    </>
  );
}

export function VehiculoFields({ vehiculo, unidades, unidadId, parqueaderos }: { vehiculo?: Vehiculo | null; unidades?: Option[]; unidadId?: string; parqueaderos: Option[] }) {
  return (
    <>
      {unidades && <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={vehiculo?.unidadId ?? unidadId} required />}
      <FormGrid>
        <TextField name="placa" label="Placa" defaultValue={vehiculo?.placa ?? ""} placeholder="ABC123" autoCapitalize="characters" className="[&_input]:uppercase" required />
        <SelectField name="tipo" label="Tipo" options={options(["CARRO", "MOTO", "BICICLETA", "OTRO"])} defaultValue={vehiculo?.tipo ?? "CARRO"} placeholder={false} />
        <TextField name="marca" label="Marca" defaultValue={vehiculo?.marca ?? ""} />
        <TextField name="modelo" label="Modelo (año)" inputMode="numeric" defaultValue={vehiculo?.modelo ?? ""} />
        <TextField name="color" label="Color" defaultValue={vehiculo?.color ?? ""} />
        <SelectField name="parqueaderoId" label="Parqueadero" options={parqueaderos} defaultValue={vehiculo?.parqueaderoId} placeholder="Sin parqueadero asignado" />
        <TextField name="soatVence" label="SOAT vence" type="date" defaultValue={isoDate(vehiculo?.soatVence)} />
        <TextField name="tecnomecanicaVence" label="Revisión tecnomecánica vence" type="date" defaultValue={isoDate(vehiculo?.tecnomecanicaVence)} />
      </FormGrid>
      <FormGrid>
        <FileField name="fotoUrl" label="Foto del vehículo" folder="vehiculos" defaultValue={vehiculo?.fotoUrl} />
        <FileField name="tarjetaPropiedadUrl" label="Tarjeta de propiedad" accept="image/*,application/pdf" folder="vehiculos" defaultValue={vehiculo?.tarjetaPropiedadUrl} />
      </FormGrid>
    </>
  );
}

export const ESPECIES = ["Perro", "Gato", "Ave", "Conejo", "Hámster", "Pez", "Otra"];

export function MascotaFields({ mascota, unidades, unidadId }: { mascota?: Mascota | null; unidades?: Option[]; unidadId?: string }) {
  return (
    <>
      {unidades && <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={mascota?.unidadId ?? unidadId} required />}
      <FormGrid>
        <TextField name="nombre" label="Nombre" defaultValue={mascota?.nombre ?? ""} required />
        <SelectField name="especie" label="Especie" options={ESPECIES.map((e) => ({ value: e, label: e }))} defaultValue={mascota?.especie ?? "Perro"} placeholder={false} />
        <TextField name="raza" label="Raza" defaultValue={mascota?.raza ?? ""} />
        <TextField name="color" label="Color" defaultValue={mascota?.color ?? ""} />
        <TextField name="antirrabicaVence" label="Vacuna antirrábica vence" type="date" defaultValue={isoDate(mascota?.antirrabicaVence)} />
        <TextField name="microchip" label="Microchip (opcional)" inputMode="numeric" defaultValue={mascota?.microchip ?? ""} />
      </FormGrid>
      <CheckboxField
        name="potencialmentePeligrosa"
        label="Raza potencialmente peligrosa"
        hint="Ley 746 de 2002 (Pitbull, Rottweiler, Dóberman, etc.): debe tener póliza de responsabilidad civil y salir con bozal y traílla."
        defaultChecked={mascota?.potencialmentePeligrosa}
      />
      <FormGrid cols={3}>
        <FileField name="fotoUrl" label="Foto" folder="mascotas" defaultValue={mascota?.fotoUrl} />
        <FileField name="carneVacunasUrl" label="Carné de vacunas" accept="image/*,application/pdf" folder="mascotas" defaultValue={mascota?.carneVacunasUrl} />
        <FileField name="polizaUrl" label="Póliza (si aplica)" accept="image/*,application/pdf" folder="mascotas" defaultValue={mascota?.polizaUrl} />
      </FormGrid>
    </>
  );
}
