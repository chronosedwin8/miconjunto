import Link from "next/link";
import { Accessibility, Pencil } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { edad, fecha, fechaHora, nombreCompleto, num } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { obtenerPersona, puedeEditarPersona } from "@/lib/residentes/service";
import { describirHorario, esAdultoMayor, esMenorDeEdad, VINCULOS_PERSONAL, type Horario } from "@/lib/residentes/calculos";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmergenciaFields, HorarioFields, PersonaFields, VinculoFields } from "../_components/campos";
import { InvitarDialog } from "../_components/invitar-dialog";
import {
  actualizarPersonaAction,
  actualizarVinculoAction,
  crearVinculoAction,
  finalizarVinculoAction,
  guardarEmergenciaPersonaAction,
  resolverVinculoAction,
  retirarPersonaAction,
} from "../actions";
import { invitarAction } from "../../mi-hogar/actions";

export const metadata = { title: "Persona" };

const TIPOS = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE", "AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"] as const;

export default async function PersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("residentes.ver_todos");
  const { id } = await params;
  const p = await obtenerPersona(ctx, id);
  const verTel = can(ctx, "campos.persona_telefono");
  const verDoc = can(ctx, "campos.persona_documento");
  const verSalud = can(ctx, "campos.persona_salud");
  const editar = !p.anonimizada && (await puedeEditarPersona(ctx, id));
  const unidades = await unidadOptions(ctx);
  const e = edad(p.fechaNacimiento);
  const vigentes = p.vinculos.filter((v) => v.estado === "ACTIVO" || v.estado === "PENDIENTE_APROBACION");
  const historicos = p.vinculos.filter((v) => v.estado === "INACTIVO" || v.estado === "RECHAZADO");

  const datos: [string, React.ReactNode][] = [
    ["Documento", verDoc ? `${label(p.tipoDocumento)} ${p.numeroDocumento}` : label(p.tipoDocumento)],
    ["Fecha de nacimiento", p.fechaNacimiento ? `${fecha(p.fechaNacimiento)} (${e} años)` : "—"],
    ["Género", p.genero ?? "—"],
    ...(verTel
      ? ([
          ["Celular", p.telefono ?? "—"],
          ["Correo", p.email ?? "—"],
        ] as [string, React.ReactNode][])
      : []),
    ["Ocupación", p.ocupacion ?? "—"],
    ["Cuenta en la app", p.usuario ? `${p.usuario.email} · último acceso ${fechaHora(p.usuario.ultimoAcceso)}` : "Sin cuenta"],
    ["Política de datos", p.consentimientoDatosEn ? `Aceptada ${fecha(p.consentimientoDatosEn)} (v${p.consentimientoVersion ?? "—"})` : "Sin consentimiento registrado"],
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {p.fotoUrl ? (
            <img src={p.fotoUrl} alt="" className="size-16 rounded-full border object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">{p.nombres.slice(0, 1)}</span>
          )}
          <div>
            <Link href="/residentes" className="text-sm text-muted-foreground">
              ← Residentes
            </Link>
            <h2 className="text-xl font-bold">{nombreCompleto(p)}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {p.anonimizada && <Badge variant="secondary">Datos anonimizados</Badge>}
              {esMenorDeEdad(p.fechaNacimiento) && <Badge variant="info">Menor de edad</Badge>}
              {esAdultoMayor(p.fechaNacimiento) && <Badge variant="secondary">Adulto mayor</Badge>}
              {verSalud && p.movilidadReducida && (
                <Badge variant="warning">
                  <Accessibility className="size-3" /> Movilidad reducida
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {editar && (
            <FormDialog titulo="Editar datos" action={actualizarPersonaAction} extra={{ id: p.id }} triggerLabel="Editar" triggerVariant="outline" wide trigger={<Button variant="outline"><Pencil /> Editar</Button>}>
              <PersonaFields persona={p} />
              {verSalud && (
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Información de emergencia</summary>
                  <div className="mt-3 space-y-3">
                    <EmergenciaFields persona={p} />
                  </div>
                </details>
              )}
            </FormDialog>
          )}
          {!p.usuario && !p.anonimizada && can(ctx, "residentes.invitar") && vigentes[0] && (
            <InvitarDialog
              action={invitarAction}
              unidades={[...new Map(vigentes.map((v) => [v.unidadId, { value: v.unidadId, label: v.unidad.codigo }])).values()]}
              defaults={{ email: p.email, nombre: nombreCompleto(p), telefono: p.telefono, personaId: p.id, unidadId: vigentes[0].unidadId, tipoVinculo: ["ARRENDATARIO", "COPROPIETARIO", "RESIDENTE"].includes(vigentes[0].tipo) ? vigentes[0].tipo : "FAMILIAR" }}
              tipos={options(["FAMILIAR", "RESIDENTE", "ARRENDATARIO", "COPROPIETARIO"])}
              triggerLabel="Invitar a la app"
            />
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titulo="Datos personales">
          <dl className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2">
            {datos.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="break-words font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {verSalud && (
          <Section
            titulo="Emergencias"
            acciones={
              editar ? (
                <FormDialog titulo="Información de emergencia" action={guardarEmergenciaPersonaAction} extra={{ id: p.id }} triggerLabel="Editar" triggerVariant="ghost" triggerSize="sm">
                  <EmergenciaFields persona={p} />
                </FormDialog>
              ) : undefined
            }
          >
            <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Movilidad reducida</dt>
                <dd className="font-medium">{p.movilidadReducida ? "Sí" : "No"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Evacuación asistida</dt>
                <dd className="font-medium">{p.requiereAsistenciaEvacuacion ? "Sí" : "No"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Apoyo que necesita</dt>
                <dd className="font-medium">{p.movilidadDescripcion ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Tipo de sangre · EPS</dt>
                <dd className="font-medium">
                  {p.tipoSangre ?? "—"} · {p.eps ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Contacto de emergencia</dt>
                <dd className="font-medium">{[p.contactoEmergenciaNombre, p.contactoEmergenciaTelefono].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
            </dl>
          </Section>
        )}
      </div>

      <Section
        titulo={`Vínculos con unidades (${vigentes.length})`}
        acciones={
          can(ctx, "residentes.crear") && !p.anonimizada ? (
            <FormDialog titulo="Agregar vínculo" action={crearVinculoAction} extra={{ personaId: p.id }} triggerLabel="Agregar" triggerSize="sm" successMessage="Vínculo agregado">
              <VinculoFields unidades={unidades} tipos={TIPOS} />
              <TextField name="porcentajePropiedad" label="% de propiedad (copropietarios)" inputMode="decimal" />
              <CheckboxField name="principal" label="Contacto principal de la unidad" />
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Horario (empleados y visitantes frecuentes)</summary>
                <div className="mt-3">
                  <HorarioFields />
                </div>
              </details>
            </FormDialog>
          ) : undefined
        }
      >
        <ul className="divide-y rounded-xl border bg-card">
          {vigentes.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin vínculos vigentes.</li>}
          {vigentes.map((v) => (
            <li key={v.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/conjunto/unidades/${v.unidadId}`} className="font-semibold text-primary hover:underline">
                    {v.unidad.codigo}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {label(v.tipo)}
                    {v.principal && " · principal"}
                    {v.porcentajePropiedad && ` · ${num(v.porcentajePropiedad)} %`}
                    {` · desde ${fecha(v.fechaInicio)}`}
                  </span>
                  {v.horarioPermitido && <p className="text-xs text-muted-foreground">Horario: {describirHorario(v.horarioPermitido)}</p>}
                </div>
                <StatusBadge value={v.estado} />
              </div>
              <div className="flex flex-wrap gap-2">
                {v.estado === "PENDIENTE_APROBACION" && can(ctx, "residentes.aprobar") && (
                  <>
                    <ActionButton action={resolverVinculoAction} input={{ id: v.id, aprobar: true }} size="sm" successMessage="Vínculo aprobado">
                      Aprobar
                    </ActionButton>
                    <ActionButton action={resolverVinculoAction} input={{ id: v.id, aprobar: false }} size="sm" variant="outline" confirm="¿Rechazar este vínculo?" successMessage="Vínculo rechazado">
                      Rechazar
                    </ActionButton>
                  </>
                )}
                {VINCULOS_PERSONAL.includes(v.tipo) && can(ctx, "residentes.editar") && (
                  <FormDialog titulo="Horario permitido" action={actualizarVinculoAction} extra={{ id: v.id }} triggerLabel="Horario" triggerVariant="outline" triggerSize="sm">
                    <HorarioFields horario={v.horarioPermitido as Horario | null} />
                  </FormDialog>
                )}
                {can(ctx, ["residentes.editar", "residentes.eliminar"]) && (
                  <ActionButton action={finalizarVinculoAction} input={{ id: v.id }} size="sm" variant="ghost" confirm={`¿Retirar a ${p.nombres} de ${v.unidad.codigo}?`} successMessage="Vínculo finalizado">
                    Retirar de la unidad
                  </ActionButton>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {historicos.length > 0 && (
        <Section titulo="Historial de vínculos">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {historicos.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 p-3">
                <span>
                  {v.unidad.codigo} · {label(v.tipo)} · {fecha(v.fechaInicio)} a {fecha(v.fechaFin)}
                </span>
                <StatusBadge value={v.estado} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {can(ctx, "residentes.eliminar") && !p.anonimizada && (
        <Section titulo="Retiro de la persona">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="mb-3 text-muted-foreground">
              Finaliza todos sus vínculos, suspende su acceso residencial y anonimiza sus datos personales (Ley 1581 de 2012). El historial de pagos y bitácora se conserva sin datos identificables.
            </p>
            <ActionButton action={retirarPersonaAction} input={{ id: p.id }} variant="destructive" confirm={`¿Retirar a ${nombreCompleto(p)} y anonimizar sus datos? Esta acción no se puede deshacer.`} successMessage="Persona retirada y anonimizada" redirectTo="/residentes">
              Retirar y anonimizar
            </ActionButton>
          </div>
        </Section>
      )}
    </>
  );
}
