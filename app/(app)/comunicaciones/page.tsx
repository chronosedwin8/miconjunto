import Link from "next/link";
import { MailOpen, MousePointerClick, Plus, Send, TriangleAlert } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fecha, fechaHora, pct } from "@/lib/format";
import { label } from "@/lib/labels";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { insensitive } from "@/lib/pagination";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Correo masivo" };

export default async function CampanasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("comunicaciones.correo_masivo");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 20);
  const q = spGet(sp, "q");
  const estado = spGet(sp, "estado");
  const tipo = spGet(sp, "tipo");
  const where = {
    ...(q ? { asunto: insensitive(q) } : {}),
    ...(estado ? { estado: estado as never } : {}),
    ...(tipo ? { tipo: tipo as never } : {}),
  };
  const desde = new Date(Date.now() - 30 * 86_400_000);
  const [rows, total, mes] = await Promise.all([
    ctx.db.campanaCorreo.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip, take }),
    ctx.db.campanaCorreo.count({ where }),
    ctx.db.campanaCorreo.aggregate({ where: { createdAt: { gte: desde }, estado: { in: ["ENVIADA", "ENVIANDO"] } }, _sum: { enviados: true, aperturas: true, clics: true, rebotes: true } }),
  ]);
  const env = mes._sum.enviados ?? 0;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Enviados (30 días)" value={env} icon={Send} />
        <StatCard label="Aperturas" value={env ? pct(((mes._sum.aperturas ?? 0) / env) * 100) : "—"} hint={`${mes._sum.aperturas ?? 0} correos`} icon={MailOpen} />
        <StatCard label="Clics" value={env ? pct(((mes._sum.clics ?? 0) / env) * 100) : "—"} hint={`${mes._sum.clics ?? 0} clics`} icon={MousePointerClick} />
        <StatCard label="Rebotes" value={mes._sum.rebotes ?? 0} tone={(mes._sum.rebotes ?? 0) > 0 ? "warning" : "default"} icon={TriangleAlert} />
      </div>
      <div className="mb-3">
        <Button render={<Link href="/comunicaciones/nueva" />}>
          <Plus /> Nueva campaña
        </Button>
      </div>
      <ListToolbar
        placeholder="Buscar por asunto…"
        exportRecurso="campanas-correo"
        filters={[
          { name: "estado", label: "Estado", options: ["BORRADOR", "PROGRAMADA", "ENVIANDO", "ENVIADA", "CANCELADA"].map((v) => ({ value: v, label: label(v) })) },
          { name: "tipo", label: "Tipo", options: [{ value: "GENERAL", label: "General" }, { value: "COBRO_ADMINISTRACION", label: "Cobro de administración" }] },
        ]}
      />
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/comunicaciones/${r.id}`}
        empty={<EmptyState titulo="Aún no hay campañas" descripcion="Crea tu primera campaña para informar a todo el conjunto o a un segmento." accion={<Button render={<Link href="/comunicaciones/nueva" />}>Nueva campaña</Button>} />}
        columns={[
          {
            key: "asunto",
            header: "Asunto",
            primary: true,
            cell: (r) => (
              <span className="flex flex-col">
                <span className="line-clamp-2">{r.asunto}</span>
                {r.tipo !== "GENERAL" && (
                  <Badge variant="outline" className="mt-1">
                    {label(r.tipo)}
                  </Badge>
                )}
              </span>
            ),
          },
          { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
          { key: "fecha", header: "Fecha", cell: (r) => (r.estado === "PROGRAMADA" && r.programadaPara ? `Programada ${fechaHora(r.programadaPara)}` : fecha(r.programadaPara ?? r.createdAt)) },
          { key: "dest", header: "Destinatarios", align: "right", cell: (r) => r.totalDestinatarios || "—" },
          { key: "env", header: "Enviados", align: "right", cell: (r) => r.enviados },
          { key: "ap", header: "Aperturas", align: "right", cell: (r) => (r.enviados ? pct((r.aperturas / r.enviados) * 100, 0) : "—") },
          { key: "cl", header: "Clics", align: "right", hideOnMobile: true, cell: (r) => r.clics },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/comunicaciones" />
    </>
  );
}
