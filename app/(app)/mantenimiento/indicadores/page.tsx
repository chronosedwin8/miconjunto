import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { costosPorActivo, cumplimientoPlan, mtbfPorActivo, proveedoresPorDesempeno, resumenMantenimiento } from "@/lib/mantenimiento/stats";
import { cop, mesNombre, nowBogota, num, pct } from "@/lib/format";
import { label } from "@/lib/labels";
import { rangoAnio } from "@/lib/presupuesto/service";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { DataList } from "@/components/app/data-list";
import { Barras } from "../../presupuesto/graficos";

export const metadata = { title: "Indicadores de mantenimiento" };

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("mantenimiento.ver_todos");
  const sp = await searchParams;
  const actual = nowBogota().year;
  const anio = Number(spGet(sp, "anio")) || actual;
  const r = rangoAnio(anio);
  const [cum, costos, mtbf, provs, res] = await Promise.all([cumplimientoPlan(ctx, r), costosPorActivo(ctx, r), mtbfPorActivo(ctx, r), proveedoresPorDesempeno(ctx, r), resumenMantenimiento(ctx, r)]);
  return (
    <>
      <div className="mb-4 flex gap-2">
        {[actual - 1, actual].map((a) => (
          <Link key={a} href={`/mantenimiento/indicadores?anio=${a}`} className={`inline-flex h-9 items-center rounded-full border px-4 text-sm ${a === anio ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
            {a}
          </Link>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cumplimiento del plan" value={pct(cum.pctCumplimiento)} hint={`${cum.completadas} de ${cum.total} programadas`} tone={cum.pctCumplimiento >= 90 ? "success" : cum.pctCumplimiento >= 70 ? "warning" : "danger"} />
        <StatCard label="A tiempo" value={pct(cum.pctATiempo)} hint="Cerradas hasta 3 días después" />
        <StatCard label="Costo de mantenimiento" value={<span className="whitespace-nowrap text-lg sm:text-2xl">{cop(res.costo)}</span>} hint={`${res.completadas} órdenes cerradas`} />
        <StatCard label="Días promedio de cierre" value={res.diasPromedioCierre === null ? "—" : num(res.diasPromedioCierre, 1)} hint={`${res.correctivas} correctivas`} />
      </div>

      <Section titulo="Cumplimiento del plan por mes">
        <div className="rounded-xl border bg-card p-3">
          <Barras
            datos={cum.porMes.map((m) => ({ mes: mesNombre(m.mes).slice(0, 3), Programadas: m.programadas, Completadas: m.completadas }))}
            categoria="mes"
            moneda={false}
            series={[
              { key: "Programadas", nombre: "Programadas", color: "color-mix(in oklab, var(--muted-foreground) 45%, transparent)" },
              { key: "Completadas", nombre: "Completadas", color: "var(--primary)" },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Por tipo: {cum.porTipo.filter((t) => t.total).map((t) => `${label(t.tipo)} ${pct(t.pctCumplimiento)} (${t.completadas}/${t.total})`).join(" · ") || "sin órdenes del plan"}
          </p>
        </div>
      </Section>

      <Section titulo="Costos por activo">
        {costos.length ? (
          <div className="rounded-xl border bg-card p-3">
            <Barras
              horizontal
              datos={costos.slice(0, 10).map((c) => ({ activo: c.nombre, Preventivo: Math.round(c.preventivo), Correctivo: Math.round(c.correctivo) }))}
              categoria="activo"
              series={[
                { key: "Preventivo", nombre: "Preventivo", color: "var(--primary)" },
                { key: "Correctivo", nombre: "Correctivo", color: "color-mix(in oklab, var(--warning) 80%, black)" },
              ]}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin órdenes cerradas con costo en {anio}.</p>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titulo="Activos que más fallan (MTBF aproximado)">
          <DataList
            rows={mtbf.slice(0, 10)}
            rowKey={(m) => m.activoId}
            rowHref={(m) => `/activos/${m.activoId}`}
            empty={<p className="text-sm text-muted-foreground">Sin fallas registradas.</p>}
            columns={[
              { key: "n", header: "Activo", primary: true, cell: (m) => m.nombre },
              { key: "f", header: "Fallas", align: "right", cell: (m) => m.fallas },
              { key: "mtbf", header: "Días entre fallas", align: "right", cell: (m) => (m.mtbfDias === null ? "—" : num(m.mtbfDias, 1)) },
            ]}
          />
        </Section>
        <Section titulo="Proveedores por desempeño">
          <DataList
            rows={provs.slice(0, 10)}
            rowKey={(p) => p.id}
            rowHref={(p) => `/proveedores/${p.id}`}
            empty={<p className="text-sm text-muted-foreground">Sin órdenes de proveedores.</p>}
            columns={[
              { key: "n", header: "Proveedor", primary: true, cell: (p) => p.razonSocial },
              { key: "o", header: "Órdenes", align: "right", cell: (p) => `${p.completadas}/${p.ordenes}` },
              { key: "t", header: "A tiempo", align: "right", cell: (p) => pct(p.pctATiempo) },
              { key: "c", header: "Costo", align: "right", cell: (p) => cop(p.costo) },
              { key: "s", header: "Calificación", align: "right", cell: (p) => (p.calificacion ? `${num(p.calificacion, 1)} ★` : "—") },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
