import Link from "next/link";
import { CircleCheck, Circle } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha, fechaHora, nombreCompleto, toNumber } from "@/lib/format";
import { esGestor, obtenerMulta } from "@/lib/convivencia/service";
import { DIAS_DESCARGOS, pasosDebidoProceso, puedeDecidir, puedePresentarDescargos } from "@/lib/convivencia/debido-proceso";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionForm } from "@/components/form/action-form";
import { MoneyField, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { decidirMultaAction, descargosAction, notificarMultaAction } from "../../actions";

export const metadata = { title: "Multa" };

export default async function MultaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  const { id } = await params;
  const m = await obtenerMulta(ctx, id);
  const gestor = esGestor(ctx);
  const residente = ctx.unidadIds.includes(m.unidadId);
  const pasos = pasosDebidoProceso(m);
  const descargos = puedePresentarDescargos(m);
  const decision = puedeDecidir(m);
  const puedePagar = m.estado === "RATIFICADA" && m.cuotaId && can(ctx, "pagos.pagar") && residente;

  return (
    <>
      <Link href={gestor ? "/convivencia/multas" : "/convivencia"} className="text-sm text-muted-foreground">
        ← {gestor ? "Multas" : "Mis llamados y multas"}
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">Multa por {cop(m.valor)}</h2>
        <StatusBadge value={m.estado} />
      </div>

      <ol className="mb-6 grid gap-2 sm:grid-cols-5" aria-label="Debido proceso">
        {pasos.map((p) => (
          <li key={p.id} className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm sm:flex-col", p.hecho ? "border-primary/40 bg-primary/5" : "bg-card")}>
            {p.hecho ? <CircleCheck className="size-5 shrink-0 text-primary" /> : <Circle className="size-5 shrink-0 text-muted-foreground" />}
            <div>
              <p className="font-medium">{p.titulo}</p>
              {p.fecha && <p className="text-xs text-muted-foreground">{fecha(p.fecha)}</p>}
            </div>
          </li>
        ))}
      </ol>

      {puedePagar && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm">El consejo ratificó la multa y el valor quedó cargado en el estado de cuenta de {m.unidad.codigo}.</p>
          <Button className="mt-3 w-full sm:w-auto" render={<Link href={`/cuenta/pagar?cuotas=${m.cuotaId}&unidad=${m.unidadId}`} />}>
            Pagar {cop(m.cuota?.saldo ?? m.valor)}
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Section titulo="Hechos">
            <div className="rounded-xl border bg-card p-4">
              <p className="whitespace-pre-line text-sm">{m.descripcion}</p>
              {m.evidencias.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.evidencias.map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="Evidencia" className="size-24 rounded-lg border object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {m.infraccion && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {m.infraccion.codigo} · {m.infraccion.nombre}
                  {m.infraccion.articulo ? ` · ${m.infraccion.articulo}` : ""}
                </p>
              )}
              {m.llamado && (
                <Link href={`/convivencia/llamados/${m.llamado.id}`} className="mt-2 block text-xs text-primary underline">
                  Llamado de atención previo del {fecha(m.llamado.fecha)}
                </Link>
              )}
            </div>
          </Section>

          {gestor && m.estado === "PROPUESTA" && can(ctx, "convivencia.crear") && (
            <Section titulo="Notificar al residente" className="rounded-xl border p-4">
              <p className="mb-3 text-sm text-muted-foreground">Al notificar, los residentes de la unidad reciben el aviso con el valor propuesto y el plazo para presentar descargos (días hábiles).</p>
              <ActionForm action={notificarMultaAction} extra={{ id: m.id }} submitLabel="Notificar" successMessage="Multa notificada">
                <TextField name="dias" label="Días hábiles para descargos" type="number" defaultValue={DIAS_DESCARGOS} min={1} max={30} />
              </ActionForm>
            </Section>
          )}

          <Section titulo="Descargos">
            {m.descargos ? (
              <div className="rounded-xl border bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">Presentados el {fechaHora(m.descargosEn)}</p>
                <p className="mt-1 whitespace-pre-line text-sm">{m.descargos}</p>
              </div>
            ) : descargos.ok && (residente || can(ctx, "convivencia.crear")) ? (
              <ActionForm action={descargosAction} extra={{ id: m.id }} submitLabel={residente ? "Presentar descargos" : "Registrar descargos recibidos"} successMessage="Descargos registrados" draftKey={`descargos-${m.id}`}>
                <p className="text-sm text-muted-foreground">
                  Tienes hasta el <strong>{fecha(m.plazoDescargos)}</strong> para contar tu versión y aportar pruebas. El consejo los leerá antes de decidir.
                </p>
                <TextAreaField name="descargos" label="Descargos" rows={6} required />
              </ActionForm>
            ) : (
              <p className="text-sm text-muted-foreground">{m.estado === "PROPUESTA" ? "Se habilitan cuando la multa sea notificada." : m.plazoDescargos ? `El plazo venció el ${fecha(m.plazoDescargos)} sin descargos.` : "Sin descargos."}</p>
            )}
          </Section>

          {can(ctx, "convivencia.decidir") && (decision.ok || m.estado === "PROPUESTA") && (
            <Section titulo="Decisión del consejo" className="rounded-xl border border-primary/30 p-4">
              {!decision.ok && <p className="mb-2 text-sm text-muted-foreground">{decision.motivo} Si no procede, puedes revocar la propuesta.</p>}
              <FormDialog
                titulo="Decisión del consejo"
                descripcion="Si se ratifica, el valor se carga a la cuenta de la unidad y se notifica al residente con el enlace de pago."
                action={decidirMultaAction}
                extra={{ id: m.id }}
                triggerLabel="Registrar decisión"
                submitLabel="Guardar decisión"
                successMessage="Decisión registrada"
                confirm="¿Confirmas la decisión? Una multa ratificada se carga de inmediato a cartera."
              >
                <SelectField
                  name="decision"
                  label="Decisión"
                  options={decision.ok ? [{ value: "RATIFICADA", label: "Ratificar la multa" }, { value: "REVOCADA", label: "Revocar la multa" }] : [{ value: "REVOCADA", label: "Revocar la propuesta" }]}
                  placeholder={false}
                />
                {decision.ok && <MoneyField name="valor" label="Valor final" defaultValue={toNumber(m.valor)} hint="Puedes ajustarlo según los descargos." />}
                <TextAreaField name="resolucion" label="Resolución (motivación)" placeholder="Hechos probados, descargos considerados, norma aplicada y decisión." rows={6} required />
              </FormDialog>
            </Section>
          )}

          {m.resolucion && (
            <Section titulo="Resolución">
              <div className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                  {fechaHora(m.resolucionEn)}
                  {m.decididaPor ? ` · ${m.decididaPor.nombre}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm">{m.resolucion}</p>
              </div>
            </Section>
          )}
        </div>
        <aside>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm lg:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Unidad</dt>
              <dd>{gestor ? <Link className="text-primary underline" href={`/convivencia/unidad/${m.unidad.id}`}>{m.unidad.codigo}</Link> : m.unidad.codigo}</dd>
            </div>
            {m.persona && (
              <div>
                <dt className="text-xs text-muted-foreground">Persona</dt>
                <dd>{nombreCompleto(m.persona)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Valor</dt>
              <dd>{cop(m.valor)}</dd>
            </div>
            {m.cuota && (
              <div>
                <dt className="text-xs text-muted-foreground">Cargo en cartera</dt>
                <dd>
                  <StatusBadge value={m.cuota.estado} /> <span className="text-xs text-muted-foreground">Saldo {cop(m.cuota.saldo)} · vence {fecha(m.cuota.fechaVencimiento)}</span>
                </dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </>
  );
}
