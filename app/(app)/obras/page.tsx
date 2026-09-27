import Link from "next/link";
import { Hammer, Plus, Truck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { fecha } from "@/lib/format";
import { options } from "@/lib/labels";
import { ESTADOS_SOLICITUD } from "@/lib/obras/reglas";
import { autorizadasDelDia, contratistasDe, esGestorObras, whereObras } from "@/lib/obras/service";
import { DataList } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Section } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Obras y remodelaciones" };

export default async function ObrasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["obras.ver", "obras.ver_todos"]);
  const sp = await searchParams;
  const gestor = esGestorObras(ctx);
  const estado = spGet(sp, "estado");
  const [rows, hoy] = await Promise.all([
    ctx.db.solicitudObra.findMany({
      where: { AND: [whereObras(ctx), estado ? { estado: estado as never } : {}] },
      include: { unidad: { select: { codigo: true } } },
      orderBy: [{ fechaInicio: "desc" }],
      take: 200,
    }),
    gestor ? autorizadasDelDia(ctx) : null,
  ]);
  const puedeSolicitar = can(ctx, ["obras.solicitar", "obras.aprobar"]);
  const nueva = puedeSolicitar ? (
    <Button render={<Link href="/obras/nueva" />}>
      <Plus /> Solicitar obra
    </Button>
  ) : null;
  return (
    <>
      {hoy && (hoy.obras.length > 0 || hoy.mudanzas.length > 0) && (
        <Section titulo="Autorizadas para hoy" className="rounded-xl border bg-primary/5 p-3">
          <ul className="space-y-1 text-sm">
            {hoy.obras.map((o) => (
              <li key={o.id}>
                <Link href={`/obras/${o.id}`} className="flex items-center gap-2 hover:underline">
                  <Hammer className="size-4 text-primary" /> {o.unidad}: {o.descripcion.slice(0, 60)} · {o.contratistas.length} contratista(s)
                </Link>
              </li>
            ))}
            {hoy.mudanzas.map((m) => (
              <li key={m.id}>
                <Link href={`/obras/mudanzas/${m.id}`} className="flex items-center gap-2 hover:underline">
                  <Truck className="size-4 text-primary" /> {m.unidad}: mudanza de {m.tipo === "SALIDA" ? "salida" : "ingreso"} {m.horaInicio}–{m.horaFin}
                  {m.recurso ? ` · ${m.recurso}` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <ListToolbar placeholder="Buscar…" exportRecurso={gestor ? "obras" : undefined} filters={[{ name: "estado", label: "Estado", options: options(ESTADOS_SOLICITUD) }]}>
        {nueva && <div className="ml-auto shrink-0">{nueva}</div>}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/obras/${r.id}`}
        empty={<EmptyState icon={Hammer} titulo="No hay solicitudes de obra" descripcion="Antes de remodelar, solicita la autorización con tus contratistas y su seguridad social." accion={nueva} />}
        columns={[
          { key: "d", header: "Obra", primary: true, cell: (r) => <span className="line-clamp-2">{r.descripcion}</span> },
          { key: "u", header: "Unidad", cell: (r) => r.unidad.codigo },
          { key: "f", header: "Fechas", cell: (r) => `${fecha(r.fechaInicio)} – ${fecha(r.fechaFin)}` },
          { key: "c", header: "Contratistas", align: "right", hideOnMobile: true, cell: (r) => contratistasDe(r.contratistas).length },
          { key: "e", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
        ]}
      />
    </>
  );
}
