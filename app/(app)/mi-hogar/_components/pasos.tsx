import Link from "next/link";
import { Accessibility, AlertTriangle, Car, HeartPulse, PawPrint, ShieldCheck, Users } from "lucide-react";
import type { Persona, VinculoUnidad } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { can } from "@/lib/permisos";
import { edad, fecha, nombreCompleto, parseLocal } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { prisma } from "@/lib/db";
import {
  VINCULOS_AUTORIZADOS,
  VINCULOS_HABITAN,
  VINCULOS_OCUPANTES,
  VINCULOS_PERSONAL,
  describirHorario,
  esMenorDeEdad,
  estadoVencimiento,
  type Horario,
} from "@/lib/residentes/calculos";
import { claveBorrador, leerBorrador } from "@/lib/residentes/panel";
import { esPropietarioDe, fichaFisica, miPersona, puedeEditarPersona, vinculosDeUnidad } from "@/lib/residentes/service";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton, ActionForm } from "@/components/form/action-form";
import { CheckboxField, ChoiceCards, FormGrid, SelectField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmergenciaFields, HorarioFields, MascotaFields, PersonaFields, VehiculoFields } from "../../residentes/_components/campos";
import { InvitarDialog } from "../../residentes/_components/invitar-dialog";
import {
  actualizarPersonaAction,
  actualizarVinculoAction,
  crearVinculoAction,
  eliminarMascotaAction,
  eliminarVehiculoAction,
  finalizarVinculoAction,
  guardarEmergenciaPersonaAction,
  guardarMascotaAction,
  guardarVehiculoAction,
  registrarPersonaAction,
} from "../../residentes/actions";
import { aceptarPoliticaPasoAction, guardarOcupacionAction, guardarPaso1Action, invitarAction, marcarPasoAction } from "../actions";
import { BorradorForm } from "./borrador-form";
import { Avatar, hrefPaso } from "./comun";

type P = { ctx: Ctx; unidadId: string; codigo: string };
type VinculoConPersona = VinculoUnidad & { persona: Persona };

/** Botón "Continuar" de los pasos de lista: marca el paso y pasa al siguiente. */
function Continuar({ unidadId, paso, texto = "Listo, continuar" }: { unidadId: string; paso: number; texto?: string }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <Button variant="ghost" render={<Link href={hrefPaso(paso - 1, unidadId)} />}>
        Anterior
      </Button>
      <ActionButton action={marcarPasoAction} input={{ unidadId, paso }} redirectTo={hrefPaso(paso + 1, unidadId)} className="w-full sm:w-auto">
        {texto}
      </ActionButton>
    </div>
  );
}

async function acciones(ctx: Ctx, unidadId: string, v: VinculoConPersona) {
  const editar = !v.persona.anonimizada && (await puedeEditarPersona(ctx, v.personaId));
  const propio = v.persona.usuarioId === ctx.userId;
  const retirar =
    can(ctx, "residentes.editar") &&
    !propio &&
    v.tipo !== "PROPIETARIO" &&
    v.tipo !== "COPROPIETARIO" &&
    (v.tipo !== "ARRENDATARIO" || esPropietarioDe(ctx, unidadId));
  return { editar, retirar, propio };
}

function Fila({ v, children, extra }: { v: VinculoConPersona; children?: React.ReactNode; extra?: React.ReactNode }) {
  const e = edad(v.persona.fechaNacimiento);
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-center gap-3">
        <Avatar nombre={v.persona.nombres} fotoUrl={v.persona.fotoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{nombreCompleto(v.persona)}</p>
          <p className="text-xs text-muted-foreground">
            {label(v.tipo)}
            {e !== null && ` · ${e} años`}
            {v.persona.usuarioId && " · usa la app"}
          </p>
          {extra}
        </div>
        {v.estado !== "ACTIVO" && <StatusBadge value={v.estado} />}
      </div>
      {children && <div className="flex flex-wrap gap-1.5 pl-14">{children}</div>}
    </li>
  );
}

