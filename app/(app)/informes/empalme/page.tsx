import { requirePage } from "@/lib/auth/guard";
import { informeEmpalme } from "@/lib/informes/service";
import { spGet, type SP } from "@/lib/pagination";
import { cop, fecha, parseLocal } from "@/lib/format";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Informe de empalme" };

export default async function EmpalmePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("informes.empalme");
  const sp = await searchParams;
  const hasta = spGet(sp, "hasta") ? parseLocal(spGet(sp, "hasta")!) : new Date();
  const desde = spGet(sp, "desde") ? parseLocal(spGet(sp, "desde")!) : new Date(hasta.getTime() - 365 * 86400000);
  const r = await informeEmpalme(ctx, desde, new Date(hasta.getTime() + 86399000));
  const qs = `desde=${spGet(sp, "desde") ?? ""}&hasta=${spGet(sp, "hasta") ?? ""}`;
  return (
    <>
      <PageHeader
        titulo="Informe de gestión y empalme"
        descripcion={`${ctx.conjunto.nombre} · ${fecha(desde)} a ${fecha(hasta)}`}
        volver="/informes"
        acciones={
          <Button variant="outline" render={<a href={`/api/informes/empalme?${qs}`} />}>
            Descargar PDF
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Unidades" value={r.estructura.unidades} hint={`${r.estructura.personas} personas registradas`} />
        <StatCard label="Recaudo del periodo" value={cop(r.recaudo.total)} hint={`${r.recaudo.pagos} pagos`} tone="success" />
        <StatCard label="Cartera pendiente" value={cop(r.cartera.saldoPendiente)} hint={`${r.cartera.cuotasPendientes} cuotas`} tone="warning" />
        <StatCard label="Gastos ejecutados" value={cop(r.gastos.total)} hint={`${r.gastos.registros} gastos`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section titulo="Top morosos">
          <Tabla filas={r.cartera.topMorosos.map((m) => [m.unidad, cop(m.saldo)])} cab={["Unidad", "Saldo vencido"]} />
        </Section>
        <Section titulo="PQRS abiertas">
          <Tabla filas={r.pqrs.abiertos.map((t) => [t.radicado, t.titulo, t.estado, fecha(t.vence)])} cab={["Radicado", "Asunto", "Estado", "Vence"]} />
        </Section>
        <Section titulo="Contratos vigentes">
          <Tabla filas={r.contratos.map((c) => [c.proveedor, c.objeto, cop(c.valor), fecha(c.fin)])} cab={["Proveedor", "Objeto", "Valor", "Fin"]} />
        </Section>
        <Section titulo="Pólizas">
          <Tabla filas={r.polizas.map((p) => [p.titulo, fecha(p.vence)])} cab={["Póliza", "Vence"]} />
        </Section>
        <Section titulo="Mantenimiento (órdenes)">
          <Tabla filas={r.mantenimiento.map((m) => [m.estado, String(m.total), cop(m.costo)])} cab={["Estado", "Órdenes", "Costo"]} />
        </Section>
        <Section titulo="Asambleas">
          <Tabla filas={r.asambleas.map((a) => [a.titulo, fecha(a.fecha), a.estado, a.acta ?? "—"])} cab={["Asamblea", "Fecha", "Estado", "Acta"]} />
        </Section>
        <Section titulo="Convivencia (multas)">
          <Tabla filas={r.convivencia.map((m) => [m.estado, String(m.total), cop(m.valor)])} cab={["Estado", "Cantidad", "Valor"]} />
        </Section>
        <Section titulo="Operación del periodo">
          <Tabla filas={[["Reservas", String(r.operacion.reservas)], ["Paquetes recibidos", String(r.operacion.paquetes)], ["Novedades de portería", String(r.operacion.novedades)], ...r.pqrs.porEstado.map((p) => [`PQRS ${p.estado.toLowerCase()}`, String(p.total)])]} cab={["Indicador", "Total"]} />
        </Section>
      </div>
    </>
  );
}

function Tabla({ cab, filas }: { cab: string[]; filas: string[][] }) {
  if (!filas.length) return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Sin datos en el periodo.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs">
          <tr>{cab.map((c) => <th key={c} className="p-2">{c}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t">
              {f.map((c, j) => <td key={j} className="p-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
