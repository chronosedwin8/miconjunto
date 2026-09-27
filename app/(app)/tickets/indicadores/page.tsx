import { requirePage } from "@/lib/auth/guard";
import { mesNombre, num, pct } from "@/lib/format";
import { label } from "@/lib/labels";
import { estadisticasTickets, ticketsPorMes } from "@/lib/tickets/stats";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { TabsGestion } from "../tabs";
import { Estrellas } from "../ui";
import { BarrasHorizontales, BarrasMes } from "./graficos";

export const metadata = { title: "Indicadores de PQRS" };

function horas(h: number | null) {
  if (h === null) return "—";
  return h >= 48 ? `${num(h / 24, 1)} días` : `${num(h, 1)} h`;
}

export default async function IndicadoresPage() {
  const ctx = await requirePage("tickets.ver_todos");
  const [s, meses] = await Promise.all([estadisticasTickets(ctx), ticketsPorMes(ctx, 6)]);
  const totalCal = s.calificaciones.reduce((a, c) => a + c.total, 0);
  return (
    <>
      <PageHeader titulo="PQRS y daños" descripcion="Tiempos de respuesta, cumplimiento de plazos y satisfacción de los residentes." />
      <TabsGestion />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tickets radicados" value={s.total} hint={`${s.abiertos} abiertos`} />
        <StatCard label="Resolución promedio" value={horas(s.horasResolucionPromedio)} hint={`Primera respuesta: ${horas(s.horasPrimeraRespuesta)}`} />
        <StatCard label="Resueltos a tiempo" value={s.cumplimientoSla === null ? "—" : pct(s.cumplimientoSla, 0)} tone={s.cumplimientoSla !== null && s.cumplimientoSla < 80 ? "warning" : "success"} hint={`${s.vencidos} abiertos con SLA vencido`} />
        <StatCard label="Satisfacción" value={s.satisfaccionPromedio === null ? "—" : `${num(s.satisfaccionPromedio, 1)} / 5`} hint={`${totalCal} calificaciones · ${s.reabiertos} reabiertos`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section titulo="Tickets por tipo" className="rounded-xl border bg-card p-4">
          <BarrasHorizontales data={s.porTipo.map((t) => ({ nombre: label(t.tipo), valor: t.total }))} />
        </Section>
        <Section titulo="Radicados por mes" className="rounded-xl border bg-card p-4">
          <BarrasMes data={meses.map((m) => ({ mes: mesNombre(m.mes).split(" ")[0].slice(0, 3), radicados: m.radicados }))} />
        </Section>
        <Section titulo="Tickets por estado" className="rounded-xl border bg-card p-4">
          <BarrasHorizontales data={s.porEstado.map((t) => ({ nombre: label(t.estado), valor: t.total }))} />
        </Section>
        <Section titulo="Calificaciones de los residentes" className="rounded-xl border bg-card p-4">
          <ul className="space-y-2">
            {[...s.calificaciones].reverse().map((c) => (
              <li key={c.estrellas} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-sm">
                <Estrellas valor={c.estrellas} />
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${totalCal ? (c.total / totalCal) * 100 : 0}%` }} />
                </div>
                <span className="text-right tabular-nums text-muted-foreground">{c.total}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
