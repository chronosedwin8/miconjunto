import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha, fechaHora, nombreCompleto } from "@/lib/format";
import { esGestor, obtenerLlamado } from "@/lib/convivencia/service";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton, ActionForm } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { acusarLlamadoAction, cerrarLlamadoAction, responderLlamadoAction } from "../../actions";
import { ProponerMulta } from "../../formularios";

export const metadata = { title: "Llamado de atención" };

export default async function LlamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  const { id } = await params;
  const l = await obtenerLlamado(ctx, id);
  const gestor = esGestor(ctx);
  const residente = ctx.unidadIds.includes(l.unidadId);
  const abierto = l.estado !== "CERRADO" && l.estado !== "ESCALADO_MULTA";
  return (
    <>
      <Link href={gestor ? "/convivencia" : "/convivencia"} className="text-sm text-muted-foreground">
        ← {gestor ? "Llamados de atención" : "Mis llamados y multas"}
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{l.motivo}</h2>
        <StatusBadge value={l.estado} />
        <StatusBadge value={l.gravedad} text={`Gravedad ${l.gravedad.toLowerCase()}`} />
      </div>

      {residente && !l.acuseEn && (
        <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm">
            La administración te comparte esta comunicación para mantener una buena convivencia. Por favor léela y confirma que la recibiste. Si lo deseas, puedes responder con tu versión de los
            hechos.
          </p>
          <ActionButton action={acusarLlamadoAction} input={{ id: l.id }} className="mt-3 w-full sm:w-auto" successMessage="Gracias, quedó registrada la lectura">
            Confirmo que lo leí
          </ActionButton>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Section titulo="Descripción">
            <div className="rounded-xl border bg-card p-4">
              <p className="whitespace-pre-line text-sm">{l.descripcion}</p>
              {l.evidencias.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.evidencias.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="Evidencia" className="size-24 rounded-lg border object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {l.infraccion && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {l.infraccion.codigo} · {l.infraccion.nombre}
                  {l.infraccion.articulo ? ` · ${l.infraccion.articulo}` : ""}
                </p>
              )}
            </div>
          </Section>

          <Section titulo="Respuesta del residente">
            {l.respuesta ? (
              <div className="rounded-xl border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">{fechaHora(l.respuestaEn)}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{l.respuesta}</p>
              </div>
            ) : residente && abierto ? (
              <ActionForm action={responderLlamadoAction} extra={{ id: l.id }} submitLabel="Enviar respuesta" successMessage="Respuesta enviada" draftKey={`llamado-${l.id}`}>
                <TextAreaField name="respuesta" label="Tu respuesta o descargos" placeholder="Cuéntanos tu versión con calma. La administración la tendrá en cuenta." rows={5} required />
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">Sin respuesta.</p>
            )}
          </Section>

          {gestor && abierto && (
            <div className="flex flex-wrap gap-2">
              {can(ctx, "convivencia.crear") && <ProponerMulta ctx={ctx} unidadId={l.unidadId} llamadoId={l.id} triggerLabel="Escalar a multa" variant="outline" />}
              {can(ctx, "convivencia.crear") && (
                <FormDialog titulo="Cerrar llamado" action={cerrarLlamadoAction} extra={{ id: l.id }} triggerLabel="Cerrar llamado" triggerVariant="outline" successMessage="Llamado cerrado">
                  <TextAreaField name="nota" label="Nota de cierre (opcional)" />
                </FormDialog>
              )}
            </div>
          )}
          {l.multa && (
            <Link href={`/convivencia/multas/${l.multa.id}`} className="block rounded-xl border bg-card p-4 text-sm">
              Escalado a multa por {cop(l.multa.valor)} · <StatusBadge value={l.multa.estado} />
            </Link>
          )}
        </div>
        <aside>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm lg:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Unidad</dt>
              <dd>{gestor ? <Link className="text-primary underline" href={`/convivencia/unidad/${l.unidad.id}`}>{l.unidad.codigo}</Link> : l.unidad.codigo}</dd>
            </div>
            {l.persona && (
              <div>
                <dt className="text-xs text-muted-foreground">Persona</dt>
                <dd>{nombreCompleto(l.persona)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Enviado</dt>
              <dd>
                {fecha(l.fecha)}
                {l.enviadoPor && <span className="block text-xs text-muted-foreground">por {l.enviadoPor.nombre}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Leído por el residente</dt>
              <dd>{l.acuseEn ? fechaHora(l.acuseEn) : "Aún no"}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
