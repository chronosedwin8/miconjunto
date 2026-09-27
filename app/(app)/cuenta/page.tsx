import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, FileDown, Loader, Receipt, Wallet } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { cuentasAccesibles } from "@/lib/pagos/acceso";
import { estadoCuentaResidente } from "@/lib/pagos/cuenta";
import { cop, fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { PazYSalvoCard } from "./paz-y-salvo";

export const metadata = { title: "Mi cuenta y pagos" };

export default async function CuentaPage({ searchParams }: { searchParams: Promise<{ unidad?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const cuentas = await cuentasAccesibles(ctx);
  if (!cuentas.length) {
    return (
      <>
        <PageHeader titulo="Mi cuenta y pagos" />
        <EmptyState
          icon={Wallet}
          titulo="No tienes cuentas para consultar"
          descripcion="El estado de cuenta lo ve el propietario de la unidad. Si eres arrendatario, pídele al propietario que te autorice a ver y pagar la cuenta."
          accion={can(ctx, "cartera.ver_todos") ? <Button render={<Link href="/cartera" />}>Ir a cartera</Button> : undefined}
        />
      </>
    );
  }
  const actual = cuentas.find((c) => c.unidadId === sp.unidad) ?? cuentas[0];
  const e = await estadoCuentaResidente(ctx, actual.unidadId);
  const alDia = e.saldo.vencido - e.saldo.saldoAFavor <= 0;
  const pagarHref = `/cuenta/pagar?unidad=${e.unidad.id}`;

  return (
    <>
      <PageHeader titulo="Mi cuenta y pagos" descripcion={ctx.conjunto.nombre} />

      {cuentas.length > 1 && (
        <nav aria-label="Unidades" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:px-0">
          {cuentas.map((c) => (
            <Link
              key={c.unidadId}
              href={`/cuenta?unidad=${c.unidadId}`}
              aria-current={c.unidadId === actual.unidadId ? "page" : undefined}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
                c.unidadId === actual.unidadId ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
              )}
            >
              {c.codigo}
              {c.relacion === "AUTORIZADO" && <span className="ml-1 text-xs opacity-80">(autorizado)</span>}
            </Link>
          ))}
        </nav>
      )}

      {/* Saldo y botón Pagar */}
      <section className={cn("mb-6 rounded-2xl border p-5", alDia ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Saldo de {e.unidad.codigo}</p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{cop(e.saldo.neto > 0 ? e.saldo.neto : 0)}</p>
          </div>
          <StatusBadge value={alDia ? "AL_DIA" : "MORA"} text={alDia ? "Al día" : "En mora"} />
        </div>
        <div className="mt-2 space-y-1 text-sm">
          {e.saldo.vencido > 0 && (
            <p className="text-destructive">
              Vencido: <b>{cop(e.saldo.vencido)}</b> · {e.saldo.diasMoraMax} días de mora
            </p>
          )}
          {e.saldo.saldoAFavor > 0 && <p className="text-success">Saldo a favor: {cop(e.saldo.saldoAFavor)}</p>}
          {e.proximoProntoPago && (
            <p className="font-medium text-success">
              Paga antes del {fecha(e.proximoProntoPago.fechaProntoPago)} y ahorra {cop(e.descuentoTotal)} por pronto pago.
            </p>
          )}
        </div>
        {e.pagoEnProceso && (
          <Link
            href={`/cuenta/pagos/${e.pagoEnProceso.referencia}`}
            className="mt-3 flex min-h-11 items-center gap-2 rounded-lg bg-warning/15 px-3 text-sm font-medium text-warning"
          >
            <Loader className="size-4" /> Tienes un pago de {cop(e.pagoEnProceso.valor)} en proceso <ChevronRight className="ml-auto size-4" />
          </Link>
        )}
        {actual.puedePagar && e.saldo.total > 0 ? (
          <Button size="lg" className="mt-4 h-14 w-full text-lg font-semibold" render={<Link href={pagarHref} />}>
            <Wallet className="size-5" /> Pagar {cop(e.totalHoy)}
          </Button>
        ) : e.saldo.total <= 0 ? (
          <p className="mt-4 text-sm font-medium text-success">¡Estás al día! No tienes cuotas pendientes.</p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <Section
            titulo="Cuotas pendientes"
            acciones={
              e.cuotas.length > 1 && actual.puedePagar ? (
                <Link href={pagarHref} className="text-sm font-medium text-primary">
                  Elegir cuáles pagar
                </Link>
              ) : undefined
            }
          >
            {e.cuotas.length === 0 ? (
              <EmptyState icon={CalendarClock} titulo="Sin cuotas pendientes" descripcion="Cuando se genere tu próxima cuota aparecerá aquí." />
            ) : (
              <ul className="divide-y rounded-xl border bg-card">
                {e.cuotas.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cuenta/pagar?unidad=${e.unidad.id}&cuotas=${c.id}`} className="flex min-h-16 items-center gap-3 p-3 active:bg-muted/60">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          Vence {fecha(c.fechaVencimiento)}
                          {c.diasMora > 0 && <span className="text-destructive"> · {c.diasMora} días vencida</span>}
                        </p>
                        {c.descuento > 0 && (
                          <p className="text-xs font-medium text-success">
                            Pronto pago hasta {fecha(c.fechaProntoPago)}: pagas {cop(c.valorHoy)} (ahorras {cop(c.descuento)})
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{cop(c.valorHoy)}</p>
                        {c.descuento > 0 && <p className="text-xs text-muted-foreground line-through">{cop(c.saldo)}</p>}
                        {c.estado === "PARCIAL" && <p className="text-xs text-warning">Abonada</p>}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section titulo="Documentos">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" className="h-12 justify-start" render={<a href={`/cuenta/estado-cuenta?unidad=${e.unidad.id}`} />}>
                <FileDown /> Estado de cuenta (PDF)
              </Button>
              <PazYSalvoCard
                unidadId={e.unidad.id}
                certificados={e.certificados.map((c) => ({ ...c, fecha: c.fecha.toISOString(), vigenteHasta: c.vigenteHasta.toISOString() }))}
                puedePagar={actual.puedePagar}
              />
            </div>
          </Section>
        </div>

        <div className="min-w-0">
          <Section titulo="Historial de pagos">
            {e.pagos.length === 0 ? (
              <EmptyState icon={Receipt} titulo="Aún no hay pagos" descripcion="Tus pagos en línea y los registrados por la administración aparecerán aquí." />
            ) : (
              <ul className="divide-y rounded-xl border bg-card">
                {e.pagos.map((p) => (
                  <li key={p.id} className="flex min-h-16 items-center gap-3 p-3">
                    <Link href={`/cuenta/pagos/${p.referencia}`} className="min-w-0 flex-1">
                      <p className="font-medium tabular-nums">{cop(p.valor)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fecha(p.fecha)} · {label(p.medio)}
                        {p.numeroRecibo ? ` · Recibo N.º ${p.numeroRecibo}` : ""}
                      </p>
                    </Link>
                    <StatusBadge value={p.estado} />
                    {p.estado === "APROBADO" && p.numeroRecibo ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Descargar recibo ${p.numeroRecibo}`}
                        render={<a href={`/cuenta/pagos/${p.referencia}/recibo`} />}
                      >
                        <FileDown />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section titulo="Movimientos">
            {e.movimientos.length === 0 ? (
              <p className="rounded-xl border p-4 text-sm text-muted-foreground">Sin movimientos registrados.</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-card text-sm">
                {e.movimientos.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 p-3">
                    {m.tipo === "DEBITO" ? (
                      <ArrowUpRight className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <ArrowDownLeft className="size-4 shrink-0 text-success" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{m.descripcion}</p>
                      <p className="text-xs text-muted-foreground">{fecha(m.fecha)}</p>
                    </div>
                    <span className={cn("font-medium tabular-nums", m.tipo === "CREDITO" && "text-success")}>
                      {m.tipo === "CREDITO" ? "−" : ""}
                      {cop(m.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
