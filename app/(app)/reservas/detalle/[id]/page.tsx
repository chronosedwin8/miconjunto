import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Download, FileText, Receipt, Star, Users, Wallet } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fechaHora, fechaLarga, hora, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { AppError } from "@/lib/errors";
import { cuotasDeReserva, enlacePago, esPropia, nombrePersona, reservaVisible } from "@/lib/reservas/service";
import { checklistActa, formatoDuracion, politicaCancelacion } from "@/lib/reservas/reglas";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActaDialog, Calificar, CancelarDialog, RechazarDialog } from "../../componentes";
import { aprobarReservaAction, noShowAction } from "../../actions";

export const metadata = { title: "Detalle de la reserva" };

type Acta = { fecha: string; porNombre?: string; checklist: Record<string, boolean>; observaciones?: string | null; fotos?: string[]; danos?: boolean; descripcionDano?: string | null; ticketId?: string | null; multaId?: string | null };

function ActaCard({ titulo, acta }: { titulo: string; acta: Acta }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{titulo}</p>
        <span className="text-xs text-muted-foreground">
          {fechaHora(acta.fecha)}
          {acta.porNombre ? ` · ${acta.porNombre}` : ""}
        </span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {Object.entries(acta.checklist ?? {}).map(([k, v]) => (
          <li key={k} className={v ? "text-success" : "text-destructive"}>
            {v ? "✓" : "✗"} {k}
          </li>
        ))}
      </ul>
      {acta.observaciones && <p className="whitespace-pre-line text-muted-foreground">{acta.observaciones}</p>}
      {acta.danos && (
        <p className="rounded-lg bg-destructive/10 p-2 text-destructive">
          Daño: {acta.descripcionDano}
          {acta.ticketId ? " · se creó un ticket" : ""}
          {acta.multaId ? " · multa propuesta" : ""}
        </p>
      )}
      {acta.fotos && acta.fotos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {acta.fotos.map((f) => (
            <a key={f} href={f} target="_blank" rel="noreferrer">
              { }
              <img src={f} alt="Foto del acta" className="size-20 rounded-lg border object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function DetalleReservaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["reservas.ver", "reservas.ver_todos", "reservas.checkin"]);
  const { id } = await params;
  const r = await reservaVisible(ctx, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [cuotas, facturas, persona] = await Promise.all([
    cuotasDeReserva(ctx.db, r),
    ctx.db.facturaElectronica.findMany({ where: { reservaId: r.id }, orderBy: { createdAt: "asc" } }),
    nombrePersona(ctx.db, r.personaId),
  ]);
  const propia = esPropia(ctx, r);
  const pendientes = cuotas.filter((c) => c.estado === "PENDIENTE" || c.estado === "PARCIAL");
  const porPagar = pendientes.reduce((a, c) => a + toNumber(c.saldo), 0);
  const activa = ["SOLICITADA", "APROBADA"].includes(r.estado);
  const puedeCancelar = activa && !r.checkInEn && ((propia && can(ctx, "reservas.crear") && r.inicio > new Date()) || can(ctx, "reservas.cancelar_todas"));
  const pol = politicaCancelacion({ pagada: r.pagada && cuotas.length > 0, inicio: r.inicio, ahora: new Date(), horasReembolso: r.zona.horasCancelacionReembolso, porAdministracion: !propia, valor: toNumber(r.valor) + toNumber(r.iva), deposito: toNumber(r.deposito) });
  const avisoCancelar =
    pol.tipo === "SIN_PAGO"
      ? "La reserva no tiene pagos: se anula el cobro pendiente."
      : pol.tipo === "REEMBOLSO"
        ? `Se te reembolsan ${cop(pol.reembolsoAlquiler + pol.reembolsoDeposito)}${facturas.some((f) => f.estado === "VALIDADA") ? " y se emite una nota crédito" : ""}.`
        : `Faltan menos de ${r.zona.horasCancelacionReembolso} h: se retiene el alquiler (${cop(pol.retenido)}).${pol.reembolsoDeposito ? ` El depósito (${cop(pol.reembolsoDeposito)}) sí se devuelve.` : ""}`;
  const items = checklistActa(r.zona.categoria);
  const duracion = Math.round((r.fin.getTime() - r.inicio.getTime()) / 60000);
  const pendienteAprobacion = r.estado === "SOLICITADA" && r.zona.requiereAprobacion && !r.aprobadaPorId;
  const esHoy = Math.abs(r.inicio.getTime() - Date.now()) < 24 * 3600000 || (Date.now() > r.inicio.getTime() && Date.now() < r.fin.getTime());

  return (
    <>
      <PageHeader titulo={r.zona.nombre} descripcion={`Reserva de ${r.unidad.codigo}`} volver={propia ? "/reservas/mis" : "/reservas/admin"} acciones={<StatusBadge value={r.estado} className="text-sm" />} />

      <Section>
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-5 text-primary" />
            <div>
              <p className="font-semibold first-letter:uppercase">{fechaLarga(r.inicio)}</p>
              <p className="text-sm text-muted-foreground">
                {hora(r.inicio)} a {hora(r.fin)} · {formatoDuracion(duracion)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <Users className="mt-0.5 size-5 text-primary" />
            <p>
              {r.asistentes} asistente{r.asistentes === 1 ? "" : "s"}
              {persona ? ` · ${persona.nombre}` : ""}
              {r.motivo ? ` · ${r.motivo}` : ""}
            </p>
          </div>
          {pendienteAprobacion && <p className="rounded-lg bg-blue-500/10 p-3 text-sm text-blue-700 dark:text-blue-300">Esperando aprobación de la administración.</p>}
          {r.estado === "SOLICITADA" && r.aprobadaPorId && !r.pagada && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Aprobada: falta el pago para confirmarla.</p>}
          {r.motivoCancelacion && ["CANCELADA", "RECHAZADA"].includes(r.estado) && <p className="rounded-lg bg-muted p-3 text-sm">{r.motivoCancelacion}</p>}
        </div>
      </Section>

      {(toNumber(r.valor) > 0 || toNumber(r.deposito) > 0) && (
        <Section titulo="Pago">
          <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
            <dl className="space-y-1 tabular-nums">
              <div className="flex justify-between">
                <dt>Alquiler (base)</dt>
                <dd>{cop(r.valor)}</dd>
              </div>
              {toNumber(r.iva) > 0 && (
                <div className="flex justify-between">
                  <dt>IVA</dt>
                  <dd>{cop(r.iva)}</dd>
                </div>
              )}
              {toNumber(r.deposito) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Depósito (reembolsable)</dt>
                  <dd>{cop(r.deposito)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{cop(toNumber(r.valor) + toNumber(r.iva) + toNumber(r.deposito))}</dd>
              </div>
            </dl>
            {r.pagada ? (
              <Badge variant="success">Pagada</Badge>
            ) : pendientes.length && activa ? (
              <div className="space-y-2">
                <p className="text-warning">Pendiente de pago: {cop(porPagar)}</p>
                {propia && (
                  <Button size="lg" className="w-full" render={<Link href={enlacePago(pendientes.map((c) => c.id), r.unidadId, r.id)} />}>
                    <Wallet /> Pagar {cop(porPagar)}
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </Section>
      )}

      {facturas.length > 0 && (
        <Section titulo="Factura electrónica">
          <ul className="space-y-2">
            {facturas.map((f) => (
              <li key={f.id} className="rounded-2xl border bg-card p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-medium">
                    <Receipt className="size-4 text-primary" /> {label(f.tipo)} {f.numero ?? "(en trámite)"}
                  </p>
                  <StatusBadge value={f.estado} />
                </div>
                <p className="mt-1 text-muted-foreground">
                  {cop(f.total)} · IVA {cop(f.iva)}
                  {f.proveedor === "SIMULADO" ? " · simulación sin validez fiscal" : ""}
                </p>
                {f.estado !== "PENDIENTE" && f.estado !== "EN_PROCESO" && f.numero && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" render={<a href={`/api/facturacion/${f.id}/pdf`} />}>
                      <Download /> PDF
                    </Button>
                    <Button variant="outline" size="sm" render={<a href={`/api/facturacion/${f.id}/xml`} />}>
                      <Download /> XML
                    </Button>
                    {can(ctx, "facturacion.ver") && !propia && (
                      <Button variant="ghost" size="sm" render={<Link href={`/facturacion/${f.id}`} />}>
                        Ver en facturación
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(r.actaEntrega || r.actaRecepcion) && (
        <Section titulo="Acta de entrega y recepción" acciones={<a href={`/api/reservas/${r.id}/acta`} className="inline-flex items-center gap-1 text-sm text-primary"><FileText className="size-4" /> PDF</a>}>
          <div className="space-y-3">
            {r.actaEntrega && <ActaCard titulo="Entrega (check-in)" acta={r.actaEntrega as unknown as Acta} />}
            {r.actaRecepcion && <ActaCard titulo="Recepción (check-out)" acta={r.actaRecepcion as unknown as Acta} />}
          </div>
        </Section>
      )}

      {r.estado === "CUMPLIDA" && propia && (
        <Section titulo="Tu calificación">
          {r.calificacion ? (
            <div className="rounded-2xl border bg-card p-4 text-sm">
              <p className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={n <= r.calificacion! ? "size-5 fill-amber-400 text-amber-400" : "size-5 text-muted-foreground"} />
                ))}
              </p>
              {r.comentarioCalificacion && <p className="mt-1 text-muted-foreground">{r.comentarioCalificacion}</p>}
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-4">
              <Calificar id={r.id} />
            </div>
          )}
        </Section>
      )}
      {r.calificacion && !propia && (
        <p className="mb-4 text-sm">
          Calificación del residente: {"★".repeat(r.calificacion)}
          {"☆".repeat(5 - r.calificacion)} {r.comentarioCalificacion ? `— ${r.comentarioCalificacion}` : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {r.estado === "SOLICITADA" && !r.aprobadaPorId && can(ctx, "reservas.aprobar") && (
          <>
            <ActionButton action={aprobarReservaAction} input={{ id: r.id }} successMessage="Reserva aprobada">
              Aprobar
            </ActionButton>
            <RechazarDialog id={r.id} />
          </>
        )}
        {r.estado === "APROBADA" && can(ctx, "reservas.checkin") && esHoy && !r.checkInEn && <ActaDialog id={r.id} tipo="entrega" items={items} zona={r.zona.nombre} />}
        {r.checkInEn && !r.checkOutEn && can(ctx, "reservas.checkin") && <ActaDialog id={r.id} tipo="recepcion" items={items} zona={r.zona.nombre} />}
        {r.estado === "APROBADA" && !r.checkInEn && r.inicio < new Date() && can(ctx, "reservas.checkin") && (
          <ActionButton action={noShowAction} input={{ id: r.id }} variant="outline" confirm="¿Marcar que no se presentó?" successMessage="Marcada como no se presentó">
            No se presentó
          </ActionButton>
        )}
        {puedeCancelar && <CancelarDialog id={r.id} aviso={avisoCancelar} />}
      </div>
    </>
  );
}
