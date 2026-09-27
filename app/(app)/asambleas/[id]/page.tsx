import Link from "next/link";
import { ChevronRight, FileDown, Vote } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { iaDisponible } from "@/lib/ia/disponible";
import { IaBoton } from "@/components/ia/ia-boton";
import { resumenActaAction } from "@/app/(app)/asistente/actions";
import { can } from "@/lib/permisos";
import { cuotasExtraordinarias, misUnidadesAsamblea, obtenerAsamblea, quorumAsamblea, revisarAntelacion, ventanaAsistencia } from "@/lib/asambleas/service";
import { parseOrdenDelDia } from "@/lib/votaciones/calculos";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/gobierno/live-refresh";
import { QuorumMeter } from "@/components/gobierno/quorum-meter";
import { cop, fechaHora } from "@/lib/format";
import { AsistenciaPropia } from "./asistencia-propia";

export const metadata = { title: "Asamblea" };

export default async function AsambleaResumenPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.ver");
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const gestor = can(ctx, ["asambleas.gestionar", "asambleas.crear"]);
  const [q, mias, votaciones, poderesPend, cuotas] = await Promise.all([
    quorumAsamblea(ctx, a),
    misUnidadesAsamblea(ctx, id),
    ctx.db.votacion.findMany({ where: { asambleaId: id, ...(gestor ? {} : { estado: { in: ["ABIERTA", "CERRADA"] } }) }, orderBy: { puntoOrden: "asc" } }),
    ctx.db.poderAsamblea.count({ where: { asambleaId: id, estado: "PENDIENTE" } }),
    cuotasExtraordinarias(ctx, id),
  ]);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const vivo = a.estado === "CONVOCADA" || a.estado === "EN_CURSO";
  const ventana = ventanaAsistencia(a);
  const ant = a.estado === "BORRADOR" ? revisarAntelacion(a) : null;

  return (
    <div className="space-y-6">
      {a.estado === "FINALIZADA" && iaDisponible(ctx) && (
        <div className="flex justify-end">
          <IaBoton action={resumenActaAction} id={id} texto="Resumen del acta con IA" titulo={`Resumen · ${a.titulo}`} />
        </div>
      )}
      {vivo && (
        <div className="flex justify-end">
          <LiveRefresh canales={[`asamblea:${id}`]} />
        </div>
      )}

      {gestor && a.estado === "BORRADOR" && ant && (
        <div className={ant.bloquea ? "rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm" : "rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"}>
          <p className="font-semibold">Borrador: aún no se ha convocado.</p>
          <p className="mt-1">{ant.mensaje}</p>
          <Button className="mt-3" render={<Link href={`/asambleas/${id}/convocatoria`} />}>
            Revisar y enviar convocatoria
          </Button>
        </div>
      )}

      {mias.length > 0 && vivo && (
        <AsistenciaPropia asambleaId={id} modalidad={a.modalidad} unidades={mias} habilitado={ventana.ok} motivo={ventana.motivo} />
      )}

      {votaciones.some((v) => v.estado === "ABIERTA") && (
        <Section titulo="Votación abierta">
          <ul className="space-y-2">
            {votaciones
              .filter((v) => v.estado === "ABIERTA")
              .map((v) => (
                <li key={v.id}>
                  <Link href={`/votaciones/${v.id}`} className="flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-primary/5 p-4">
                    <span>
                      <span className="block text-xs text-muted-foreground">Punto {v.puntoOrden} · cierra {fechaHora(v.fin)}</span>
                      <span className="font-semibold">{v.pregunta}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                      <Vote className="size-4" /> Votar
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </Section>
      )}

      {a.estado !== "BORRADOR" && a.estado !== "CANCELADA" && (
        <QuorumMeter porcentaje={q.porcentaje} requerido={q.requerido} hayQuorum={q.hayQuorum} unidades={q.unidadesPresentes} totalUnidades={q.totalUnidades} faltante={q.faltante} />
      )}

      {gestor && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Presenciales" value={q.presenciales} />
          <StatCard label="Virtuales" value={q.virtuales} />
          <StatCard label="Por poder" value={q.porPoder} />
          <StatCard label="Poderes por revisar" value={poderesPend} tone={poderesPend ? "warning" : "default"} href={`/asambleas/${id}/poderes`} />
        </div>
      )}

      {a.actaPublicadaEn && (
        <div className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-semibold">Acta publicada el {fechaHora(a.actaPublicadaEn)}</p>
            <p className="text-muted-foreground">
              Código de verificación: <span className="font-mono">{a.actaCodigo}</span>
            </p>
          </div>
          <Button variant="outline" render={<a href={`/api/v1/asambleas/${id}/acta`} target="_blank" rel="noopener" />}>
            <FileDown /> Descargar acta (PDF)
          </Button>
        </div>
      )}

      <Section titulo="Orden del día">
        <ol className="divide-y rounded-xl border bg-card">
          {puntos.map((p) => {
            const v = votaciones.find((x) => x.id === p.votacionId);
            const r = (v?.resultado ?? null) as { decision?: string; aprobada?: boolean } | null;
            return (
              <li key={p.orden} className="flex items-start gap-3 p-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">{p.orden}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.titulo}</p>
                  {p.descripcion && <p className="text-sm text-muted-foreground">{p.descripcion}</p>}
                  {v && (
                    <Link href={`/votaciones/${v.id}`} className="mt-1 inline-flex items-center gap-1 text-sm text-primary">
                      <StatusBadge value={v.estado} /> {r?.decision ?? "Votación del punto"} <ChevronRight className="size-4" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {(cuotas.length > 0 || gestor) && (
        <Section titulo="Cuotas extraordinarias aprobadas">
          {cuotas.length ? (
            <ul className="space-y-2">
              {cuotas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
                  <span>
                    <b>{c.nombre}</b> · {cop(c.valorTotal)} en {c.numeroCuotas} cuota(s)
                  </span>
                  {can(ctx, "cartera.ver_todos") && (
                    <Link href="/cartera/extraordinarias" className="text-primary underline">
                      Ver en cartera
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Si la asamblea aprueba una cuota extraordinaria, créala en{" "}
              <Link href={`/cartera/extraordinarias?asambleaId=${id}`} className="text-primary underline">
                Cartera → Extraordinarias
              </Link>{" "}
              y enlázala desde la pestaña Compromisos.
            </p>
          )}
        </Section>
      )}

      {a.convocatoriaTexto && a.estado !== "BORRADOR" && (
        <Section titulo="Convocatoria">
          <details className="rounded-xl border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-medium">Ver texto de la convocatoria {a.convocatoriaEnviadaEn ? `(enviada el ${fechaHora(a.convocatoriaEnviadaEn)})` : ""}</summary>
            <p className="mt-3 whitespace-pre-line">{a.convocatoriaTexto}</p>
          </details>
        </Section>
      )}
    </div>
  );
}
