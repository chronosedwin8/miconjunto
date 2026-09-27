import { requirePage } from "@/lib/auth/guard";
import { desempenoProveedores } from "@/lib/proveedores/service";
import { cop, num, pct } from "@/lib/format";
import { DataList } from "@/components/app/data-list";
import { Section } from "@/components/app/page-header";
import { Barras } from "../../presupuesto/graficos";

export const metadata = { title: "Desempeño de proveedores" };

export default async function DesempenoPage() {
  const ctx = await requirePage("proveedores.ver");
  const desde = new Date(Date.now() - 365 * 86_400_000);
  const rows = await desempenoProveedores(ctx, desde);
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Últimos 12 meses: órdenes asignadas y cerradas a tiempo (hasta 3 días después de lo programado), costo y calificación de los residentes.</p>
      {rows.length > 0 && (
        <Section titulo="Órdenes cerradas a tiempo">
          <div className="rounded-xl border bg-card p-3">
            <Barras horizontal moneda={false} sufijo=" %" categoria="proveedor" datos={rows.filter((r) => r.ordenes).map((r) => ({ proveedor: r.razonSocial, "A tiempo": r.pctATiempo }))} series={[{ key: "A tiempo", nombre: "% a tiempo", color: "var(--primary)" }]} />
          </div>
        </Section>
      )}
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/proveedores/${r.id}`}
        columns={[
          { key: "n", header: "Proveedor", primary: true, cell: (r) => r.razonSocial },
          { key: "c", header: "Categoría", cell: (r) => r.categoria },
          { key: "o", header: "Órdenes cerradas", align: "right", cell: (r) => `${r.completadas}/${r.ordenes}` },
          { key: "t", header: "A tiempo", align: "right", cell: (r) => pct(r.pctATiempo) },
          { key: "costo", header: "Costo", align: "right", cell: (r) => cop(r.costo) },
          { key: "cal", header: "Calificación", align: "right", cell: (r) => (r.calificacion ? `${num(r.calificacion, 1)} ★` : "—") },
        ]}
      />
    </>
  );
}
