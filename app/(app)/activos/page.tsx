import Link from "next/link";
import { Boxes, Plus, QrCode } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { listarActivos, resumenActivos } from "@/lib/activos/service";
import { ESTADOS_ACTIVO } from "@/lib/activos/constants";
import { cop, fecha } from "@/lib/format";
import { options } from "@/lib/labels";
import { PageHeader } from "@/components/app/page-header";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Activos" };

export default async function ActivosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("activos.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const filtros = { q: spGet(sp, "q"), categoria: spGet(sp, "categoria"), estado: spGet(sp, "estado") };
  const [{ items, total }, res, categorias] = await Promise.all([
    listarActivos(ctx, filtros, { skip, take }),
    resumenActivos(ctx),
    ctx.db.activo.findMany({ distinct: ["categoria"], select: { categoria: true }, orderBy: { categoria: "asc" } }),
  ]);
  const etiquetasHref = `/activos/etiquetas?${new URLSearchParams(Object.entries(filtros).filter(([, v]) => v) as [string, string][]).toString()}`;
  const verValor = can(ctx, ["presupuesto.ver", "activos.crear"]);
  return (
    <>
      <PageHeader
        titulo="Activos"
        descripcion="Inventario de equipos y áreas del conjunto, con su historial y etiqueta QR."
        acciones={
          <>
            <Button variant="outline" render={<a href={etiquetasHref} target="_blank" rel="noopener" />}>
              <QrCode /> Etiquetas QR
            </Button>
            {can(ctx, "activos.crear") && (
              <Button render={<Link href="/activos/nuevo" />}>
                <Plus /> Nuevo activo
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Activos" value={res.total} hint={verValor ? `Valor ${cop(res.valorTotal)}` : undefined} />
        <StatCard label="Operativos" value={res.operativos} tone="success" href="/activos?estado=OPERATIVO" />
        <StatCard label="En mantenimiento" value={res.enMantenimiento} tone={res.enMantenimiento ? "warning" : "default"} href="/activos?estado=EN_MANTENIMIENTO" />
        <StatCard label="Fuera de servicio" value={res.fueraServicio} tone={res.fueraServicio ? "danger" : "default"} href="/activos?estado=FUERA_SERVICIO" />
      </div>
      <ListToolbar
        placeholder="Buscar por nombre, marca, serie o ubicación…"
        exportRecurso="activos"
        filters={[
          { name: "categoria", label: "Categoría", options: categorias.map((c) => ({ value: c.categoria, label: c.categoria })) },
          { name: "estado", label: "Estado", options: options(ESTADOS_ACTIVO) },
        ]}
      />
      <DataList
        rows={items}
        rowKey={(r) => r.id}
        rowHref={(r) => `/activos/${r.id}`}
        empty={
          <EmptyState
            icon={Boxes}
            titulo="Aún no hay activos"
            descripcion="Registra ascensores, motobombas, plantas y demás equipos para programar su mantenimiento e imprimir sus etiquetas QR."
            accion={can(ctx, "activos.crear") ? <Button render={<Link href="/activos/nuevo" />}>Registrar activo</Button> : undefined}
          />
        }
        columns={[
          {
            key: "nombre",
            header: "Activo",
            primary: true,
            cell: (r) => (
              <span className="block">
                {r.nombre}
                <span className="block text-xs font-normal text-muted-foreground">{r.categoria}</span>
              </span>
            ),
          },
          { key: "ubic", header: "Ubicación", cell: (r) => r.ubicacion ?? r.zona?.nombre ?? "—" },
          { key: "marca", header: "Marca / modelo", hideOnMobile: true, cell: (r) => [r.marca, r.modelo].filter(Boolean).join(" ") || "—" },
          {
            key: "prox",
            header: "Próximo mantenimiento",
            cell: (r) => {
              const p = r.planes.sort((a, b) => a.proximaFecha.getTime() - b.proximaFecha.getTime())[0];
              return p ? fecha(p.proximaFecha) : "Sin plan";
            },
          },
          { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/activos" />
    </>
  );
}
