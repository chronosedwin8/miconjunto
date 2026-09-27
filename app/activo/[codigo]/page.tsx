import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, MapPin, Wrench } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/context";
import { activoPublico } from "@/lib/activos/service";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Activo", robots: { index: false } };

/** Ficha mínima pública del activo al escanear su QR: nombre, ubicación, estado y botón para reportar una falla. */
export default async function ActivoPublicoPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const a = await activoPublico(codigo);
  if (!a) notFound();
  const [su, reportesAbiertos] = await Promise.all([
    getSessionUser(),
    prisma.ticket.count({ where: { conjuntoId: a.conjuntoId, activoId: a.id, deletedAt: null, estado: { in: ["ABIERTO", "EN_REVISION", "ASIGNADO", "EN_PROCESO", "REABIERTO"] } } }),
  ]);
  const esDelConjunto = !!su && su.conjuntoId === a.conjuntoId;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{a.conjunto.nombre}</p>
        <h1 className="mt-1 text-2xl font-bold">{a.nombre}</h1>
        <p className="text-sm text-muted-foreground">{a.categoria}</p>
        <div className="mt-4 space-y-2 text-sm">
          {(a.ubicacion || a.zona) && (
            <p className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden /> {[a.zona?.nombre, a.ubicacion].filter(Boolean).join(" · ")}
            </p>
          )}
          <p className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden /> Estado: <StatusBadge value={a.estado} />
          </p>
        </div>
      </div>

      {reportesAbiertos > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          Ya hay {reportesAbiertos === 1 ? "un reporte abierto" : `${reportesAbiertos} reportes abiertos`} sobre este equipo y la administración está atendiéndolo.
        </p>
      )}

      <Button size="lg" className="h-14 w-full text-base" render={<Link href={`/activo/${codigo}/reportar`} />}>
        <AlertTriangle /> Reportar falla
      </Button>
      {!su && <p className="text-center text-xs text-muted-foreground">Te pediremos iniciar sesión con tu cuenta del conjunto.</p>}
      {esDelConjunto && (
        <Button variant="outline" className="w-full" render={<Link href="/inicio" />}>
          Ir a MiConjunto
        </Button>
      )}
    </div>
  );
}
