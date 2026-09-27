import Link from "next/link";
import { CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarEncuestas } from "@/lib/encuestas/service";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FiltroTabs } from "@/components/gobierno/filtro-tabs";
import { Button } from "@/components/ui/button";
import { fechaHora } from "@/lib/format";
import { spGet, type SP } from "@/lib/pagination";

export const metadata = { title: "Encuestas" };

export default async function EncuestasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("encuestas.ver");
  const tab = spGet(await searchParams, "estado") === "CERRADA" ? "CERRADA" : "ABIERTA";
  const encuestas = await listarEncuestas(ctx, { estado: tab });
  const gestor = can(ctx, "encuestas.crear");
  return (
    <>
      <PageHeader
        titulo="Encuestas"
        descripcion="Tu opinión en pocos segundos. Los resultados se actualizan en vivo."
        acciones={gestor && <Button render={<Link href="/encuestas/nueva" />}>Nueva encuesta</Button>}
      />
      <FiltroTabs
        activo={tab}
        tabs={[
          { href: "/encuestas", label: "Abiertas", value: "ABIERTA" },
          { href: "/encuestas?estado=CERRADA", label: "Cerradas", value: "CERRADA" },
        ]}
      />
      {encuestas.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          titulo={tab === "ABIERTA" ? "No hay encuestas abiertas" : "Aún no hay encuestas cerradas"}
          descripcion="Cuando la administración publique una encuesta te llegará un aviso."
          accion={gestor ? <Button render={<Link href="/encuestas/nueva" />}>Crear encuesta</Button> : undefined}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {encuestas.map((e) => (
            <li key={e.id}>
              <Link href={`/encuestas/${e.id}`} className="flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{e.titulo}</p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e._count.preguntas} pregunta(s) · {e._count.respuestas} respuesta(s) · {e.estado === "ABIERTA" ? `cierra ${fechaHora(e.fin)}` : `cerró ${fechaHora(e.fin)}`}
                  {e.anonima ? " · anónima" : ""}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <StatusBadge value={e.estado} />
                  {e.respondida ? (
                    <span className="inline-flex items-center gap-1 text-sm text-success">
                      <CheckCircle2 className="size-4" /> Ya respondiste
                    </span>
                  ) : e.estado === "ABIERTA" ? (
                    <span className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Responder</span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
