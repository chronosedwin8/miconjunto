import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, type SP } from "@/lib/pagination";
import { cop, fecha, periodoActual, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { torreOptions, unidadOptions } from "@/lib/conjunto/options";
import { filtroCuotas } from "@/lib/cartera/filtros";
import { sumarMeses } from "@/lib/cartera/calculos";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { AnularCuotaDialog, CrearCargoDialog } from "../componentes";

export const metadata = { title: "Cuotas" };

export default async function CuotasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("cartera.ver_todos");
  const sp = await searchParams;
  const flat = spFlat(sp);
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const where = filtroCuotas(flat);
  const [rows, total, suma, conceptos, torres, unidades] = await Promise.all([
    ctx.db.cuota.findMany({ where, include: { concepto: true, unidad: { select: { codigo: true } }, aplicaciones: { where: { deletedAt: null }, select: { id: true } } }, orderBy: [{ fechaVencimiento: "desc" }, { unidad: { codigo: "asc" } }], skip, take }),
    ctx.db.cuota.count({ where }),
    ctx.db.cuota.aggregate({ where, _sum: { saldo: true, valorBase: true, iva: true } }),
    ctx.db.conceptoCobro.findMany({ orderBy: { nombre: "asc" } }),
    torreOptions(ctx),
    can(ctx, "cartera.crear") ? unidadOptions(ctx) : Promise.resolve([]),
  ]);
  const actual = periodoActual();
  const periodos = Array.from({ length: 8 }, (_, i) => sumarMeses(actual, 1 - i));
  const puedeAnular = can(ctx, "cartera.anular");
  return (
    <>
      <ListToolbar
        placeholder="Buscar unidad, descripción o referencia…"
        exportRecurso="cartera-cuotas"
        filters={[
          { name: "estado", label: "Estado", options: [{ value: "VENCIDA", label: "Vencidas" }, ...["PENDIENTE", "PARCIAL", "PAGADA", "EN_ACUERDO", "ANULADA"].map((v) => ({ value: v, label: label(v) }))] },
          { name: "concepto", label: "Concepto", options: conceptos.map((c) => ({ value: c.id, label: c.nombre })) },
          { name: "periodo", label: "Periodo", options: periodos.map((p) => ({ value: p, label: p })) },
          { name: "torre", label: "Torre", options: [...torres, { value: "casas", label: "Casas" }] },
        ]}
      >
        {can(ctx, "cartera.crear") && (
          <span className="ml-auto shrink-0">
            <CrearCargoDialog unidades={unidades} conceptos={conceptos.filter((c) => c.activo && c.tipo !== "INTERES_MORA").map((c) => ({ value: c.id, label: c.nombre }))} />
          </span>
        )}
      </ListToolbar>
      <p className="mb-3 text-sm text-muted-foreground">
        {total} cuota(s) · valor {cop(toNumber(suma._sum.valorBase) + toNumber(suma._sum.iva))} · saldo pendiente <b className="text-foreground">{cop(suma._sum.saldo)}</b>
      </p>
      <DataList
        rows={rows}
        rowKey={(c) => c.id}
        empty={<EmptyState titulo="No hay cuotas con estos filtros" descripcion="Genera las cuotas del mes o crea un cargo manual." />}
        columns={[
          { key: "u", header: "Unidad", primary: true, cell: (c) => <Link href={`/cartera/unidades/${c.unidadId}`} className="text-primary">{c.unidad.codigo}</Link> },
          { key: "d", header: "Descripción", cell: (c) => c.descripcion ?? c.concepto.nombre },
          { key: "p", header: "Periodo", hideOnMobile: true, cell: (c) => c.periodo },
          { key: "v", header: "Vence", cell: (c) => fecha(c.fechaVencimiento) },
          { key: "t", header: "Valor", align: "right", hideOnMobile: true, cell: (c) => cop(toNumber(c.valorBase) + toNumber(c.iva)) },
          { key: "s", header: "Saldo", align: "right", cell: (c) => <b>{cop(c.saldo)}</b> },
          { key: "e", header: "Estado", cell: (c) => <StatusBadge value={c.estado === "PENDIENTE" && c.fechaVencimiento < new Date() ? "VENCIDA" : c.estado} text={c.estado === "PENDIENTE" && c.fechaVencimiento < new Date() ? "Vencida" : undefined} /> },
          { key: "r", header: "Referencia", hideOnMobile: true, cell: (c) => <span className="font-mono text-xs">{c.referenciaPago}</span> },
          ...(puedeAnular ? [{ key: "x", header: "", cell: (c: (typeof rows)[number]) => (c.estado !== "ANULADA" && c.estado !== "EN_ACUERDO" && c.aplicaciones.length === 0 ? <AnularCuotaDialog id={c.id} descripcion={`${c.unidad.codigo} · ${c.descripcion ?? ""}`} /> : null) }] : []),
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={flat} basePath="/cartera/cuotas" />
    </>
  );
}
