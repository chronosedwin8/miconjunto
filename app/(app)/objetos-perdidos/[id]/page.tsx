import Link from "next/link";
import { CheckCircle2, Clock, Gift, Hand, Lock, MapPin, PackageCheck, RefreshCw, ShieldCheck, Sparkles, Warehouse, XCircle } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fecha, fechaHora, tiempoRelativo } from "@/lib/format";
import { categoriaLabel, LUGARES_CUSTODIA, UMBRAL_PROBABLE } from "@/lib/objetos-perdidos/reglas";
import { obtenerObjeto, type DetalleObjeto } from "@/lib/objetos-perdidos/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { ChoiceCards, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SignaturePad } from "@/app/(app)/porteria/_components/signature-pad";
import { CategoriaIcono, FotoObjeto, TipoPill } from "../_components/ui";
import {
  aparecioAction,
  devolvioDirectoAction,
  disponerObjetoAction,
  entregarObjetoAction,
  reclamarObjetoAction,
  recibirCustodiaAction,
  renovarReporteAction,
  resolverReclamoAction,
} from "../actions";

export const metadata = { title: "Objeto perdido" };

function Galeria({ fotos, d }: { fotos: string[]; d: DetalleObjeto["objeto"] }) {
  if (!fotos.length) return <FotoObjeto categoria={d.categoria} tipo={d.tipo} className="h-36 rounded-2xl sm:h-48" />;
  return (
    <div className="space-y-2">
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl no-scrollbar">
        {fotos.map((u, i) => (
          <a key={u} href={u} target="_blank" rel="noreferrer" className="relative w-full shrink-0 snap-center">
            <img src={u} alt={`Foto ${i + 1} de ${d.titulo}`} className="aspect-[4/3] w-full rounded-2xl border object-cover sm:aspect-[16/9]" />
            {fotos.length > 1 && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{i + 1}/{fotos.length}</span>}
          </a>
        ))}
      </div>
      {fotos.length > 1 && <p className="text-center text-xs text-muted-foreground">Desliza para ver más fotos</p>}
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

const TONO_LINEA = { default: "bg-muted text-muted-foreground", info: "bg-primary text-primary-foreground", success: "bg-success text-white", warning: "bg-warning text-white", destructive: "bg-destructive text-white" };

export default async function ObjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("objetos.ver");
  const { id } = await params;
  const det = await obtenerObjeto(ctx, id);
  const { objeto: o, puede, gestor, propio } = det;
  const perdido = o.tipo === "PERDIDO";
  const lugarTexto = [o.zona, o.lugar && o.lugar !== o.zona ? o.lugar : null].filter(Boolean).join(" · ");
  const perdidasRelacionadas = !perdido ? det.coincidencias.filter((c) => c.tipo === "PERDIDO") : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader volver="/objetos-perdidos" titulo={o.titulo} descripcion={<span className="font-mono text-xs">{o.codigo ?? "Sin código"}</span>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <Galeria fotos={o.fotos} d={o} />

          <div className="flex flex-wrap items-center gap-2">
            <TipoPill tipo={o.tipo} />
            <StatusBadge value={o.estado} />
            <Badge variant="outline" className="gap-1">
              <CategoriaIcono categoria={o.categoria} className="size-3" /> {categoriaLabel(o.categoria)}
            </Badge>
            {o.recompensa && (
              <Badge variant="warning" className="gap-1">
                <Gift className="size-3" /> Recompensa: {o.recompensa}
              </Badge>
            )}
            {propio && <Badge variant="secondary">Tu reporte</Badge>}
          </div>

          {/* Estado del reclamo propio */}
          {det.miReclamo?.estado === "PENDIENTE" && (
            <Aviso tono="info" icon={Clock} titulo="Tu reclamo está en revisión">
              Portería o administración compararán tu descripción con los detalles privados del objeto y te avisaremos.
            </Aviso>
          )}
          {det.miReclamo?.estado === "APROBADO" && o.estado !== "DEVUELTO" && (
            <Aviso tono="success" icon={CheckCircle2} titulo="¡Tu reclamo fue aprobado!">
              Recógelo en <b>{o.custodia ?? "portería"}</b> con tu documento de identidad. Te pedirán firmar al recibirlo.
            </Aviso>
          )}
          {det.miReclamo?.estado === "RECHAZADO" && (
            <Aviso tono="destructive" icon={XCircle} titulo="Tu reclamo no fue aprobado">
              {det.miReclamo.respuesta ?? "Los detalles no coincidieron."}
            </Aviso>
          )}

          {/* Acciones principales */}
          {(puede.reclamar || puede.aparecio || puede.devolvioFinder || puede.renovar || puede.custodia || puede.entregar || puede.disponer) && (
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {puede.reclamar && (
                <FormDialog
                  titulo="Es mío: reclamar"
                  descripcion="Describe detalles que solo el dueño sabría (qué contiene, marcas, stickers, fondo de pantalla…). No se publican."
                  action={reclamarObjetoAction}
                  extra={{ id: o.id }}
                  submitLabel="Enviar reclamo"
                  successMessage="Reclamo enviado. Te avisaremos."
                  trigger={
                    <Button size="lg" className="h-12 w-full sm:w-auto">
                      <Hand /> Es mío, reclamar
                    </Button>
                  }
                >
                  <TextAreaField name="descripcion" label="¿Cómo sabes que es tuyo?" required minLength={10} maxLength={800} rows={4} placeholder="Ej.: la billetera tiene mi cédula a nombre de…, una foto de mi perro y una tarjeta Nequi." />
                </FormDialog>
              )}
              {puede.custodia && (
                <FormDialog
                  titulo="Recibir en custodia"
                  descripcion="Registra que el objeto quedó guardado. Se avisará a quien lo reportó y a los posibles dueños."
                  action={recibirCustodiaAction}
                  extra={{ id: o.id }}
                  submitLabel="Recibir"
                  successMessage="Objeto en custodia"
                  trigger={
                    <Button size="lg" className="h-12 w-full sm:w-auto">
                      <Warehouse /> Recibir en custodia
                    </Button>
                  }
                >
                  <TextField name="custodia" label="¿Dónde queda guardado?" required list="op-custodia-det" defaultValue={ctx.rolBase === "PORTERIA" ? "Portería principal" : "Administración"} />
                  <datalist id="op-custodia-det">
                    {LUGARES_CUSTODIA.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </FormDialog>
              )}
              {puede.entregar && (
                <FormDialog
                  titulo="Entregar al dueño"
                  descripcion="Verifica la identidad con el documento original y pide la firma en pantalla."
                  action={entregarObjetoAction}
                  extra={{ id: o.id }}
                  submitLabel="Confirmar entrega"
                  successMessage="Objeto entregado"
                  wide
                  trigger={
                    <Button size="lg" variant={puede.custodia ? "outline" : "default"} className="h-12 w-full sm:w-auto">
                      <PackageCheck /> Entregar
                    </Button>
                  }
                >
                  {!det.reclamoAprobado && (
                    <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">No hay un reclamo aprobado. Compara tú mismo los detalles privados antes de entregar.</p>
                  )}
                  <TextField name="entregadoA" label="Nombre de quien recibe" required maxLength={120} defaultValue={det.reclamoAprobado?.usuario ?? ""} />
                  <TextField name="entregadoDocumento" label="Número de documento" required inputMode="numeric" maxLength={40} placeholder="Cédula u otro documento" />
                  {perdidasRelacionadas.length > 0 && (
                    <SelectField
                      name="perdidoId"
                      label="Reporte de pérdida relacionado (opcional)"
                      placeholder="Ninguno"
                      options={perdidasRelacionadas.map((p) => ({ value: p.id, label: `${p.codigo ?? ""} · ${p.titulo}` }))}
                    />
                  )}
                  <SignaturePad name="firma" label="Firma de quien recibe" />
                </FormDialog>
              )}
              {puede.disponer && (
                <FormDialog
                  titulo="Disponer del objeto"
                  descripcion="Para objetos que nadie reclamó dentro del plazo de custodia."
                  action={disponerObjetoAction}
                  extra={{ id: o.id }}
                  submitLabel="Guardar disposición"
                  successMessage="Disposición registrada"
                  trigger={
                    <Button size="lg" variant="outline" className="h-12 w-full sm:w-auto">
                      <Gift /> Donar o cerrar
                    </Button>
                  }
                >
                  <ChoiceCards
                    name="disposicion"
                    defaultValue="DONADO"
                    options={[
                      { value: "DONADO", label: "Donar", description: "Entregado a una fundación o campaña" },
                      { value: "CERRADO", label: "Cerrar", description: "Desechado o sin valor" },
                    ]}
                  />
                  <TextAreaField name="nota" label="Detalle" required maxLength={500} rows={3} placeholder="Ej.: donado a la Fundación Niños de los Andes, acta 12 de octubre." />
                </FormDialog>
              )}
              {puede.aparecio && (
                <ActionButton action={aparecioAction} input={{ id: o.id }} size="lg" variant={propio ? "default" : "outline"} className="h-12 w-full sm:w-auto" confirm="¿Ya lo recuperaste? Se cerrará el reporte." successMessage="¡Qué bien! Reporte cerrado.">
                  <CheckCircle2 /> ¡Ya apareció!
                </ActionButton>
              )}
              {puede.devolvioFinder && (
                <FormDialog
                  titulo="Lo devolví a su dueño"
                  action={devolvioDirectoAction}
                  extra={{ id: o.id }}
                  submitLabel="Cerrar reporte"
                  successMessage="¡Gracias por ayudar!"
                  trigger={
                    <Button size="lg" variant="outline" className="h-12 w-full sm:w-auto">
                      <CheckCircle2 /> Lo devolví a su dueño
                    </Button>
                  }
                >
                  <TextField name="entregadoA" label="¿A quién se lo entregaste?" required maxLength={120} placeholder="Nombre y apartamento" />
                </FormDialog>
              )}
              {puede.renovar && (
                <ActionButton action={renovarReporteAction} input={{ id: o.id }} size="lg" variant="ghost" className="h-12 w-full sm:w-auto" successMessage="Reporte renovado">
                  <RefreshCw /> Seguir buscando
                </ActionButton>
              )}
            </div>
          )}

          {o.tipo === "ENCONTRADO" && o.estado === "ABIERTO" && !gestor && (
            <p className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">Lo tiene el vecino que lo encontró. Si es tuyo, reclámalo y portería o administración coordinarán la entrega.</p>
          )}

          <Section titulo="Descripción">
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="whitespace-pre-line text-sm">{o.descripcion}</p>
              {"rasgosPrivados" in o && o.rasgosPrivados && (
                <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <Lock className="size-3.5" /> Detalles privados · {gestor && !propio ? "solo portería y administración" : "solo tú y la administración"}
                  </p>
                  <p className="whitespace-pre-line text-sm">{o.rasgosPrivados}</p>
                </div>
              )}
            </div>
          </Section>

          {/* Reclamos (gestión) */}
          {gestor && det.reclamos.length > 0 && (
            <Section titulo={`Reclamos (${det.reclamos.length})`}>
              <ul className="space-y-3">
                {det.reclamos.map((r) => (
                  <li key={r.id} className={cn("rounded-xl border bg-card p-3", r.estado === "PENDIENTE" && "border-warning/60")}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{r.usuario}</span>
                      {r.unidad && <Badge variant="outline">{r.unidad}</Badge>}
                      <StatusBadge value={r.estado} />
                      <span className="ml-auto text-xs text-muted-foreground">{tiempoRelativo(r.creado)}</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg bg-muted/50 p-2">
                        <p className="text-xs font-medium text-muted-foreground">Lo que dice el reclamante</p>
                        <p className="whitespace-pre-line text-sm">{r.descripcion}</p>
                      </div>
                      <div className="rounded-lg border border-dashed border-warning/50 bg-warning/5 p-2">
                        <p className="flex items-center gap-1 text-xs font-medium text-warning">
                          <Lock className="size-3" /> Detalles privados del objeto
                        </p>
                        <p className="whitespace-pre-line text-sm">{("rasgosPrivados" in o && o.rasgosPrivados) || "Quien lo encontró no registró detalles privados."}</p>
                      </div>
                    </div>
                    {r.perdidasDelReclamante.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Reportó la pérdida:{" "}
                        {r.perdidasDelReclamante.map((p) => (
                          <span key={p.id} className="mr-2">
                            <Link href={`/objetos-perdidos/${p.id}`} className="text-primary underline-offset-2 hover:underline">
                              {p.codigo} · {p.titulo}
                            </Link>
                            {p.rasgosPrivados && <span className="block whitespace-pre-line text-foreground">🔒 {p.rasgosPrivados}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.respuesta && <p className="mt-2 text-sm text-muted-foreground">Respuesta: {r.respuesta}</p>}
                    {puede.resolverReclamos && (r.estado === "PENDIENTE" || r.estado === "APROBADO") && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.estado === "PENDIENTE" && (
                          <FormDialog
                            titulo="Aprobar reclamo"
                            descripcion="Confirma que los detalles coinciden. Se avisará al residente para que lo recoja con su documento."
                            action={resolverReclamoAction}
                            extra={{ reclamoId: r.id, decision: "APROBAR" }}
                            submitLabel="Aprobar"
                            successMessage="Reclamo aprobado"
                            trigger={
                              <Button size="sm">
                                <ShieldCheck /> Coincide: aprobar
                              </Button>
                            }
                          >
                            <TextAreaField name="respuesta" label="Mensaje para el residente (opcional)" maxLength={500} rows={2} placeholder="Ej.: puedes recogerlo en portería después de las 2 p. m." />
                          </FormDialog>
                        )}
                        <FormDialog
                          titulo="Rechazar reclamo"
                          action={resolverReclamoAction}
                          extra={{ reclamoId: r.id, decision: "RECHAZAR" }}
                          submitLabel="Rechazar"
                          successMessage="Reclamo rechazado"
                          trigger={
                            <Button size="sm" variant="outline">
                              <XCircle /> Rechazar
                            </Button>
                          }
                        >
                          <TextAreaField name="respuesta" label="Motivo (se le enviará al residente)" required maxLength={500} rows={2} placeholder="Ej.: los detalles no coinciden con el objeto." />
                        </FormDialog>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {det.coincidencias.length > 0 && (
            <Section
              titulo={
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" /> {perdido ? "Puede ser este" : "Puede ser de alguien que lo reportó"}
                </span>
              }
            >
              <ul className="space-y-2">
                {det.coincidencias.map((c) => (
                  <li key={c.id}>
                    <Link href={`/objetos-perdidos/${c.id}`} className="flex gap-3 rounded-xl border bg-card p-2 hover:border-primary/50">
                      <FotoObjeto src={c.fotos[0]} categoria={c.categoria} tipo={c.tipo} className="size-20 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <Badge variant={c.puntaje >= UMBRAL_PROBABLE ? "success" : "info"} className="mb-0.5">
                          {c.puntaje >= UMBRAL_PROBABLE ? "Muy probable" : "Posible"}
                        </Badge>
                        <p className="line-clamp-2 font-medium leading-snug">{c.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.tipo === "PERDIDO" ? "Se perdió" : "Se encontró"} · {fecha(c.fecha)}
                          {c.lugar ? ` · ${c.lugar}` : ""}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.razones.join(" · ")}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 lg:grid-cols-1">
            <Dato label={perdido ? "Se perdió el" : "Se encontró el"}>{fecha(o.fecha)}</Dato>
            <Dato label="Lugar">
              {lugarTexto ? (
                <span className="inline-flex items-start gap-1">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  {lugarTexto}
                </span>
              ) : null}
            </Dato>
            <Dato label="Color">{o.color}</Dato>
            <Dato label="Marca">{o.marca}</Dato>
            {(o.estado === "EN_CUSTODIA" || o.estado === "RECLAMADO") && <Dato label="Dónde reclamarlo">{o.custodia}</Dato>}
            <Dato label="Contacto">{o.contacto}</Dato>
            <Dato label="Reportado por">{o.reportadoPor ? `${o.reportadoPor}${o.unidad ? ` (${o.unidad})` : ""}` : null}</Dato>
            {gestor && <Dato label="Recibido por">{o.recibidoPor}</Dato>}
            {o.venceEn && o.estado !== "DEVUELTO" && <Dato label={perdido ? "Se cierra automáticamente" : "Plazo de custodia"}>{fecha(o.venceEn)}</Dato>}
            {o.estado === "DEVUELTO" && (
              <>
                <Dato label="Entregado a">{o.entregadoA}</Dato>
                <Dato label="Documento">{o.entregadoDocumento}</Dato>
                <Dato label="Entregó">{o.entregadoPor}</Dato>
              </>
            )}
            <Dato label="Disposición">{o.disposicion}</Dato>
          </dl>
          {o.firmaUrl && (
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-1 text-xs text-muted-foreground">Firma de quien recibió</p>
              <img src={o.firmaUrl} alt="Firma de quien recibió el objeto" className="h-24 w-full rounded border bg-white object-contain" />
            </div>
          )}

          <Section titulo="Historial">
            <ol className="relative space-y-3 border-l-2 border-muted pl-5">
              {det.linea.map((e, i) => (
                <li key={i} className="relative">
                  <span className={cn("absolute -left-[27px] top-1 size-3 rounded-full border-2 border-background", TONO_LINEA[e.tono])} />
                  <p className="text-sm font-medium">{e.titulo}</p>
                  {e.detalle && <p className="text-xs text-muted-foreground">{e.detalle}</p>}
                  <p className="text-xs text-muted-foreground">{fechaHora(e.fecha)}</p>
                </li>
              ))}
            </ol>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Aviso({ tono, icon: I, titulo, children }: { tono: "info" | "success" | "destructive"; icon: React.ComponentType<{ className?: string }>; titulo: string; children: React.ReactNode }) {
  const cls = { info: "border-primary/30 bg-primary/5 text-primary", success: "border-success/40 bg-success/10 text-success", destructive: "border-destructive/30 bg-destructive/5 text-destructive" }[tono];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3", cls)}>
      <I className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold">{titulo}</p>
        <p className="text-foreground/80">{children}</p>
      </div>
    </div>
  );
}
