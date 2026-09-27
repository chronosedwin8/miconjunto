import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { cop, num } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { torreOptions } from "@/lib/conjunto/options";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Unidades" };

export default async function UnidadesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("conjunto.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const q = spGet(sp, "q");
  const where: Prisma.UnidadWhereInput = {
    ...(q ? { OR: [{ codigo: insensitive(q) }, { matriculaInmobiliaria: insensitive(q) }] } : {}),
    ...(spGet(sp, "torre") ? { torreId: spGet(sp, "torre") === "casas" ? null : spGet(sp, "torre") } : {}),
    ...(spGet(sp, "tipo") ? { tipo: spGet(sp, "tipo") as never } : {}),
    ...(spGet(sp, "ocupacion") ? { estadoOcupacion: spGet(sp, "ocupacion") as never } : {}),
  };
  const [rows, total, torres] = await Promise.all([
    ctx.db.unidad.findMany({ where, include: { torre: true }, orderBy: [{ torreId: "asc" }, { piso: "asc" }, { codigo: "asc" }], skip, take }),
    ctx.db.unidad.count({ where }),
    torreOptions(ctx),
  ]);
  const verFin = can(ctx, ["cartera.ver_todos", "campos.unidad_financiero"]);
  return (
    <>
      <ListToolbar
        placeholder="Buscar por código o matrícula…"
        exportRecurso="unidades"
        filters={[
          { name: "torre", label: "Torre", options: [...torres, { value: "casas", label: "Casas" }] },
          { name: "tipo", label: "Tipo", options: options(["APARTAMENTO", "CASA", "LOCAL", "OFICINA", "DEPOSITO", "PARQUEADERO"]) },
          { name: "ocupacion", label: "Ocupación", options: options(["PROPIETARIO_OCUPA", "ARRENDADA", "AIRBNB_O_SIMILAR", "DESOCUPADA", "EN_VENTA"]) },
        ]}
      >
        {can(ctx, "conjunto.crear") && (
          <Button size="sm" className="ml-auto shrink-0 rounded-full" render={<Link href="/conjunto/unidades/nueva" />}>
            <Plus /> Nueva unidad
          </Button>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/conjunto/unidades/${r.id}`}
        columns={[
          { key: "codigo", header: "Unidad", primary: true, cell: (r) => r.codigo },
          { key: "torre", header: "Torre", cell: (r) => r.torre?.nombre ?? "—" },
          { key: "tipo", header: "Tipo", cell: (r) => label(r.tipo) },
          { key: "area", header: "Área m²", align: "right", cell: (r) => num(r.areaPrivada) },
          { key: "coef", header: "Coeficiente %", align: "right", cell: (r) => num(r.coeficiente, 6) },
          ...(verFin ? [{ key: "cuota", header: "Cuota adm.", align: "right" as const, cell: (r: (typeof rows)[number]) => cop(r.cuotaAdministracion) }] : []),
          { key: "ocup", header: "Ocupación", cell: (r) => <StatusBadge value={r.estadoOcupacion} /> },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/conjunto/unidades" />
    </>
  );
}
