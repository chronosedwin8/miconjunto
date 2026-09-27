import Link from "next/link";
import { MonitorPlay, Play, Square } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { obtenerAsamblea, quorumAsamblea } from "@/lib/asambleas/service";
import { calcularResultadoActual } from "@/lib/votaciones/service";
import { parseOrdenDelDia } from "@/lib/votaciones/calculos";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/gobierno/live-refresh";
import { QuorumMeter } from "@/components/gobierno/quorum-meter";
import { BarrasResultado } from "@/components/gobierno/barras-resultado";
import { hora, num } from "@/lib/format";
import { abrirVotacionAction, cerrarVotacionAction } from "../../../votaciones/actions";
import { finalizarAsambleaAction, iniciarAsambleaAction } from "../../actions";

export const metadata = { title: "Conducir asamblea" };

/** Pantalla del presidente: iniciar/finalizar, quórum en vivo y apertura/cierre de la votación de cada punto. */
export default async function ConducirPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.gestionar");
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const [q, votaciones] = await Promise.all([quorumAsamblea(ctx, a), ctx.db.votacion.findMany({ where: { asambleaId: id } })]);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const abiertas = votaciones.filter((v) => v.estado === "ABIERTA");
  const resultados = new Map(await Promise.all(abiertas.map(async (v) => [v.id, await calcularResultadoActual(ctx, v)] as const)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiveRefresh canales={[`asamblea:${id}`, ...abiertas.map((v) => `votacion:${v.id}`)]} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href={`/asambleas/proyector/${id}`} target="_blank" />}>
            <MonitorPlay /> Proyector
          </Button>
          {a.estado === "CONVOCADA" && (
            <ActionButton action={iniciarAsambleaAction} input={{ id }} confirm={q.hayQuorum ? "¿Iniciar la asamblea?" : "Aún no hay quórum. ¿Iniciar de todas formas? (quedará registrado en el acta)"} successMessage="Asamblea iniciada">
              <Play /> Iniciar asamblea
            </ActionButton>
          )}
          {a.estado === "EN_CURSO" && (
            <ActionButton action={finalizarAsambleaAction} input={{ id }} variant="destructive" confirm="¿Finalizar la asamblea? Se cerrarán las votaciones abiertas y se generará el borrador del acta." successMessage="Asamblea finalizada" redirectTo={`/asambleas/${id}/acta`}>
              <Square /> Finalizar asamblea
            </ActionButton>
          )}
        </div>
      </div>

      <QuorumMeter porcentaje={q.porcentaje} requerido={q.requerido} hayQuorum={q.hayQuorum} unidades={q.unidadesPresentes} totalUnidades={q.totalUnidades} faltante={q.faltante} />

      <Section titulo="Puntos del orden del día">
        <ol className="space-y-2">
          {puntos.map((p) => {
            const v = votaciones.find((x) => x.id === p.votacionId);
            const r = v ? resultados.get(v.id) : undefined;
            const final = (v?.resultado ?? null) as { decision?: string; participacionCoeficiente?: number } | null;
            return (
              <li key={p.orden} className={v?.estado === "ABIERTA" ? "rounded-xl border-2 border-primary bg-card p-4" : "rounded-xl border bg-card p-4"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Punto {p.orden}</p>
                    <p className="font-semibold">{p.titulo}</p>
                    {v && <p className="text-sm text-muted-foreground">Votación: {v.pregunta}</p>}
                  </div>
                  {v && <StatusBadge value={v.estado} />}
                </div>
                {v?.estado === "BORRADOR" && a.estado === "EN_CURSO" && (
                  <div className="mt-3">
                    <FormDialog titulo={`Abrir votación: ${v.pregunta}`} descripcion="Solo votan las unidades con asistencia registrada. Se cierra sola al terminar el tiempo." action={abrirVotacionAction} extra={{ id: v.id }} triggerLabel="Abrir votación" submitLabel="Abrir ahora" successMessage="Votación abierta">
                      <TextField name="minutos" label="Minutos para votar" type="number" inputMode="numeric" defaultValue={10} required />
                    </FormDialog>
                  </div>
                )}
                {v?.estado === "ABIERTA" && r && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm">
                      <b>{r.totalVotos}</b> de {q.unidadesPresentes} unidades presentes han votado ({num(r.participacionCoeficiente)} % del coeficiente total) · cierra {hora(v.fin)}
                    </p>
                    <BarrasResultado datos={r.opciones.map((o) => ({ nombre: o.texto, valor: o.pctCoeficiente, detalle: `${o.votos} voto(s)` }))} max={100} />
                    <ActionButton action={cerrarVotacionAction} input={{ id: v.id }} confirm="¿Cerrar la votación de este punto?" successMessage="Votación cerrada">
                      Cerrar votación
                    </ActionButton>
                  </div>
                )}
                {v?.estado === "CERRADA" && final && (
                  <p className="mt-2 rounded-lg bg-muted p-2 text-sm">
                    {final.decision} · participación {num(final.participacionCoeficiente ?? 0)} %{" "}
                    <Link href={`/votaciones/${v.id}`} className="text-primary underline">
                      Ver detalle
                    </Link>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}
