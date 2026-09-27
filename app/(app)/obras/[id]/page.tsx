import Link from "next/link";
import { FileText, TriangleAlert } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { obtenerObra } from "@/lib/obras/service";
import { problemasContratistas } from "@/lib/obras/reglas";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { MoneyField, TextAreaField, TextField } from "@/components/form/fields";
import { ContratistasEditor } from "../contratistas-editor";
import { contratistasAction, decidirObraAction, estadoObraAction } from "../actions";

export const metadata = { title: "Solicitud de obra" };

export default async function ObraPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["obras.ver", "obras.ver_todos"]);
  const { id } = await params;
  const o = await obtenerObra(ctx, id);
  const gestor = can(ctx, "obras.aprobar");
  const propio = ctx.unidadIds.includes(o.unidadId) || o.solicitanteId === ctx.userId;
  const problemas = problemasContratistas(o.contratistasLista, o.fechaFin);
  const editable = ["SOLICITADA", "APROBADA", "EN_CURSO"].includes(o.estado) && (gestor || propio);
  const hoy = new Date();
  return (
    <>
      <Link href="/obras" className="text-sm text-muted-foreground">
        ← Obras y remodelaciones
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">
          {label(o.tipo)} en {o.unidad.codigo}
        </h2>
        <StatusBadge value={o.estado} />
      </div>

      {problemas.length > 0 && o.estado === "SOLICITADA" && (
        <div className="mb-4 flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="size-5 shrink-0 text-warning" />
          <ul className="space-y-0.5">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {gestor && o.estado === "SOLICITADA" && (
          <>
            <FormDialog titulo="Aprobar obra" action={decidirObraAction} extra={{ id: o.id, aprobar: "true" }} triggerLabel="Aprobar" submitLabel="Aprobar obra" successMessage="Obra aprobada">
              <TextField name="horario" label="Horario permitido" defaultValue={o.horario ?? ""} />
              <MoneyField name="deposito" label="Depósito" defaultValue={toNumber(o.deposito)} />
              <TextAreaField name="observaciones" label="Condiciones (opcional)" placeholder="Proteger ascensor con cartón, retirar escombros el mismo día…" />
            </FormDialog>
            <FormDialog titulo="Rechazar obra" action={decidirObraAction} extra={{ id: o.id, aprobar: "false" }} triggerLabel="Rechazar" triggerVariant="outline" submitLabel="Rechazar" successMessage="Solicitud rechazada">
              <TextAreaField name="observaciones" label="Motivo" required />
            </FormDialog>
          </>
        )}
        {gestor && o.estado === "APROBADA" && (
          <ActionButton action={estadoObraAction} input={{ id: o.id, estado: "EN_CURSO" }} successMessage="Obra en curso">
            Marcar en curso
          </ActionButton>
        )}
        {gestor && (o.estado === "EN_CURSO" || o.estado === "APROBADA") && (
          <FormDialog titulo="Finalizar obra" action={estadoObraAction} extra={{ id: o.id, estado: "FINALIZADA" }} triggerLabel="Finalizar" triggerVariant="outline" successMessage="Obra finalizada">
            <TextAreaField name="notas" label="Notas de cierre" placeholder="Estado de zonas comunes, devolución del depósito…" />
          </FormDialog>
        )}
        {(gestor || propio) && (o.estado === "SOLICITADA" || o.estado === "APROBADA") && (
          <ActionButton action={estadoObraAction} input={{ id: o.id, estado: "CANCELADA" }} variant="ghost" confirm="¿Cancelar esta solicitud de obra?" successMessage="Solicitud cancelada">
            Cancelar solicitud
          </ActionButton>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Section titulo="Trabajos">
            <p className="whitespace-pre-line rounded-xl border bg-card p-4 text-sm">{o.descripcion}</p>
          </Section>
          <Section titulo={`Contratistas (${o.contratistasLista.length})`}>
            {o.contratistasLista.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay contratistas registrados.</p>
            ) : (
              <ul className="space-y-2">
                {o.contratistasLista.map((c) => {
                  const vencido = c.vence ? new Date(`${c.vence}T23:59:59-05:00`) < hoy : true;
                  return (
                    <li key={`${c.documento}-${c.nombre}`} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
                      <div>
                        <p className="font-medium">{c.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          Doc. {c.documento} · Seguridad social {c.vence ? `hasta ${fecha(new Date(`${c.vence}T12:00:00-05:00`))}` : "sin fecha"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge value={vencido ? "VENCIDO" : "VIGENTE"} />
                        {c.seguridadSocialUrl && (
                          <a href={c.seguridadSocialUrl} target="_blank" rel="noreferrer" aria-label="Ver soporte" className="p-2">
                            <FileText className="size-4" />
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {editable && (
              <div className="mt-3">
                <FormDialog titulo="Contratistas" action={contratistasAction} extra={{ id: o.id }} triggerLabel="Editar contratistas" triggerVariant="outline" successMessage="Contratistas actualizados" wide>
                  <ContratistasEditor inicial={o.contratistasLista} />
                </FormDialog>
              </div>
            )}
          </Section>
          {(o.observaciones || o.cierreNotas) && (
            <Section titulo="Observaciones de la administración">
              <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
                {o.observaciones && <p className="whitespace-pre-line">{o.observaciones}</p>}
                {o.cierreNotas && <p className="whitespace-pre-line">Cierre: {o.cierreNotas}</p>}
              </div>
            </Section>
          )}
        </div>
        <aside>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm lg:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Fechas</dt>
              <dd>
                {fecha(o.fechaInicio)} – {fecha(o.fechaFin)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Horario permitido</dt>
              <dd>{o.horario ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Depósito</dt>
              <dd>{toNumber(o.deposito) > 0 ? cop(o.deposito) : "No aplica"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Solicitada</dt>
              <dd>{fecha(o.createdAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
