import { notFound } from "next/navigation";
import { CalendarClock, MapPin, Video } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";

export default async function AsambleaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.ver");
  const { id } = await params;
  const a = await ctx.db.asamblea.findUnique({ where: { id } });
  const gestor = can(ctx, ["asambleas.gestionar", "asambleas.crear"]);
  if (!a || (a.estado === "BORRADOR" && !gestor)) notFound();
  const base = `/asambleas/${id}`;
  const tabs = gestor
    ? [
        { href: base, label: "Resumen" },
        { href: `${base}/convocatoria`, label: "Convocatoria" },
        { href: `${base}/orden`, label: "Orden del día" },
        { href: `${base}/asistencia`, label: "Asistencia" },
        { href: `${base}/poderes`, label: "Poderes" },
        { href: `${base}/conducir`, label: "Conducir" },
        { href: `${base}/acta`, label: "Acta" },
        { href: `${base}/compromisos`, label: "Compromisos" },
      ]
    : [
        { href: base, label: "Resumen" },
        { href: `${base}/poderes`, label: "Poderes" },
        ...(a.actaPublicadaEn ? [{ href: `${base}/compromisos`, label: "Compromisos" }] : []),
      ];
  return (
    <>
      <PageHeader
        volver="/asambleas"
        titulo={a.titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge value={a.estado} />
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-4" /> {fechaHora(a.fecha)}
            </span>
            <span className="inline-flex items-center gap-1">
              {a.modalidad === "PRESENCIAL" ? <MapPin className="size-4" /> : <Video className="size-4" />}
              {label(a.modalidad)}
              {a.lugar && a.modalidad !== "VIRTUAL" ? ` · ${a.lugar}` : ""}
            </span>
            <span>{label(a.tipo)}</span>
          </span>
        }
        acciones={
          a.enlace && ["CONVOCADA", "EN_CURSO"].includes(a.estado) ? (
            <Button render={<a href={a.enlace} target="_blank" rel="noopener noreferrer" />}>
              <Video /> Unirse a la videollamada
            </Button>
          ) : undefined
        }
      />
      <TabsNav tabs={tabs} exact />
      {children}
    </>
  );
}
