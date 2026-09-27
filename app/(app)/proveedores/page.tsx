import { AlertTriangle, Briefcase, Star } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { listarProveedores, resumenProveedores, usuariosProveedorOptions } from "@/lib/proveedores/service";
import { cop, num, toNumber } from "@/lib/format";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatCard } from "@/components/app/stat-card";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { ProveedorFields } from "./proveedor-fields";
import { guardarProveedorAction } from "./actions";

export const metadata = { title: "Proveedores" };

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("proveedores.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const filtros = { q: spGet(sp, "q"), categoria: spGet(sp, "categoria"), directorio: spGet(sp, "directorio"), estado: spGet(sp, "estado") };
  const [{ items, total }, res, categorias, usuarios] = await Promise.all([
    listarProveedores(ctx, filtros, { skip, take }),
    resumenProveedores(ctx),
    ctx.db.proveedor.findMany({ distinct: ["categoria"], select: { categoria: true }, orderBy: { categoria: "asc" } }),
    can(ctx, "proveedores.crear") ? usuariosProveedorOptions(ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Proveedores activos" value={res.activos} hint={`${res.directorio} en el directorio comunitario`} />
        <StatCard label="Contratos vigentes" value={res.contratosVigentes} hint={`Valor ${cop(res.valorContratos)}`} href="/proveedores/contratos" />
        <StatCard label="Contratos por vencer" value={res.contratosPorVencer + res.contratosVencidos} tone={res.contratosPorVencer + res.contratosVencidos ? "warning" : "default"} hint={res.contratosVencidos ? `${res.contratosVencidos} vencidos` : undefined} href="/proveedores/contratos" />
        <StatCard label="Documentos vencidos" value={res.docsVencidos} tone={res.docsVencidos ? "danger" : "default"} hint={`${res.docsPorVencer} por vencer`} href="/proveedores/documentos" />
      </div>
      <ListToolbar
        placeholder="Buscar por razón social, NIT o contacto…"
        exportRecurso="proveedores"
        filters={[
          { name: "categoria", label: "Categoría", options: categorias.map((c) => ({ value: c.categoria, label: c.categoria })) },
          { name: "directorio", label: "Directorio", options: [{ value: "si", label: "En el directorio" }, { value: "no", label: "Fuera del directorio" }] },
          { name: "estado", label: "Estado", options: [{ value: "inactivos", label: "Inactivos" }, { value: "todos", label: "Activos e inactivos" }] },
        ]}
      >
        {can(ctx, "proveedores.crear") && (
          <FormDialog titulo="Nuevo proveedor" action={guardarProveedorAction} triggerLabel="Nuevo" triggerSize="sm" redirectTo="/proveedores/{id}" wide>
            <ProveedorFields usuarios={usuarios} />
          </FormDialog>
        )}
      </ListToolbar>
      <DataList
        rows={items}
        rowKey={(r) => r.id}
        rowHref={(r) => `/proveedores/${r.id}`}
        empty={<EmptyState icon={Briefcase} titulo="No hay proveedores" descripcion="Registra las empresas de vigilancia, aseo, ascensores y demás servicios del conjunto." />}
        columns={[
          {
            key: "rs",
            header: "Proveedor",
            primary: true,
            cell: (r) => (
              <span className="block">
                {r.razonSocial}
                <span className="block text-xs font-normal text-muted-foreground">NIT {r.nit}</span>
              </span>
            ),
          },
          { key: "cat", header: "Categoría", cell: (r) => r.categoria },
          { key: "tel", header: "Contacto", hideOnMobile: true, cell: (r) => [r.contactoNombre, r.telefono].filter(Boolean).join(" · ") || "—" },
          {
            key: "cal",
            header: "Calificación",
            cell: (r) =>
              toNumber(r.calificacionPromedio) > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden /> {num(r.calificacionPromedio, 1)} <span className="text-xs text-muted-foreground">({r._count.calificaciones})</span>
                </span>
              ) : (
                "—"
              ),
          },
          {
            key: "alertas",
            header: "Alertas",
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                {r.directorioComunitario && <Badge variant="info">Directorio</Badge>}
                {r.docsVencidos > 0 && (
                  <Badge variant="destructive">
                    <AlertTriangle className="size-3" /> {r.docsVencidos} doc. vencido{r.docsVencidos > 1 ? "s" : ""}
                  </Badge>
                )}
                {r.docsPorVencer > 0 && <Badge variant="warning">{r.docsPorVencer} por vencer</Badge>}
                {r.contratoAlerta && <Badge variant="warning">Contrato</Badge>}
                {!r.activo && <Badge variant="secondary">Inactivo</Badge>}
              </span>
            ),
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/proveedores" />
    </>
  );
}
