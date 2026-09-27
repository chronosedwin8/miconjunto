import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { cop, fecha, mesNombre, periodoActual } from "@/lib/format";
import { label } from "@/lib/labels";
import { reporteIngresosAlquiler } from "@/lib/facturacion/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { DataList } from "@/components/app/data-list";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Ingresos por alquiler" };

function mover(mes: string, n: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ReporteAlquileresPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requirePage("facturacion.exportar");
  const sp = await searchParams;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : periodoActual();
  const r = await reporteIngresosAlquiler(ctx, mes);
  return (
    <>
      <PageHeader
        titulo="Ingresos por alquiler"
        descripcion="Base gravable e IVA generado por alquiler de zonas comunes, para la declaración del contador."
        acciones={
          <Button variant="outline" render={<a href={`/api/export/ingresos-alquiler?formato=xlsx&mes=${mes}`} />}>
            <Download /> Excel para el contador
          </Button>
        }
      />
      <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border bg-card p-1">
        <Link href={`/facturacion/reporte?mes=${mover(mes, -1)}`} className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Mes anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <p className="font-semibold first-letter:uppercase">{mesNombre(mes)}</p>
        <Link href={`/facturacion/reporte?mes=${mover(mes, 1)}`} className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Mes siguiente">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Base gravable" value={cop(r.totales.base)} tone="primary" />
        <StatCard label="IVA generado" value={cop(r.totales.iva)} tone="warning" />
        <StatCard label="Total" value={cop(r.totales.total)} />
      </div>
      {r.porZona.length > 0 && (
        <Section titulo="Por zona">
          <DataList
            rows={r.porZona}
            rowKey={(z) => z.zona}
            columns={[
              { key: "zona", header: "Zona", primary: true, cell: (z) => z.zona },
              { key: "n", header: "Reservas", align: "right", cell: (z) => z.cantidad },
              { key: "base", header: "Base", align: "right", cell: (z) => cop(z.base) },
              { key: "iva", header: "IVA", align: "right", cell: (z) => cop(z.iva) },
              { key: "total", header: "Total", align: "right", cell: (z) => cop(z.total) },
            ]}
          />
        </Section>
      )}
      <Section titulo="Movimientos">
        <DataList
          rows={r.filas}
          rowKey={(f) => `${f.tipo}-${f.factura}-${f.fecha.toISOString()}-${f.unidad}`}
          empty={<EmptyState titulo="Sin ingresos por alquiler este mes" />}
          columns={[
            { key: "zona", header: "Concepto", primary: true, cell: (f) => `${f.tipo === "NOTA_CREDITO" ? "Nota crédito · " : ""}${f.zona}${f.unidad ? ` · ${f.unidad}` : ""}` },
            { key: "fecha", header: "Fecha", cell: (f) => fecha(f.fecha) },
            { key: "base", header: "Base", align: "right", cell: (f) => cop(f.base) },
            { key: "iva", header: "IVA", align: "right", cell: (f) => cop(f.iva) },
            { key: "factura", header: "Factura", cell: (f) => f.factura || "—" },
            { key: "estado", header: "Estado", hideOnMobile: true, cell: (f) => label(f.estadoFactura) },
          ]}
        />
      </Section>
    </>
  );
}
