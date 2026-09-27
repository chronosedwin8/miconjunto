import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { cop, fecha } from "@/lib/format";
import { options } from "@/lib/labels";
import { esGestor, whereMultas } from "@/lib/convivencia/service";
import { ESTADOS_MULTA } from "@/lib/convivencia/debido-proceso";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";
import { ProponerMulta } from "../formularios";

export const metadata = { title: "Multas de convivencia" };

export default async function MultasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  if (!esGestor(ctx)) redirect("/convivencia");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const q = spGet(sp, "q");
  const ahora = new Date();
  const where = {
    AND: [whereMultas(ctx), spGet(sp, "estado") ? { estado: spGet(sp, "estado") as never } : {}, q ? { OR: [{ descripcion: insensitive(q) }, { unidad: { codigo: insensitive(q) } }] } : {}],
  };
  const [rows, total, propuestas, enDescargos, vencidas, ratificadas] = await Promise.all([
    ctx.db.multa.findMany({ where, include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" }, skip, take }),
    ctx.db.multa.count({ where }),
    ctx.db.multa.count({ where: { estado: "PROPUESTA" } }),
    ctx.db.multa.count({ where: { estado: "EN_DESCARGOS" } }),
    ctx.db.multa.count({ where: { estado: "NOTIFICADA", plazoDescargos: { lt: ahora } } }),
    ctx.db.multa.aggregate({ where: { estado: "RATIFICADA" }, _sum: { valor: true }, _count: { _all: true } }),
  ]);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Por notificar" value={propuestas} href="/convivencia/multas?estado=PROPUESTA" />
        <StatCard label="Para decisión del consejo" value={enDescargos + vencidas} tone={enDescargos + vencidas ? "warning" : "default"} href="/convivencia/multas?estado=EN_DESCARGOS" />
        <StatCard label="Ratificadas por pagar" value={ratificadas._count._all} href="/convivencia/multas?estado=RATIFICADA" />
        <StatCard label="Valor por recaudar" value={cop(ratificadas._sum.valor)} />
      </div>
      <ListToolbar placeholder="Buscar por descripción o unidad…" exportRecurso="multas" filters={[{ name: "estado", label: "Estado", options: options(ESTADOS_MULTA) }]}>
        {can(ctx, "convivencia.crear") && (
          <div className="ml-auto shrink-0">
            <ProponerMulta ctx={ctx} />
          </div>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/convivencia/multas/${r.id}`}
        empty={<EmptyState titulo="No hay multas" descripcion="Las multas se proponen desde un llamado de atención o directamente aquí." />}
        columns={[
          { key: "d", header: "Descripción", primary: true, cell: (r) => <span className="line-clamp-2">{r.descripcion}</span> },
          { key: "u", header: "Unidad", cell: (r) => r.unidad.codigo },
          { key: "v", header: "Valor", align: "right", cell: (r) => cop(r.valor) },
          { key: "f", header: "Fecha", cell: (r) => fecha(r.fecha) },
          {
            key: "p",
            header: "Plazo descargos",
            hideOnMobile: true,
            cell: (r) => (r.plazoDescargos ? <span className={r.estado === "NOTIFICADA" && r.plazoDescargos < ahora ? "text-warning" : ""}>{fecha(r.plazoDescargos)}</span> : "—"),
          },
          { key: "e", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/convivencia/multas" />
    </>
  );
}
