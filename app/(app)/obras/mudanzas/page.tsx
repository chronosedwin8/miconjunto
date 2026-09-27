import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { fecha, startOfDayBogota } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { ESTADOS_SOLICITUD } from "@/lib/obras/reglas";
import { esGestorObras, whereMudanzas } from "@/lib/obras/service";
import { DataList } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Mudanzas" };

export default async function MudanzasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["obras.ver", "obras.ver_todos"]);
  const sp = await searchParams;
  const gestor = esGestorObras(ctx);
  const estado = spGet(sp, "estado");
  const vista = spGet(sp, "vista") ?? "proximas";
  const rows = await ctx.db.mudanza.findMany({
    where: { AND: [whereMudanzas(ctx), estado ? { estado: estado as never } : {}, vista === "proximas" && !estado ? { fecha: { gte: startOfDayBogota() } } : {}] },
    include: { unidad: { select: { codigo: true } } },
    orderBy: [{ fecha: vista === "proximas" ? "asc" : "desc" }, { horaInicio: "asc" }],
    take: 200,
  });
  const nueva = can(ctx, ["obras.solicitar", "obras.aprobar"]) ? (
    <Button render={<Link href="/obras/mudanzas/nueva" />}>
      <Plus /> Programar mudanza
    </Button>
  ) : null;
  return (
    <>
      <ListToolbar placeholder="Buscar…" exportRecurso={gestor ? "mudanzas" : undefined} filters={[{ name: "estado", label: "Estado", options: options(ESTADOS_SOLICITUD) }, { name: "vista", label: "Fechas", options: [{ value: "todas", label: "Incluir pasadas" }] }]}>
        {nueva && <div className="ml-auto shrink-0">{nueva}</div>}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/obras/mudanzas/${r.id}`}
        empty={<EmptyState icon={Truck} titulo="No hay mudanzas programadas" descripcion="Agenda el ascensor o la zona de cargue con anticipación." accion={nueva} />}
        columns={[
          { key: "f", header: "Fecha", primary: true, cell: (r) => `${fecha(r.fecha)} · ${r.horaInicio}–${r.horaFin}` },
          { key: "u", header: "Unidad", cell: (r) => r.unidad.codigo },
          { key: "t", header: "Tipo", cell: (r) => label(r.tipo) },
          { key: "r", header: "Recurso", cell: (r) => r.recurso ?? "—" },
          { key: "p", header: "Paz y salvo", hideOnMobile: true, cell: (r) => (r.tipo === "SALIDA" ? <StatusBadge value={r.pazYSalvoVerificado ? "AL_DIA" : "MORA"} text={r.pazYSalvoVerificado ? "Al día" : "Pendiente"} /> : "No aplica") },
          { key: "e", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
        ]}
      />
    </>
  );
}