// ─────────────── Paso 1: datos del titular ───────────────
export async function Paso1({ ctx, unidadId }: P) {
  const [persona, borrador, usuario] = await Promise.all([
    miPersona(ctx),
    leerBorrador<Record<string, string>>(ctx, claveBorrador(1, unidadId)),
    prisma.usuario.findUnique({ where: { id: ctx.userId }, select: { nombre: true, email: true, telefono: true } }),
  ]);
  const [nombres, ...resto] = (usuario?.nombre ?? "").split(" ");
  const base: Partial<Persona> = persona ?? { nombres, apellidos: resto.join(" "), email: usuario?.email, telefono: usuario?.telefono };
  const valores: Partial<Persona> = { ...base };
  if (borrador) {
    for (const [k, v] of Object.entries(borrador)) {
      if (k === "unidadId" || typeof v !== "string") continue;
      (valores as Record<string, unknown>)[k] = k === "fechaNacimiento" ? (v ? parseLocal(v) : null) : v;
    }
  }
  return (
    <BorradorForm clave={claveBorrador(1, unidadId)} action={guardarPaso1Action} extra={{ unidadId }} redirectTo={hrefPaso(2, unidadId)} successMessage="Tus datos quedaron guardados">
      {borrador && <p className="rounded-lg bg-info/10 p-3 text-sm">Recuperamos lo que habías escrito antes.</p>}
      <PersonaFields persona={valores} />
      <TextField name="ocupacion" label="Ocupación (opcional)" defaultValue={valores.ocupacion ?? ""} />
    </BorradorForm>
  );
}

