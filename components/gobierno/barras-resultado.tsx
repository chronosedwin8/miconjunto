"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Barra = { nombre: string; valor: number; detalle?: string };

/**
 * Barras horizontales de resultados (una sola serie: un solo tono de marca). El valor se rotula
 * al final de cada barra y el detalle aparece al pasar el dedo o el cursor.
 */
export function BarrasResultado({ datos, sufijo = " %", max, alto }: { datos: Barra[]; sufijo?: string; max?: number; alto?: number }) {
  const h = alto ?? Math.max(120, datos.length * 52 + 24);
  const fmt = (v: number) => `${v.toLocaleString("es-CO", { maximumFractionDigits: 2 })}${sufijo}`;
  return (
    <div style={{ height: h }} className="w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis type="number" domain={[0, max ?? "auto"]} hide />
          <YAxis
            type="category"
            dataKey="nombre"
            width={110}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
            formatter={(v, _n, item) => [fmt(Number(v)), (item?.payload as Barra | undefined)?.detalle ?? ""]}
            labelStyle={{ fontWeight: 600 }}
          />
          <Bar dataKey="valor" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
            <LabelList dataKey="valor" position="right" formatter={(v) => fmt(Number(v))} style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
