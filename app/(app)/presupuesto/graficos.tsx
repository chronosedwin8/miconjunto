"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Serie de barras: `key` en los datos, nombre visible y color (token CSS). */
export type SerieBarra = { key: string; nombre: string; color: string };

const compacto = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("es-CO", { maximumFractionDigits: 1 })} mil M`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${(v / 1e3).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("es-CO");
};
const pesos = (v: number) => `$ ${Math.round(v).toLocaleString("es-CO")}`;

/**
 * Barras agrupadas (una sola escala) con tooltip, leyenda y marcas delgadas.
 * `horizontal` para nombres largos (rubros, activos) en el teléfono.
 */
export function Barras({
  datos,
  categoria,
  series,
  horizontal = false,
  moneda = true,
  alto,
  sufijo = "",
}: {
  datos: Record<string, string | number>[];
  categoria: string;
  series: SerieBarra[];
  horizontal?: boolean;
  moneda?: boolean;
  alto?: number;
  sufijo?: string;
}) {
  const fmt = (v: number) => (moneda ? pesos(v) : `${v.toLocaleString("es-CO")}${sufijo}`);
  const eje = (v: number) => (moneda ? compacto(v) : `${v}${sufijo}`);
  const h = alto ?? (horizontal ? Math.max(180, datos.length * (series.length > 1 ? 40 : 30) + 60) : 260);
  return (
    <div style={{ height: h }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, left: horizontal ? 4 : 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tickFormatter={eje} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis type="category" dataKey={categoria} width={110} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
            </>
          ) : (
            <>
              <XAxis dataKey={categoria} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickFormatter={eje} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={11} width={52} />
            </>
          )}
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            formatter={(v) => fmt(Number(v))}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
          />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.nombre} fill={s.color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
