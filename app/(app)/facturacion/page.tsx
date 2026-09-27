import type { Prisma } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Clock, Receipt } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { cop, fecha, periodoActual, toNumber } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { whereFacturasVisibles } from "@/lib/facturacion/service";
import { PageHeader } from "@/components/app/page-header";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Facturación electrónica" };

export default async function FacturacionPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("facturacion.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const vis = await whereFacturasVisibles(ctx);
  const q = spGet(sp, "q");
  const where: Prisma.FacturaElectronicaWhereInput = {
    ...vis,
    ...(spGet(sp, "estado") ? { estado: spGet(sp, "estado") as never } : {}),
    ...(spGet(sp, "tipo") ? { tipo: spGet(sp, "tipo") as never } : {}),
    ...(q ? { OR: [{ numero: insensitive(q) }, { clienteNombre: insensitive(q) }, { clienteDocumento: insensitive(q) }, { referenceCode: insensitive(q) }] } : {}),
  };
  const mesIni = new Date(`${periodoActual()}-01T00:00:00-05:00`);
  const [rows, total, porEstado, mes] = await Promise.all([
    ctx.db.facturaElectronica.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    ctx.db.facturaElectronica.count({ where }),
    ctx.db.facturaElectronica.groupBy({ by: ["estado"], where: vis, _count: true }),
    ctx.db.facturaElectronica.aggregate({ where: { ...vis, tipo: "FACTURA", estado: { in: ["VALIDADA", "ANULADA"] }, validadaEn: { gte: mesIni } }, _sum: { subtotal: true, iva: true, total: true }, _count: true }),
  ]);
  const cuenta = (e: string) => porEstado.find((x) => x.estado === e)?._count ?? 0;
  const proveedor = conjuntoConfig(ctx).facturacion.proveedor;
  return (
    <>
      <PageHeader titulo="Facturación electrónica" descripcion="Solo alquileres gravados de zonas comunes y parqueaderos de visitantes. Las cuotas de administración y las multas no se facturan." />
      {proveedor === "SIMULADO" && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Modo simulación: los documentos no tienen validez fiscal. Configura Factus o Alanube en Configuración → Integraciones y en Parámetros → Facturación.
        </p>
      )}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Validadas" value={cuenta("VALIDADA")} tone="success" icon={CheckCircle2} href="/facturacion?estado=VALIDADA" />
        <StatCard label="Pendientes" value={cuenta("PENDIENTE") + cuenta("EN_PROCESO")} tone={cuenta("PENDIENTE") ? "warning" : "default"} icon={Clock} href="/facturacion?estado=PENDIENTE" />
        <StatCard label="Con error" value={cuenta("ERROR")} tone={cuenta("ERROR") ? "danger" : "default"} icon={AlertTriangle} href="/facturacion?estado=ERROR" />
        <StatCard label="IVA generado este mes" value={cop(mes._sum.iva)} hint={`${mes._count} facturas · base ${cop(mes._sum.subtotal)}`} icon={Receipt} href="/facturacion/reporte" />
      </div>
      <ListToolbar
        placeholder="Número, cliente o documento…"
        exportRecurso="facturas"
        filters={[
          { name: "estado", label: "Estado", options: options(["PENDIENTE", "EN_PROCESO", "VALIDADA", "ERROR", "ANULADA"]) },
          { name: "tipo", label: "Tipo", options: options(["FACTURA", "NOTA_CREDITO"]) },
        ]}
      />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/facturacion/${r.id}`}
        empty={<EmptyState titulo="Aún no hay facturas" descripcion="Se generan solas cuando se paga el alquiler de una zona que factura electrónicamente." />}
        columns={[
          { key: "numero", header: "Número", primary: true, cell: (r) => <span className="flex items-center gap-2">{r.numero ?? r.referenceCode}{r.tipo === "NOTA_CREDITO" && <Badge variant="outline">Nota crédito</Badge>}</span> },
          { key: "cliente", header: "Cliente", cell: (r) => r.clienteNombre },
          { key: "fecha", header: "Fecha", cell: (r) => fecha(r.validadaEn ?? r.createdAt) },
          { key: "total", header: "Total", align: "right", cell: (r) => `${r.tipo === "NOTA_CREDITO" ? "−" : ""}${cop(toNumber(r.total))}` },
          { key: "iva", header: "IVA", align: "right", hideOnMobile: true, cell: (r) => cop(r.iva) },
          { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
          { key: "proveedor", header: "Proveedor", hideOnMobile: true, cell: (r) => label(r.proveedor) },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/facturacion" />
    </>
  );
}
