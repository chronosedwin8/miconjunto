import Link from "next/link";
import { ArrowRight, Bot, ClipboardList, Lock, MessageSquare, UserCheck, Wrench } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { iaDisponible } from "@/lib/ia/disponible";
import { IaBoton } from "@/components/ia/ia-boton";
import { borradorPqrsAction } from "@/app/(app)/asistente/actions";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { fecha, fechaHora, isoDate, addDays } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { esDelResidente, listarPlantillas, obtenerTicket, opcionesAsignacion } from "@/lib/tickets/service";
import { PRIORIDADES, TRANSICIONES, puedeCalificar, puedeReabrir, puedeTransicionar } from "@/lib/tickets/reglas";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionForm } from "@/components/form/action-form";
import { SelectAction } from "@/components/form/select-action";
import { FileField, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Estrellas, SlaBadge, TipoIcono } from "../ui";
import { asignarAction, cambiarEstadoAction, crearOrdenAction, prioridadAction, reabrirAction } from "../actions";
import { Calificar, Responder } from "./formularios";

export const metadata = { title: "Detalle del ticket" };

const esImagen = (u: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(u);
const esVideo = (u: string) => /\.(mp4|mov)$/i.test(u);

function Adjuntos({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u) =>
        esImagen(u) ? (
          <a key={u} href={u} target="_blank" rel="noreferrer">
            <img src={u} alt="Adjunto" className="size-20 rounded-lg border object-cover" />
          </a>
        ) : esVideo(u) ? (
          <video key={u} src={u} controls className="h-28 rounded-lg border" />
        ) : (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="grid size-20 place-items-center rounded-lg border bg-muted p-1 text-center text-[10px]">
            {decodeURIComponent(u.split("/").pop() ?? "").slice(17, 40)}
          </a>
        ),
      )}
    </div>
  );
}

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePage(["tickets.ver", "tickets.ver_todos"]);
  const { id } = await params;
  const sp = await searchParams;
  const t = await obtenerTicket(ctx, id);
  const gestiona = can(ctx, "tickets.gestionar");
  const asigna = can(ctx, "tickets.asignar");
  const interno = can(ctx, "tickets.comentario_interno");
  const propio = esDelResidente(ctx, t);
  const [plantillas, asignables] = await Promise.all([gestiona ? listarPlantillas(ctx, t.tipo) : [], asigna ? opcionesAsignacion(ctx) : null]);
  const cerrado = t.estado === "CERRADO";
  const destinos = TRANSICIONES[t.estado].filter((e) => e !== "REABIERTO" && e !== "RESUELTO");
  const puedeResolver = gestiona && puedeTransicionar(t.estado, "RESUELTO");
  const puedeOrden = gestiona && !t.orden && (t.tipo === "DANO_ZONA_COMUN" || !!t.zonaId || !!t.activoId) && !cerrado;
  const accion = spGet(sp, "accion");

  const resolverForm = (
    <>
      <TextAreaField name="nota" label="Respuesta al residente" placeholder="Describe qué se hizo para solucionarlo." required />
      <FileField name="adjuntos" label="Evidencia de la solución (fotos)" multiple folder="tickets" />
    </>
  );

  return (
    <>
      <PageHeader
        volver="/tickets"
        titulo={
          <span className="flex items-center gap-2">
            <TipoIcono tipo={t.tipo} className="size-6 text-primary" />
            <span className="font-mono">{t.radicado}</span>
          </span>
        }
        descripcion={t.titulo}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge value={t.estado} />
        <SlaBadge t={t} />
        <StatusBadge value={t.prioridad} text={`Prioridad ${label(t.prioridad).toLowerCase()}`} />
        {t.reabiertoVeces > 0 && <Badge variant="destructive">Reabierto {t.reabiertoVeces}×</Badge>}
        {t.origen !== "APP" && <Badge variant="outline">Origen: {label(t.origen)}</Badge>}
        {gestiona && iaDisponible(ctx) && <IaBoton action={borradorPqrsAction} id={t.id} texto="Borrador con IA" titulo={`Borrador de respuesta · ${t.radicado}`} />}
      </div>

      {gestiona && (accion === "resolver" || accion === "cerrar") && (puedeResolver || puedeTransicionar(t.estado, "CERRADO")) && (
        <Section titulo={accion === "resolver" ? "Resolver ticket" : "Cerrar ticket"} className="rounded-xl border border-primary/40 bg-primary/5 p-3">
          <ActionForm action={cambiarEstadoAction} extra={{ id: t.id, estado: accion === "resolver" ? "RESUELTO" : "CERRADO" }} submitLabel={accion === "resolver" ? "Marcar como resuelto" : "Cerrar ticket"} successMessage="Ticket actualizado" redirectTo={`/tickets/${t.id}`}>
            {resolverForm}
          </ActionForm>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <Section titulo="Descripción">
            <div className="rounded-xl border bg-card p-4">
              <p className="whitespace-pre-line text-sm">{t.descripcion}</p>
              <Adjuntos urls={t.adjuntos} />
            </div>
          </Section>

          {gestiona && !cerrado && (
            <div className="flex flex-wrap gap-2">
              {puedeResolver && (
                <FormDialog titulo="Resolver ticket" descripcion="El residente recibirá tu respuesta y podrá calificar la atención." action={cambiarEstadoAction} extra={{ id: t.id, estado: "RESUELTO" }} triggerLabel="Resolver" submitLabel="Marcar como resuelto" successMessage="Ticket resuelto">
                  {resolverForm}
                </FormDialog>
              )}
              {destinos.length > 0 && (
                <FormDialog titulo="Cambiar estado" action={cambiarEstadoAction} extra={{ id: t.id }} triggerLabel="Cambiar estado" triggerVariant="outline" successMessage="Estado actualizado">
                  <SelectField name="estado" label="Nuevo estado" options={destinos.map((e) => ({ value: e, label: label(e) }))} placeholder={false} />
                  <TextAreaField name="nota" label="Nota para el residente (opcional)" placeholder="Si pides información al residente, explícale qué necesitas." />
                </FormDialog>
              )}
              {asigna && asignables && (
                <FormDialog titulo="Asignar responsable" action={asignarAction} extra={{ id: t.id }} triggerLabel={t.asignadoA || t.proveedor ? "Reasignar" : "Asignar"} triggerVariant="outline" successMessage="Ticket asignado">
                  <SearchSelect name="asignadoAId" label="Persona responsable" options={asignables.usuarios} defaultValue={t.asignadoAId} />
                  <SelectField name="proveedorId" label="Proveedor (opcional)" options={asignables.proveedores} defaultValue={t.proveedorId} placeholder="Ninguno" />
                  <TextField name="nota" label="Instrucciones (opcional)" />
                </FormDialog>
              )}
              {puedeOrden && (
                <FormDialog titulo="Generar orden de trabajo" descripcion="Se crea en Mantenimiento enlazada a este ticket y a la zona o activo afectado." action={crearOrdenAction} extra={{ id: t.id }} triggerLabel="Orden de trabajo" triggerVariant="outline" successMessage="Orden de trabajo creada">
                  <TextField name="titulo" label="Título" defaultValue={`${t.radicado} · ${t.titulo}`.slice(0, 140)} />
                  <TextField name="fechaProgramada" label="Fecha programada" type="date" defaultValue={isoDate(addDays(new Date(), 1))} required />
                  {asignables && <SearchSelect name="asignadoAId" label="Responsable" options={asignables.usuarios} defaultValue={t.asignadoAId} />}
                  {asignables && <SelectField name="proveedorId" label="Proveedor" options={asignables.proveedores} defaultValue={t.proveedorId} placeholder="Ninguno" />}
                  <TextAreaField name="descripcion" label="Instrucciones" defaultValue={t.descripcion} />
                </FormDialog>
              )}
            </div>
          )}

          <Section titulo="Seguimiento">
            <ol className="relative space-y-4 border-l-2 border-muted pl-5">
              {t.comentarios.map((c) => {
                const I = c.interno ? Lock : c.tipo === "ASIGNACION" ? UserCheck : c.tipo === "CAMBIO_ESTADO" ? ArrowRight : c.tipo === "SISTEMA" ? Bot : MessageSquare;
                const d = (c.data ?? {}) as { a?: string; estadoNuevo?: string };
                const aEstado = d.a ?? d.estadoNuevo;
                const esResidente = c.autorId && c.autorId === t.solicitanteId;
                return (
                  <li key={c.id} className="relative">
                    <span className={cn("absolute -left-[31px] top-0 grid size-6 place-items-center rounded-full border-2 border-background", c.interno ? "bg-amber-400 text-amber-950" : c.tipo === "COMENTARIO" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <I className="size-3.5" />
                    </span>
                    <div className={cn("rounded-xl border p-3", c.interno ? "border-amber-300 bg-amber-50 dark:bg-amber-950/30" : c.tipo === "COMENTARIO" ? (esResidente ? "bg-muted/40" : "bg-card") : "border-dashed bg-transparent")}>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.autor?.nombre ?? (c.tipo === "SISTEMA" ? "MiConjunto" : (t.solicitanteNombre ?? "Sistema"))}</span>
                        <span>{fechaHora(c.createdAt)}</span>
                        {c.interno && <Badge variant="warning">Interno</Badge>}
                        {aEstado && <StatusBadge value={aEstado} />}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm">{c.contenido}</p>
                      <Adjuntos urls={c.adjuntos} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>

          {propio && puedeCalificar(t) && <Calificar ticketId={t.id} />}

          {!cerrado && (propio || gestiona) && (
            <Section titulo={gestiona && !propio ? "Responder" : "Agregar un mensaje"}>
              <Responder ticketId={t.id} plantillas={plantillas.map((p) => ({ id: p.id, titulo: p.titulo, contenido: p.contenido }))} puedeInterno={interno} submitLabel={gestiona && !propio ? "Responder" : "Enviar mensaje"} />
            </Section>
          )}

          {(propio || gestiona) && puedeReabrir(t) && (
            <FormDialog titulo="Reabrir solicitud" descripcion="Cuéntanos por qué el problema no quedó solucionado." action={reabrirAction} extra={{ id: t.id }} triggerLabel="El problema continúa: reabrir" triggerVariant="outline" submitLabel="Reabrir" successMessage="Solicitud reabierta">
              <TextAreaField name="motivo" label="Motivo" required />
            </FormDialog>
          )}
        </div>

        <aside className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm lg:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Tipo</dt>
              <dd>{label(t.tipo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Radicado el</dt>
              <dd>{fechaHora(t.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fecha límite</dt>
              <dd>{fecha(t.fechaLimite)}</dd>
            </div>
            {t.unidad && (
              <div>
                <dt className="text-xs text-muted-foreground">Unidad</dt>
                <dd>{t.unidad.codigo}</dd>
              </div>
            )}
            {(t.zona || t.ubicacion) && (
              <div>
                <dt className="text-xs text-muted-foreground">Lugar</dt>
                <dd>{[t.zona?.nombre, t.ubicacion].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
            {t.activo && (
              <div>
                <dt className="text-xs text-muted-foreground">Activo</dt>
                <dd>{can(ctx, "activos.ver") ? <Link className="text-primary underline" href={`/activos/${t.activo.id}`}>{t.activo.nombre}</Link> : t.activo.nombre}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Solicitante</dt>
              <dd>
                {t.solicitante?.nombre ?? t.solicitanteNombre ?? "—"}
                {gestiona && t.origen === "PUBLICO" && (
                  <span className="block text-xs text-muted-foreground">
                    {t.solicitanteEmail} {t.solicitanteTelefono ? `· ${t.solicitanteTelefono}` : ""}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Responsable</dt>
              <dd>{[t.asignadoA?.nombre, t.proveedor?.razonSocial].filter(Boolean).join(" · ") || "Sin asignar"}</dd>
            </div>
            {gestiona && !cerrado && (
              <div>
                <dt className="mb-1 text-xs text-muted-foreground">Prioridad</dt>
                <dd>
                  <SelectAction action={prioridadAction} input={{ id: t.id }} field="prioridad" value={t.prioridad} options={options(PRIORIDADES)} ariaLabel="Cambiar prioridad" className="h-10 w-full rounded-lg border bg-background px-2 text-sm" />
                </dd>
              </div>
            )}
            {t.calificacion && (
              <div>
                <dt className="text-xs text-muted-foreground">Calificación</dt>
                <dd>
                  <Estrellas valor={t.calificacion} />
                  {t.comentarioCalificacion && <span className="block text-xs text-muted-foreground">“{t.comentarioCalificacion}”</span>}
                </dd>
              </div>
            )}
          </dl>
          {t.orden && (
            <div className="rounded-xl border bg-card p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <Wrench className="size-4" /> Orden de trabajo N.º {t.orden.numero}
              </p>
              <p className="mt-1 text-muted-foreground">
                {label(t.orden.estado)} · programada {fecha(t.orden.fechaProgramada)}
              </p>
              {can(ctx, "mantenimiento.ver") && (
                <Button variant="link" className="px-0" render={<Link href={`/mantenimiento/ordenes/${t.orden.id}`} />}>
                  <ClipboardList /> Ver orden
                </Button>
              )}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
