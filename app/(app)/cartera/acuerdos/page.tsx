import { requirePage } from "@/lib/auth/guard";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { cop, fecha, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";
import { insensitive } from "@/lib/pagination";

export const metadata = { title: "Acuerdos de pago" };

export default async function AcuerdosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("cartera.ver_todos");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const q = spGet(sp, "q");
  const estado = spGet(sp, "estado");
  const where = { ...(estado ? { estado: estado as never } : {}), ...(q ? { unidad: { codigo: insensitive(q) } } : {}) };
  const [rows, total, porEstado] = await Promise.all([
    ctx.db.acuerdoPago.findMany({ where, include: { unidad: { select: { codigo: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    ctx.db.acuerdoPago.count({ where }),
    ctx.db.acuerdoPago.groupBy({ by: ["estado"], _count: { _all: true }, _sum: { saldoInicial: true } }),
  ]);
  const pendientes = rows.length ? await ctx.db.cuota.groupBy({ by: ["acuerdoId"], where: { acuerdoId: { in: rows.map((r) => r.id) }, estado: { notIn: ["EN_ACUERDO", "ANULADA"] } }, _sum: { saldo: true } }) : [];
  const pend = new Map(pendientes.map((p) => [p.acuerdoId, toNumber(p._sum.saldo)]));
  const e = (k: string) => porEstado.find((x) => x.estado === k);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vigentes" value={e("VIGENTE")?._count._all ?? 0} hint={cop(e("VIGENTE")?._sum.saldoInicial)} tone="primary" />
        <StatCard label="Cumplidos" value={e("CUMPLIDO")?._count._all ?? 0} tone="success" />
        <StatCard label="Incumplidos" value={e("INCUMPLIDO")?._count._all ?? 0} tone={e("INCUMPLIDO") ? "danger" : "default"} />
        <StatCard label="Anulados" value={e("ANULADO")?._count._all ?? 0} />
      </div>
      <p className="mb-3 text-sm text-muted-foreground">Para crear un acuerdo, abre el estado de cuenta de la unidad en mora y toca «Acuerdo de pago».</p>
      <ListToolbar placeholder="Buscar unidad…" filters={[{ name: "estado", label: "Estado", options: ["VIGENTE", "CUMPLIDO", "INCUMPLIDO", "ANULADO"].map((v) => ({ value: v, label: label(v) })) }]} />
      <DataList
        rows={rows}
        rowKey={(a) => a.id}
        rowHref={(a) => `/cartera/acuerdos/${a.id}`}
        empty={<EmptyState titulo="No hay acuerdos de pago" />}
        columns={[
          { key: "u", header: "Unidad", primary: true, cell: (a) => a.unidad.codigo },
          { key: "s", header: "Saldo acordado", align: "right", cell: (a) => cop(a.saldoInicial) },
          { key: "n", header: "Plan", cell: (a) => `${a.numeroCuotas} × ${cop(a.valorCuota)} (día ${a.diaPago})` },
          { key: "p", header: "Pendiente", align: "right", cell: (a) => cop(pend.get(a.id) ?? 0) },
          { key: "f", header: "Fecha", hideOnMobile: true, cell: (a) => fecha(a.fechaInicio) },
          { key: "e", header: "Estado", cell: (a) => <StatusBadge value={a.estado} /> },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/cartera/acuerdos" />
    </>
  );
}
