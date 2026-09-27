import Link from "next/link";
import { ChevronRight, ShieldCheck, Vote } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarVotaciones, unidadesHabilitadas } from "@/lib/votaciones/service";
import { PageHeader } from "@/components/app/page-header";
import { FiltroTabs } from "@/components/gobierno/filtro-tabs";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { fechaHora, num } from "@/lib/format";
import { spGet, type SP } from "@/lib/pagination";

export const metadata = { title: "Votaciones" };

export default async function VotacionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("votaciones.ver");
  const sp = await searchParams;
  const tab = spGet(sp, "estado") ?? "ABIERTA";
  const { items } = await listarVotaciones(ctx, { estado: tab === "TODAS" ? undefined : tab });
  const ahora = new Date();
  const pendientes = new Map<string, string[]>();
  for (const v of items.filter((x) => x.estado === "ABIERTA" && x.inicio <= ahora && x.fin > ahora)) {
    const us = await unidadesHabilitadas(ctx, v);
    const faltan = us.filter((u) => !u.yaVoto && !u.bloqueo).map((u) => u.codigo);
    if (faltan.length) pendientes.set(v.id, faltan);
  }
  const gestor = can(ctx, "votaciones.crear");
  return (
    <>
      <PageHeader
        titulo="Votaciones"
        descripcion="Votaciones con validez: un voto por unidad, ponderado por coeficiente y con comprobante."
        acciones={
          <>
            <Button variant="outline" render={<Link href="/votaciones/comprobante" />}>
              <ShieldCheck /> Verificar comprobante
            </Button>
            {gestor && <Button render={<Link href="/votaciones/nueva" />}>Nueva votación</Button>}
          </>
        }
      />
      <FiltroTabs
        activo={tab}
        tabs={[
          { href: "/votaciones", label: "Abiertas", value: "ABIERTA" },
          { href: "/votaciones?estado=CERRADA", label: "Cerradas", value: "CERRADA" },
          ...(gestor ? [{ href: "/votaciones?estado=BORRADOR", label: "Borradores", value: "BORRADOR" }] : []),
        ]}
      />
      {items.length === 0 ? (
        <EmptyState
          icon={Vote}
          titulo={tab === "ABIERTA" ? "No hay votaciones abiertas" : "No hay votaciones aquí"}
          descripcion="Cuando la administración abra una votación te avisaremos para que votes desde tu teléfono."
          accion={gestor ? <Button render={<Link href="/votaciones/nueva" />}>Crear votación</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((v) => {
            const falta = pendientes.get(v.id);
            const r = (v.resultado ?? null) as { decision?: string; participacionCoeficiente?: number } | null;
            return (
              <li key={v.id}>
                <Link href={`/votaciones/${v.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{v.pregunta}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {v.asamblea ? `${v.asamblea.titulo} · ` : ""}
                        {v.estado === "ABIERTA" ? `Cierra ${fechaHora(v.fin)}` : v.estado === "CERRADA" ? `Cerró ${fechaHora(v.fin)}` : `Programada`}
                        {" · "}
                        {v._count.votos} voto(s)
                      </p>
                      {r?.decision && (
                        <p className="mt-1 text-sm">
                          {r.decision} · participación {num(r.participacionCoeficiente ?? 0)} %
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge value={v.estado} />
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </div>
                  {falta && (
                    <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                      <Vote className="size-4" /> Votar ahora ({falta.join(", ")})
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