// ─────────────── Paso 2: unidad y vínculo ───────────────
export async function Paso2({ ctx, unidadId }: P) {
  const [u, mios, borrador] = await Promise.all([
    fichaFisica(ctx, unidadId),
    ctx.db.vinculoUnidad.findMany({
      where: { estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] }, persona: { usuarioId: ctx.userId } },
      include: { unidad: { select: { id: true, codigo: true, torre: { select: { nombre: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    leerBorrador<Record<string, string>>(ctx, claveBorrador(2, unidadId)),
  ]);
  const propietario = esPropietarioDe(ctx, unidadId);
  const ocupacion = borrador?.estadoOcupacion ?? u.estadoOcupacion;
  return (
    <>
      <ul className="mb-4 divide-y rounded-xl border bg-card text-sm">
        {mios.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 p-3">
            <span>
              <Link href={`/mi-hogar?u=${v.unidadId}`} className="font-semibold text-primary">
                {v.unidad.codigo}
              </Link>
              {v.unidad.torre && <span className="text-muted-foreground"> · {v.unidad.torre.nombre}</span>}
            </span>
            <span className="flex items-center gap-2">
              {label(v.tipo)}
              {v.principal && <Badge variant="secondary">Principal</Badge>}
              {v.estado !== "ACTIVO" && <StatusBadge value={v.estado} />}
            </span>
          </li>
        ))}
      </ul>
      <p className="mb-4 text-xs text-muted-foreground">Si tu tipo de vínculo o tus unidades no están bien, la administración los corrige con el soporte (escritura o contrato).</p>
      {propietario ? (
        <BorradorForm clave={claveBorrador(2, unidadId)} action={guardarOcupacionAction} extra={{ unidadId }} redirectTo={hrefPaso(3, unidadId)} successMessage="Ocupación actualizada">
          <p className="text-sm font-medium">¿Cómo está ocupada {u.codigo}?</p>
          <ChoiceCards
            name="estadoOcupacion"
            defaultValue={ocupacion}
            options={[
              { value: "PROPIETARIO_OCUPA", label: "La habito yo", description: "Con mi familia" },
              { value: "ARRENDADA", label: "Arrendada", description: "Contrato de arrendamiento" },
              { value: "AIRBNB_O_SIMILAR", label: "Renta corta", description: "Airbnb, Booking…" },
              { value: "DESOCUPADA", label: "Desocupada", description: "Nadie vive ahí" },
            ]}
          />
          <FormGrid>
            <TextField name="plataformaRentaCorta" label="Plataforma (si es renta corta)" defaultValue={borrador?.plataformaRentaCorta ?? u.plataformaRentaCorta ?? ""} />
            <TextField name="registroRnt" label="Registro Nacional de Turismo (RNT)" defaultValue={borrador?.registroRnt ?? u.registroRnt ?? ""} />
          </FormGrid>
        </BorradorForm>
      ) : (
        <>
          <p className="rounded-lg bg-muted p-3 text-sm">Ocupación registrada: <b>{label(u.estadoOcupacion)}</b>. Solo el propietario puede cambiarla.</p>
          <Continuar unidadId={unidadId} paso={2} />
        </>
      )}
    </>
  );
}

// ─────────────── Paso 3: grupo familiar y ocupantes ───────────────
export async function Paso3({ ctx, unidadId, codigo }: P) {
  const vinculos = (await vinculosDeUnidad(ctx, unidadId)).filter((v) => VINCULOS_OCUPANTES.includes(v.tipo));
  const propietario = esPropietarioDe(ctx, unidadId);
  const tipos = [
    { value: "FAMILIAR", label: "Familiar", description: "Hijos, pareja, padres" },
    { value: "RESIDENTE", label: "Otro residente", description: "Vive en la unidad" },
    ...(propietario
      ? [
          { value: "ARRENDATARIO", label: "Arrendatario", description: "Requiere aprobación" },
          { value: "COPROPIETARIO", label: "Copropietario", description: "Requiere aprobación" },
        ]
      : []),
  ];
  const filas = await Promise.all(vinculos.map(async (v) => ({ v, a: await acciones(ctx, unidadId, v) })));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {can(ctx, "residentes.crear") && (
          <FormDialog titulo="Agregar persona" descripcion={`Quién vive en ${codigo}. Toma la foto con la cámara para que portería la reconozca.`} action={registrarPersonaAction} extra={{ unidadId }} triggerLabel="Agregar persona" successMessage="Persona agregada" wide>
            <ChoiceCards name="tipo" options={tipos} defaultValue="FAMILIAR" />
            <PersonaFields />
          </FormDialog>
        )}
        {can(ctx, "residentes.invitar") && (
          <InvitarDialog action={invitarAction} unidades={[{ value: unidadId, label: codigo }]} defaults={{ unidadId }} tipos={options(propietario ? ["FAMILIAR", "ARRENDATARIO", "RESIDENTE"] : ["FAMILIAR", "RESIDENTE"])} triggerLabel="Invitar por correo o WhatsApp" />
        )}
      </div>
      {filas.length === 0 ? (
        <EmptyState icon={Users} titulo="Aún no hay ocupantes registrados" descripcion="Agrega a tu familia o a los arrendatarios. Así portería sabe quién vive en la unidad." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filas.map(({ v, a }) => (
            <Fila key={v.id} v={v} extra={v.estado === "PENDIENTE_APROBACION" ? <p className="text-xs text-warning">Esperando aprobación de la administración</p> : undefined}>
              {a.editar && (
                <FormDialog titulo={`Editar a ${v.persona.nombres}`} action={actualizarPersonaAction} extra={{ id: v.personaId }} triggerLabel="Editar" triggerVariant="outline" triggerSize="sm" wide>
                  <PersonaFields persona={v.persona} />
                </FormDialog>
              )}
              {!v.persona.usuarioId && !esMenorDeEdad(v.persona.fechaNacimiento) && can(ctx, "residentes.invitar") && (
                <InvitarDialog
                  action={invitarAction}
                  unidades={[{ value: unidadId, label: codigo }]}
                  defaults={{ unidadId, personaId: v.personaId, email: v.persona.email, nombre: nombreCompleto(v.persona), telefono: v.persona.telefono, tipoVinculo: ["ARRENDATARIO", "COPROPIETARIO", "RESIDENTE"].includes(v.tipo) ? v.tipo : "FAMILIAR" }}
                  tipos={options([v.tipo === "ARRENDATARIO" || v.tipo === "COPROPIETARIO" || v.tipo === "RESIDENTE" ? v.tipo : "FAMILIAR"])}
                  triggerLabel="Invitar"
                  triggerSize="sm"
                />
              )}
              {a.retirar && (
                <ActionButton action={finalizarVinculoAction} input={{ id: v.id }} size="sm" variant="ghost" confirm={`¿Quitar a ${v.persona.nombres} de ${codigo}?`} successMessage="Persona retirada">
                  Quitar
                </ActionButton>
              )}
            </Fila>
          ))}
        </ul>
      )}
      <Continuar unidadId={unidadId} paso={3} />
    </>
  );
}

// ─────────────── Paso 4: empleados y visitantes frecuentes ───────────────
export async function Paso4({ ctx, unidadId, codigo }: P) {
  const vinculos = (await vinculosDeUnidad(ctx, unidadId)).filter((v) => VINCULOS_PERSONAL.includes(v.tipo));
  const filas = await Promise.all(vinculos.map(async (v) => ({ v, a: await acciones(ctx, unidadId, v) })));
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Portería solo dejará ingresar a estas personas en los días y horas que definas. Para contratistas de obra usa <Link href="/obras" className="text-primary underline">Obras y remodelaciones</Link> (exige seguridad social vigente).</p>
      {can(ctx, "residentes.crear") && (
        <div className="mb-3">
          <FormDialog titulo="Agregar empleado o visitante frecuente" action={registrarPersonaAction} extra={{ unidadId }} triggerLabel="Agregar" successMessage="Registrado" wide>
            <ChoiceCards
              name="tipo"
              columns={3}
              defaultValue="EMPLEADO_DOMESTICO"
              options={[
                { value: "EMPLEADO_DOMESTICO", label: "Empleada(o) doméstica(o)" },
                { value: "CUIDADOR", label: "Cuidador(a)" },
                { value: "VISITANTE_FRECUENTE", label: "Visitante frecuente" },
              ]}
            />
            <PersonaFields compacto />
            <HorarioFields />
          </FormDialog>
        </div>
      )}
      {filas.length === 0 ? (
        <EmptyState titulo="No tienes empleados ni visitantes frecuentes" descripcion={`Registra a quien trabaja o visita ${codigo} con regularidad para agilizar su ingreso.`} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filas.map(({ v, a }) => (
            <Fila key={v.id} v={v} extra={<p className="text-xs text-muted-foreground">🕒 {describirHorario(v.horarioPermitido)}</p>}>
              {can(ctx, "residentes.editar") && (
                <FormDialog titulo={`Horario de ${v.persona.nombres}`} action={actualizarVinculoAction} extra={{ id: v.id }} triggerLabel="Horario" triggerVariant="outline" triggerSize="sm">
                  <HorarioFields horario={v.horarioPermitido as Horario | null} />
                </FormDialog>
              )}
              {a.editar && (
                <FormDialog titulo={`Editar a ${v.persona.nombres}`} action={actualizarPersonaAction} extra={{ id: v.personaId }} triggerLabel="Datos" triggerVariant="outline" triggerSize="sm" wide>
                  <PersonaFields persona={v.persona} compacto />
                </FormDialog>
              )}
              {a.retirar && (
                <ActionButton action={finalizarVinculoAction} input={{ id: v.id }} size="sm" variant="ghost" confirm={`¿Quitar a ${v.persona.nombres}? Portería ya no le permitirá el ingreso.`} successMessage="Retirado">
                  Quitar
                </ActionButton>
              )}
            </Fila>
          ))}
        </ul>
      )}
      <Continuar unidadId={unidadId} paso={4} />
    </>
  );
}

