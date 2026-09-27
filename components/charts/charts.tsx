"use client";

import { useState } from "react";
import { Table2, ChartColumn } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { cn } from "@/lib/utils";

/**
 * Gráficos del sistema (recharts) con la paleta validada (--series-N, orden fijo),
 * marcas delgadas, un solo eje, tooltip por defecto, leyenda cuando hay ≥ 2 series
 * y vista de tabla (alivio de contraste y accesibilidad).
 */
export type Formato = "cop" | "num" | "pct" | "horas" | "dias";
export type Serie = { key: string; label: string };

const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
export function fmt(v: unknown, f: Formato = "num") {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  if (f === "cop") return copFmt.format(n).replace(/ /g, " ");
  if (f === "pct") return `${numFmt.format(n)} %`;
  if (f === "horas") return `${numFmt.format(n)} h`;
  if (f === "dias") return `${numFmt.format(n)} d`;
  return numFmt.format(n);
}
function compact(n: number, f: Formato) {
  if (f === "pct") return `${Math.round(n)}%`;
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `${(n / 1e9).toFixed(1)} mil M` : abs >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : abs >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(Math.round(n));
  return f === "cop" ? `$${s}` : s;
}

const color = (i: number) => `var(--series-${(i % 8) + 1})`;

function Tip({ active, payload, label, formato }: TooltipContentProps<number, string> & { formato: Formato }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-foreground tabular-nums">{fmt(p.value, formato)}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  titulo,
  descripcion,
  children,
  data,
  xKey,
  series,
  formato = "num",
  className,
  acciones,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
  data: Record<string, unknown>[];
  xKey: string;
  series: Serie[];
  formato?: Formato;
  className?: string;
  acciones?: React.ReactNode;
}) {
  const [tabla, setTabla] = useState(false);
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        <div className="flex items-center gap-1">
          {acciones}
          <button
            type="button"
            onClick={() => setTabla((t) => !t)}
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted"
            aria-label={tabla ? "Ver gráfico" : "Ver tabla"}
            title={tabla ? "Ver gráfico" : "Ver tabla"}
          >
            {tabla ? <ChartColumn className="size-4" /> : <Table2 className="size-4" />}
          </button>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sin datos para el periodo seleccionado.</p>
      ) : tabla ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 font-medium" />
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1.5 pr-2">{String(d[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 text-right tabular-nums">
                      {fmt(d[s.key], formato)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

const axisProps = { stroke: "var(--viz-axis)", fontSize: 11, tickLine: false, axisLine: { stroke: "var(--viz-baseline)" } };

export function Barras({
  titulo,
  descripcion,
  data,
  xKey,
  series,
  formato = "num",
  horizontal = false,
  apilado = false,
  alto = 240,
  className,
}: {
  titulo: string;
  descripcion?: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: Serie[];
  formato?: Formato;
  horizontal?: boolean;
  apilado?: boolean;
  alto?: number;
  className?: string;
}) {
  const h = horizontal ? Math.max(120, data.length * 34 + 48) : alto;
  return (
    <ChartCard titulo={titulo} descripcion={descripcion} data={data} xKey={xKey} series={series} formato={formato} className={className}>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 4, right: 8, bottom: 0, left: horizontal ? 8 : -8 }} barCategoryGap="22%" barGap={2}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" {...axisProps} tickFormatter={(v: number) => compact(v, formato)} allowDecimals={formato !== "num" && formato !== "dias"} />
                <YAxis type="category" dataKey={xKey} {...axisProps} width={96} />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} tickFormatter={(v: number) => compact(v, formato)} allowDecimals={formato !== "num" && formato !== "dias"} width={56} />
              </>
            )}
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} formato={formato} />} />
            {series.length > 1 && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color(i)}
                stackId={apilado ? "a" : undefined}
                radius={apilado && i < series.length - 1 ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={36}
                stroke="var(--card)"
                strokeWidth={apilado ? 1 : 0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function Lineas({
  titulo,
  descripcion,
  data,
  xKey,
  series,
  formato = "num",
  alto = 240,
  className,
}: {
  titulo: string;
  descripcion?: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: Serie[];
  formato?: Formato;
  alto?: number;
  className?: string;
}) {
  return (
    <ChartCard titulo={titulo} descripcion={descripcion} data={data} xKey={xKey} series={series} formato={formato} className={className}>
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} tickFormatter={(v: number) => compact(v, formato)} allowDecimals={formato !== "num" && formato !== "dias"} width={56} />
            <Tooltip cursor={{ stroke: "var(--viz-axis)", strokeDasharray: "3 3" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} formato={formato} />} />
            {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={color(i)} strokeWidth={2} dot={data.length <= 16 ? { r: 3, strokeWidth: 2, fill: "var(--card)" } : false} activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** Barra de progreso de un solo valor (p. ej. quórum, % de mora). */
export function Medidor({ label, valor, meta, formato = "pct", tono = "primary" }: { label: string; valor: number; meta?: number; formato?: Formato; tono?: "primary" | "good" | "critical" }) {
  const pct = Math.max(0, Math.min(100, valor));
  const bg = tono === "good" ? "var(--status-good)" : tono === "critical" ? "var(--status-critical)" : "var(--series-1)";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{fmt(valor, formato)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bg }} />
        {meta !== undefined && <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${meta}%` }} title={`Meta ${meta}%`} />}
      </div>
    </div>
  );
}
