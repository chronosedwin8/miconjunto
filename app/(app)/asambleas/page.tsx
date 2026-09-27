import Link from "next/link";
import { CalendarClock, ChevronRight, Landmark, MapPin, Video } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarAsambleas } from "@/lib/asambleas/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";

export const metadata = { title: "Asambleas" };

type Item = Awaited<ReturnType<typeof listarAsambleas>>[number];

function Tarjeta({ a }: { a: Item }) {
  return (
    <Link href={`/asambleas/${a.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold leading-snug">{a.titulo}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-4" /> {fechaHora(a.fecha)}
            </span>
            <span className="inline-flex items-center gap-1">
              {a.modalidad === "PRESENCIAL" ? <MapPin className="size-4" /> : <Video className="size-4" />} {label(a.modalidad)}
            </span>
            <span>{label(a.tipo)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge value={a.estado} />
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </div>
      {a.estado === "FINALIZADA" && a.actaPublicadaEn && <p className="mt-2 text-xs text-success">Acta publicada · {a._count.votaciones} votación(es)</p>}
    </Link>
  );
}

export default async function AsambleasPage() {
  const ctx = await requirePage("asambleas.ver");
  const gestor = can(ctx, "asambleas.crear");
  const todas = await listarAsambleas(ctx);
  const visibles = gestor ? todas : todas.filter((a) => a.estado !== "BORRADOR");
  const activas = visibles.filter((a) => ["BORRADOR", "CONVOCADA", "EN_CURSO"].includes(a.estado)).sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const pasadas = visibles.filter((a) => !activas.includes(a));
  return (
    <>
      <PageHeader
        titulo="Asambleas"
        descripcion="Convocatorias, asistencia, quórum en vivo, poderes, votaciones y actas (Ley 675 de 2001)."
        acciones={gestor && <Button render={<Link href="/asambleas/nueva" />}>Nueva asamblea</Button>}
      />
      {visibles.length === 0 ? (
        <EmptyState icon={Landmark} titulo="No hay asambleas registradas" descripcion="Aquí verás las convocatorias y las actas de las asambleas." accion={gestor ? <Button render={<Link href="/asambleas/nueva" />}>Programar asamblea</Button> : undefined} />
      ) : (
        <>
          <Section titulo="Próximas y en curso">
            {activas.length ? (
              <ul className="space-y-3">
                {activas.map((a) => (
                  <li key={a.id}>
                    <Tarjeta a={a} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No hay asambleas convocadas por ahora.</p>
            )}
          </Section>
          {pasadas.length > 0 && (
            <Section titulo="Anteriores">
              <ul className="space-y-3">
                {pasadas.map((a) => (
                  <li key={a.id}>
                    <Tarjeta a={a} />
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}
