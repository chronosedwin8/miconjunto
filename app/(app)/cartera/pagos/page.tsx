import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, type SP } from "@/lib/pagination";
import { cop, fechaHora, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { torreOptions, unidadOptions } from "@/lib/conjunto/options";
import { filtroPagos } from "@/lib/cartera/filtros";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { AnularPagoDialog, MEDIO_OPTIONS, RegistrarPagoDialog } from "../componentes";

export const metadata = { title: "Pagos" };

export default async function PagosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("pagos.ver_todos");
  const sp = await searchParams;
  const flat = spFlat(sp);
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const where = filtroPagos(flat);
  const [rows, total, suma, torres, unidades] = await Promise.all([
    ctx.db.pago.findMany({ where, include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" }, skip, take }),
    ctx.db.pago.count({ where }),
    ctx.db.pago.aggregate({ where: { ...where, estado: "APROBADO" }, _sum: { valor: true } }),
    torreOptions(ctx),
    can(ctx, "pagos.registrar") ? unidadOptions(ctx) : Promise.resolve([]),
  ]);
  const puedeAnular = can(ctx, "pagos.anular");
  return (
    <>
      <ListToolbar
        placeholder="Buscar unidad, recibo o referencia…"
        exportRecurso="cartera-pagos"
        filters={[
          { name: "estado", label: "Estado", options: ["APROBADO", "PENDIENTE", "RECHAZADO", "ANULADO"].map((v) => ({ value: v, label: label(v) })) },
          { name: "medio", label: "Medio", options: [...MEDIO_OPTIONS, { value: "PASARELA", label: "Pasarela" }] },
          { name: "conciliado", label: "Conciliado", options: [{ value: "si", label: "Sí" }, { value: "no", label: "No" }] },
          { name: "torre", label: "Torre", options: [...torres, { value: "casas", label: "Casas" }] },
        ]}
      >
        {can(ctx, "pagos.registrar") && (
          <span className="ml-auto shrink-0">
            <RegistrarPagoDialog unidades={unidades} />
          </span>
        )}
      </ListToolbar>
      <p className="mb-3 text-sm text-muted-foreground">
        {total} pago(s) · aprobados por <b className="text-foreground">{cop(suma._sum.valor)}</b>
      </p>
      <DataList
        rows={rows}
        rowKey={(p) => p.id}
        empty={<EmptyState titulo="No hay pagos con estos filtros" />}
        columns={[
          { key: "r", header: "Recibo", primary: true, cell: (p) => (p.numeroRecibo ? `N.º ${p.numeroRecibo}` : <span className="text-muted-foreground">Sin recibo</span>) },
          { key: "u", header: "Unidad", cell: (p) => <Link href={`/cartera/unidades/${p.unidadId}`} className="text-primary">{p.unidad.codigo}</Link> },
          { key: "f", header: "Fecha", cell: (p) => fechaHora(p.fecha) },
          { key: "v", header: "Valor", align: "right", cell: (p) => <b>{cop(p.valor)}</b> },
          { key: "m", header: "Medio", cell: (p) => `${label(p.medio)}${p.pasarela !== "NINGUNA" ? ` · ${label(p.pasarela)}` : ""}` },
          { key: "e", header: "Estado", cell: (p) => <StatusBadge value={p.estado} /> },
          { key: "c", header: "Conciliado", hideOnMobile: true, cell: (p) => (p.conciliado ? "Sí" : "—") },
          {
            key: "x",
            header: "",
            cell: (p) => (
              <span className="flex gap-1">
                {p.numeroRecibo && (
                  <Button size="sm" variant="ghost" render={<a href={`/api/cartera/recibo/${p.id}`} target="_blank" rel="noopener" />}>
                    Recibo
                  </Button>
                )}
                {p.comprobanteUrl && (
                  <Button size="sm" variant="ghost" render={<a href={p.comprobanteUrl} target="_blank" rel="noopener" />}>
                    Soporte
                  </Button>
                )}
                {puedeAnular && p.estado === "APROBADO" && <AnularPagoDialog id={p.id} numeroRecibo={p.numeroRecibo} valor={toNumber(p.valor)} />}
              </span>
            ),
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={flat} basePath="/cartera/pagos" />
    </>
  );
}
