import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, RotateCw } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { facturaVisible, MAX_INTENTOS } from "@/lib/facturacion/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { notaCreditoAction, reenviarCorreoAction, reintentarFacturaAction } from "../actions";

export const metadata = { title: "Factura electrónica" };

function Json({ titulo, valor }: { titulo: string; valor: unknown }) {
  if (valor === null || valor === undefined) return null;
  return (
    <details className="rounded-xl border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">{titulo}</summary>
      <pre className="max-h-96 overflow-auto border-t bg-muted/40 p-3 text-xs">{JSON.stringify(valor, null, 2)}</pre>
    </details>
  );
}

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("facturacion.ver");
  const { id } = await params;
  const f = await facturaVisible(ctx, id);
  if (!f) notFound();
  const [origen, notas] = await Promise.all([
    f.facturaOrigenId ? ctx.db.facturaElectronica.findUnique({ where: { id: f.facturaOrigenId } }) : null,
    ctx.db.facturaElectronica.findMany({ where: { facturaOrigenId: f.id } }),
  ]);
  const errores = (f.errores ?? null) as { mensaje?: string; detalle?: unknown; reintentable?: boolean; advertencias?: unknown } | null;
  const payload = (f.payload ?? {}) as { enviado?: unknown; datos?: unknown };
  return (
    <>
      <PageHeader titulo={`${label(f.tipo)} ${f.numero ?? ""}`.trim()} descripcion={f.descripcion} volver="/facturacion" acciones={<StatusBadge value={f.estado} className="text-sm" />} />
      <Section>
        <dl className="grid gap-3 rounded-2xl border bg-card p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Cliente</dt>
            <dd className="font-medium">{f.clienteNombre}</dd>
            <dd className="text-muted-foreground">
              {f.clienteDocumento}
              {f.clienteEmail ? ` · ${f.clienteEmail}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Valores</dt>
            <dd className="tabular-nums">
              Base {cop(f.subtotal)} · IVA {cop(f.iva)} · <b>Total {cop(f.total)}</b>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Proveedor · referencia</dt>
            <dd>
              {label(f.proveedor)} · {f.referenceCode}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Validada</dt>
            <dd>
              {f.validadaEn ? fechaHora(f.validadaEn) : "—"} · {f.intentos} intento(s)
            </dd>
          </div>
          {f.cufe && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">{f.tipo === "FACTURA" ? "CUFE" : "CUDE"}</dt>
              <dd className="break-all font-mono text-xs">{f.cufe}</dd>
            </div>
          )}
          {origen && (
            <div>
              <dt className="text-xs text-muted-foreground">Factura que afecta</dt>
              <dd>
                <Link className="text-primary" href={`/facturacion/${origen.id}`}>
                  {origen.numero}
                </Link>
              </dd>
            </div>
          )}
          {notas.length > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Notas crédito</dt>
              <dd className="flex flex-wrap gap-2">
                {notas.map((n) => (
                  <Link key={n.id} className="text-primary" href={`/facturacion/${n.id}`}>
                    {n.numero ?? n.referenceCode}
                  </Link>
                ))}
              </dd>
            </div>
          )}
          {f.reservaId && (
            <div>
              <dt className="text-xs text-muted-foreground">Origen</dt>
              <dd>
                <Link className="text-primary" href={`/reservas/detalle/${f.reservaId}`}>
                  Ver reserva
                </Link>
              </dd>
            </div>
          )}
        </dl>
      </Section>

      {errores?.mensaje && f.estado === "ERROR" && (
        <p className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {errores.mensaje}
          {errores.reintentable && f.intentos < MAX_INTENTOS ? " · Se reintentará automáticamente." : ""}
        </p>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {f.numero && ["VALIDADA", "ANULADA"].includes(f.estado) && (
          <>
            <Button variant="outline" render={<a href={`/api/facturacion/${f.id}/pdf`} target="_blank" />}>
              <Download /> PDF
            </Button>
            <Button variant="outline" render={<a href={`/api/facturacion/${f.id}/xml`} />}>
              <Download /> XML
            </Button>
          </>
        )}
        {f.urlPublica && (
          <Button variant="ghost" render={<a href={f.urlPublica} target="_blank" rel="noreferrer" />}>
            <ExternalLink /> Ver en el proveedor
          </Button>
        )}
        {["ERROR", "PENDIENTE"].includes(f.estado) && can(ctx, "facturacion.emitir") && (
          <ActionButton action={reintentarFacturaAction} input={{ id: f.id }} successMessage="Reintento enviado">
            <RotateCw /> Reintentar ahora
          </ActionButton>
        )}
        {["VALIDADA", "ANULADA"].includes(f.estado) && can(ctx, "facturacion.emitir") && (
          <FormDialog titulo="Reenviar por correo" action={reenviarCorreoAction} extra={{ id: f.id }} triggerLabel="Reenviar correo" triggerVariant="outline" submitLabel="Enviar" successMessage="Correo en cola de envío">
            <TextField name="email" type="email" label="Correo" defaultValue={f.clienteEmail ?? ""} hint="Se adjuntan el PDF y el XML" />
          </FormDialog>
        )}
        {f.tipo === "FACTURA" && f.estado === "VALIDADA" && notas.length === 0 && can(ctx, "facturacion.anular") && (
          <FormDialog titulo="Emitir nota crédito" descripcion="Anula la factura ante la DIAN (p. ej., cancelación con reembolso)." action={notaCreditoAction} extra={{ id: f.id }} triggerLabel="Nota crédito" triggerVariant="destructive" submitLabel="Emitir nota crédito" successMessage="Nota crédito emitida" confirm="¿Emitir la nota crédito? Esta acción no se puede deshacer.">
            <TextField name="motivo" label="Motivo" required placeholder="Ej.: cancelación de la reserva con reembolso" />
          </FormDialog>
        )}
      </div>

      <Section titulo="Detalle técnico">
        <div className="space-y-2">
          <Json titulo="Payload enviado al proveedor" valor={payload.enviado} />
          <Json titulo="Respuesta del proveedor" valor={f.respuesta} />
          <Json titulo="Errores / advertencias DIAN" valor={errores?.detalle ?? errores?.advertencias ?? null} />
          <Json titulo="Datos de origen (MiConjunto)" valor={payload.datos} />
        </div>
      </Section>
    </>
  );
}