// ─────────────── Paso 5: vehículos ───────────────
export async function Paso5({ ctx, unidadId }: P) {
  const [u, vehiculos] = await Promise.all([fichaFisica(ctx, unidadId), ctx.db.vehiculo.findMany({ where: { unidadId, activo: true }, include: { parqueadero: { select: { codigo: true } } }, orderBy: { placa: "asc" } })]);
  const pq = u.parqueaderos.map((p) => ({ value: p.id, label: `${p.codigo} · ${label(p.tipo)}` }));
  return (
    <>
      {can(ctx, "vehiculos.crear") && (
        <div className="mb-3">
          <FormDialog titulo="Registrar vehículo" action={guardarVehiculoAction} extra={{ unidadId }} triggerLabel="Agregar vehículo" successMessage="Vehículo registrado" wide>
            <VehiculoFields parqueaderos={pq} />
          </FormDialog>
        </div>
      )}
      {vehiculos.length === 0 ? (
        <EmptyState icon={Car} titulo="No tienes vehículos registrados" descripcion="Registra tus carros, motos y bicicletas para que portería los reconozca al entrar." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {vehiculos.map((v) => {
            const soat = estadoVencimiento(v.soatVence);
            const tecno = estadoVencimiento(v.tecnomecanicaVence);
            return (
              <li key={v.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-lg font-bold">{v.placa}</p>
                    <p className="text-sm text-muted-foreground">
                      {label(v.tipo)} · {[v.marca, v.modelo, v.color].filter(Boolean).join(" · ")}
                      {v.parqueadero && ` · parqueadero ${v.parqueadero.codigo}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-xs">
                    {soat && <StatusBadge value={soat} text={`SOAT ${fecha(v.soatVence)}`} />}
                    {tecno && <StatusBadge value={tecno} text={`Tecno ${fecha(v.tecnomecanicaVence)}`} />}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {can(ctx, "vehiculos.editar") && (
                    <FormDialog titulo={`Editar ${v.placa}`} action={guardarVehiculoAction} extra={{ id: v.id, unidadId }} triggerLabel="Editar" triggerVariant="outline" triggerSize="sm" wide>
                      <VehiculoFields vehiculo={v} parqueaderos={pq} />
                    </FormDialog>
                  )}
                  {can(ctx, "vehiculos.eliminar") && (
                    <ActionButton action={eliminarVehiculoAction} input={{ id: v.id }} size="sm" variant="ghost" confirm={`¿Eliminar el vehículo ${v.placa}?`} successMessage="Vehículo eliminado">
                      Eliminar
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Continuar unidadId={unidadId} paso={5} />
    </>
  );
}

// ─────────────── Paso 6: mascotas ───────────────
export async function Paso6({ ctx, unidadId }: P) {
  const mascotas = await ctx.db.mascota.findMany({ where: { unidadId, activo: true }, orderBy: { nombre: "asc" } });
  return (
    <>
      {can(ctx, "vehiculos.crear") && (
        <div className="mb-3">
          <FormDialog titulo="Registrar mascota" action={guardarMascotaAction} extra={{ unidadId }} triggerLabel="Agregar mascota" successMessage="Mascota registrada" wide>
            <MascotaFields />
          </FormDialog>
        </div>
      )}
      {mascotas.length === 0 ? (
        <EmptyState icon={PawPrint} titulo="No tienes mascotas registradas" descripcion="Registrarlas ayuda a encontrarlas si se pierden y a controlar las vacunas." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {mascotas.map((m) => {
            const vacuna = estadoVencimiento(m.antirrabicaVence);
            return (
              <li key={m.id} className="space-y-2 p-3">
                <div className="flex items-center gap-3">
                  <Avatar nombre={m.nombre} fotoUrl={m.fotoUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{m.nombre}</p>
                    <p className="text-xs text-muted-foreground">{[m.especie, m.raza, m.color].filter(Boolean).join(" · ")}</p>
                  </div>
                  {vacuna && <StatusBadge value={vacuna} text={`Antirrábica ${fecha(m.antirrabicaVence)}`} />}
                </div>
                {m.potencialmentePeligrosa && !m.polizaUrl && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertTriangle className="size-3.5" /> Falta la póliza de responsabilidad civil exigida por la Ley 746 de 2002.
                  </p>
                )}
                <div className="flex gap-1.5 pl-14">
                  {can(ctx, "vehiculos.editar") && (
                    <FormDialog titulo={`Editar a ${m.nombre}`} action={guardarMascotaAction} extra={{ id: m.id, unidadId }} triggerLabel="Editar" triggerVariant="outline" triggerSize="sm" wide>
                      <MascotaFields mascota={m} />
                    </FormDialog>
                  )}
                  {can(ctx, "vehiculos.eliminar") && (
                    <ActionButton action={eliminarMascotaAction} input={{ id: m.id }} size="sm" variant="ghost" confirm={`¿Eliminar a ${m.nombre} del registro?`} successMessage="Mascota eliminada">
                      Eliminar
                    </ActionButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Continuar unidadId={unidadId} paso={6} />
    </>
  );
}

// ─────────────── Paso 7: emergencia ───────────────
export async function Paso7({ ctx, unidadId }: P) {
  const vinculos = (await vinculosDeUnidad(ctx, unidadId)).filter((v) => VINCULOS_HABITAN.includes(v.tipo));
  const unicos = [...new Map(vinculos.map((v) => [v.personaId, v])).values()];
  const filas = await Promise.all(unicos.map(async (v) => ({ v, a: await acciones(ctx, unidadId, v) })));
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Esta información solo la ven la administración, portería y los brigadistas para atenderlos en una emergencia (evacuación asistida).
      </p>
      <ul className="divide-y rounded-xl border bg-card">
        {filas.map(({ v, a }) => {
          const p = v.persona;
          return (
            <Fila
              key={v.id}
              v={v}
              extra={
                <p className="text-xs text-muted-foreground">
                  {p.movilidadReducida || p.requiereAsistenciaEvacuacion ? (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Accessibility className="size-3.5" /> Requiere asistencia
                    </span>
                  ) : (
                    "Sin condiciones especiales"
                  )}
                  {p.contactoEmergenciaTelefono ? ` · contacto: ${p.contactoEmergenciaNombre ?? ""} ${p.contactoEmergenciaTelefono}` : " · sin contacto de emergencia"}
                </p>
              }
            >
              {a.editar ? (
                <FormDialog titulo={`Emergencias: ${p.nombres}`} action={guardarEmergenciaPersonaAction} extra={{ id: p.id }} triggerLabel="Completar" triggerVariant="outline" triggerSize="sm" trigger={<Button variant="outline" size="sm"><HeartPulse /> Completar</Button>}>
                  <EmergenciaFields persona={p} />
                </FormDialog>
              ) : (
                <span className="text-xs text-muted-foreground">{p.usuarioId ? "La persona actualiza estos datos desde su perfil." : "Solo la administración puede editarla."}</span>
              )}
            </Fila>
          );
        })}
        {filas.length === 0 && <li className="p-4 text-sm text-muted-foreground">Primero registra a los ocupantes en el paso 3.</li>}
      </ul>
      <Continuar unidadId={unidadId} paso={7} />
    </>
  );
}

// ─────────────── Paso 8: autorizaciones ───────────────
export async function Paso8({ ctx, unidadId }: P) {
  const vinculos = await vinculosDeUnidad(ctx, unidadId);
  const autorizados = vinculos.filter((v) => VINCULOS_AUTORIZADOS.includes(v.tipo));
  const hogar = [...new Map(vinculos.filter((v) => !VINCULOS_AUTORIZADOS.includes(v.tipo) && !esMenorDeEdad(v.persona.fechaNacimiento)).map((v) => [v.personaId, v.persona])).values()];
  const tiposAut = [
    { value: "AUTORIZADO_RECOGER_PAQUETES", label: "Recoger paquetes", description: "Portería le entrega tus paquetes" },
    { value: "AUTORIZADO_MENORES", label: "Recoger a los menores", description: "Puede salir con los niños" },
  ];
  const filas = await Promise.all(autorizados.map(async (v) => ({ v, a: await acciones(ctx, unidadId, v) })));
  return (
    <>
      {can(ctx, "residentes.crear") && (
        <div className="mb-3 flex flex-wrap gap-2">
          {hogar.length > 0 && (
            <FormDialog titulo="Autorizar a alguien del hogar" action={crearVinculoAction} extra={{ unidadId }} triggerLabel="Alguien del hogar" successMessage="Autorización registrada">
              <SelectField name="personaId" label="Persona" options={hogar.map((p) => ({ value: p.id, label: nombreCompleto(p) }))} required />
              <ChoiceCards name="tipo" options={tiposAut} defaultValue="AUTORIZADO_RECOGER_PAQUETES" />
            </FormDialog>
          )}
          <FormDialog titulo="Autorizar a otra persona" descripcion="Por ejemplo, un familiar que no vive contigo o la ruta escolar." action={registrarPersonaAction} extra={{ unidadId }} triggerLabel="Otra persona" triggerVariant="outline" successMessage="Autorización registrada" wide>
            <ChoiceCards name="tipo" options={tiposAut} defaultValue="AUTORIZADO_MENORES" />
            <PersonaFields compacto />
          </FormDialog>
        </div>
      )}
      {filas.length === 0 ? (
        <EmptyState icon={ShieldCheck} titulo="No hay autorizaciones" descripcion="Indica quién puede recibir tus paquetes o recoger a los menores en portería." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {filas.map(({ v, a }) => (
            <Fila key={v.id} v={v}>
              {a.retirar && (
                <ActionButton action={finalizarVinculoAction} input={{ id: v.id }} size="sm" variant="ghost" confirm={`¿Quitar la autorización de ${v.persona.nombres}?`} successMessage="Autorización retirada">
                  Quitar autorización
                </ActionButton>
              )}
            </Fila>
          ))}
        </ul>
      )}
      <Continuar unidadId={unidadId} paso={8} />
    </>
  );
}

// ─────────────── Paso 9: política de datos ───────────────
export async function Paso9({ ctx, unidadId }: P) {
  const cfg = conjuntoConfig(ctx);
  const [usuario, persona] = await Promise.all([prisma.usuario.findUnique({ where: { id: ctx.userId }, select: { politicaVersion: true, politicaAceptadaEn: true } }), miPersona(ctx)]);
  const vigente = usuario?.politicaVersion === cfg.datos.politicaVersion;
  const campos = persona?.directorioCampos ?? ["nombre", "unidad"];
  return (
    <>
      <div className="mb-4 space-y-2 rounded-xl border bg-card p-4 text-sm">
        <p>
          <b>Responsable del tratamiento:</b> {cfg.datos.responsable} — {ctx.conjunto.nombre}
          {ctx.conjunto.nit && ` (NIT ${ctx.conjunto.nit})`}
        </p>
        <p>
          <b>Finalidad:</b> {cfg.datos.finalidad}
        </p>
        <p>
          <b>Tus derechos:</b> conocer, actualizar, rectificar y suprimir tus datos, y revocar la autorización (Ley 1581 de 2012). Puedes ejercerlos en cualquier momento desde{" "}
          <Link href="/perfil/privacidad" className="text-primary underline">
            Mi perfil → Privacidad
          </Link>
          .
        </p>
        <Link href={`/politica-datos?c=${ctx.conjunto.slug}`} target="_blank" className="inline-block text-primary underline">
          Leer la política completa (versión {cfg.datos.politicaVersion})
        </Link>
      </div>
      {vigente && <p className="mb-3 rounded-lg bg-success/10 p-3 text-sm text-success">Ya aceptaste la versión vigente el {fecha(usuario?.politicaAceptadaEn)}. Puedes actualizar tus preferencias del directorio.</p>}
      <ActionForm action={aceptarPoliticaPasoAction} extra={{ unidadId }} submitLabel={vigente ? "Guardar preferencias" : "Aceptar y terminar"} successMessage="¡Listo! Tu información quedó completa" redirectTo={`/mi-hogar?u=${unidadId}`}>
        <CheckboxField name="directorioOptIn" label="Aparecer en el directorio de residentes" hint="Opcional. Otros residentes podrán ver solo los datos que elijas." defaultChecked={persona?.directorioOptIn} />
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Datos visibles en el directorio</legend>
          {[
            ["nombre", "Nombre"],
            ["unidad", "Unidad"],
            ["telefono", "Teléfono"],
            ["whatsapp", "WhatsApp"],
            ["servicios", "Servicios que ofrezco"],
          ].map(([v, l]) => (
            <label key={v} className="inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10">
              <input type="checkbox" name="directorioCampos[]" value={v} defaultChecked={campos.includes(v)} className="sr-only" />
              {l}
            </label>
          ))}
        </fieldset>
        <CheckboxField name="acepto" label="Autorizo el tratamiento de mis datos personales" hint="Incluye los datos de las personas a mi cargo que registré (menores de edad, con el interés superior del menor)." defaultChecked={vigente} />
      </ActionForm>
      <div className="mt-4">
        <Button variant="ghost" render={<Link href={hrefPaso(8, unidadId)} />}>
          Anterior
        </Button>
      </div>
    </>
  );
}

export const PASOS: Record<number, (p: P) => Promise<React.ReactNode>> = { 1: Paso1, 2: Paso2, 3: Paso3, 4: Paso4, 5: Paso5, 6: Paso6, 7: Paso7, 8: Paso8, 9: Paso9 };

