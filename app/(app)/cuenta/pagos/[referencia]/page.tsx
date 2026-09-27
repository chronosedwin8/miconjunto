import Link from "next/link";
import { FileDown } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { consultarPago } from "@/lib/pagos/service";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EstadoPagoPoller, ResultadoPago } from "@/components/pagos/estado-pago";

export const metadata = { title: "Estado del pago" };
export const dynamic = "force-dynamic";

/** Página de retorno de la pasarela: consulta el estado real (webhook / API de la pasarela) y hace polling mientras está PENDIENTE. */
export default async function EstadoPagoPage({ params }: { params: Promise<{ referencia: string }> }) {
  const ctx = await requireCtx();
  const { referencia } = await params;
  const p = await consultarPago(ctx, decodeURIComponent(referencia), { sincronizar: true });
  const pendiente = p.estado === "PENDIENTE";
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader titulo="Estado del pago" volver={`/cuenta?unidad=${p.unidadId}`} />
      <EstadoPagoPoller pendiente={pendiente} />
      <ResultadoPago estado={p.estado} valor={p.valor} unidad={p.unidad} referencia={p.referencia} recibo={p.numeroRecibo} />
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Unidad</dt>
          <dd className="font-medium">{p.unidad}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fecha</dt>
          <dd className="font-medium">{fechaHora(p.fecha)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Medio</dt>
          <dd className="font-medium">{label(p.medio)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pasarela</dt>
          <dd className="font-medium">{label(p.pasarela)}</dd>
        </div>
        {p.referenciaExterna && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Transacción</dt>
            <dd className="break-all font-mono text-xs">{p.referenciaExterna}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 grid gap-2">
        {p.estado === "APROBADO" && p.numeroRecibo && (
          <Button size="lg" className="h-12" render={<a href={`/cuenta/pagos/${p.referencia}/recibo`} />}>
            <FileDown /> Descargar recibo
          </Button>
        )}
        {pendiente && p.checkoutUrl && (
          <Button size="lg" variant="outline" className="h-12" render={<a href={p.checkoutUrl} />}>
            Volver a la pasarela
          </Button>
        )}
        {(p.estado === "RECHAZADO" || p.estado === "ANULADO") && (
          <Button size="lg" className="h-12" render={<Link href={`/cuenta/pagar?unidad=${p.unidadId}`} />}>
            Intentar de nuevo
          </Button>
        )}
        <Button size="lg" variant={p.estado === "APROBADO" ? "outline" : "ghost"} className="h-12" render={<Link href={`/cuenta?unidad=${p.unidadId}`} />}>
          Ver mi cuenta
        </Button>
      </div>
    </div>
  );
}
