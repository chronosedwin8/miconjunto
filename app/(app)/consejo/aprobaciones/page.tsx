import Link from "next/link";
import { CalendarCheck, ChevronRight, PiggyBank, Scale } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { aprobacionesPendientes, type Pendiente } from "@/lib/consejo/service";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { cop, fecha } from "@/lib/format";

export const metadata = { title: "Aprobaciones pendientes" };

function Lista({ items, vacio, href }: { items: Pendiente[]; vacio: string; href: string }) {
  if (!items.length) return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={p.href} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.titulo}</p>
              <p className="truncate text-xs text-muted-foreground">
                {fecha(p.fecha)} · {p.detalle}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge value={p.estado} />
                {p.valor ? <span className="text-sm font-semibold tabular-nums">{cop(p.valor)}</span> : null}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
      <li>
        <Link href={href} className="text-sm text-primary underline">
          Ir al módulo para decidir
        </Link>
      </li>
    </ul>
  );
}

/** Panel de solo lectura: cada módulo implementa la acción de aprobar/decidir. */
export default async function AprobacionesPage() {
  const ctx = await requirePage("consejo.ver");
  const p = await aprobacionesPendientes(ctx);
  return (
    <>
      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Multas" value={p.multas.length} icon={Scale} tone={p.multas.length ? "warning" : "default"} href="/convivencia" />
        <StatCard label="Reservas" value={p.reservas.length} icon={CalendarCheck} tone={p.reservas.length ? "warning" : "default"} href="/reservas/admin" />
        <StatCard label="Gastos" value={p.gastos.length} icon={PiggyBank} tone={p.gastos.length ? "warning" : "default"} href="/presupuesto" />
      </div>
      <Section titulo="Multas en debido proceso (notificadas o en descargos)">
        <Lista items={p.multas} vacio="No hay multas por decidir." href="/convivencia" />
      </Section>
      <Section titulo="Reservas por aprobar">
        <Lista items={p.reservas} vacio="No hay reservas pendientes." href="/reservas/admin" />
      </Section>
      <Section titulo="Gastos por aprobar">
        <Lista items={p.gastos} vacio="No hay gastos pendientes de aprobación." href="/presupuesto" />
      </Section>
    </>
  );
}
