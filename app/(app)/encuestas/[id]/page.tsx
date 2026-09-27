import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { obtenerEncuesta, resultadosEncuesta } from "@/lib/encuestas/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { ActionButton } from "@/components/form/action-form";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/gobierno/live-refresh";
import { BarrasResultado } from "@/components/gobierno/barras-resultado";
import { fechaHora, num } from "@/lib/format";
import { label } from "@/lib/labels";
import { cerrarEncuestaAction, eliminarEncuestaAction } from "../actions";
import { ResponderForm } from "./responder-form";

export const metadata = { title: "Encuesta" };

export default async function EncuestaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("encuestas.ver");
  const { id } = await params;
  const e = await obtenerEncuesta(ctx, id);
  const gestor = can(ctx, "encuestas.crear");
  const verDetalle = can(ctx, "encuestas.resultados");
  const ahora = new Date();
  const abierta = e.estado === "ABIERTA" && e.inicio <= ahora && e.fin > ahora;
  const puedeResponder = abierta && !e.respondida;
  const verResultados = !puedeResponder || gestor || verDetalle;
  const res = verResultados ? await resultadosEncuesta(ctx, e, { incluirTextos: verDetalle || gestor }) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        volver="/encuestas"
        titulo={e.titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={e.estado} />
            {e.estado === "ABIERTA" ? `Cierra ${fechaHora(e.fin)}` : `Cerró ${fechaHora(e.fin)}`}
            {e.anonima && <span>· Anónima</span>}
            {e.estado === "ABIERTA" && verResultados && <LiveRefresh canales={[`encuesta:${e.id}`]} />}
          </span>
        }
      />
      {e.descripcion && <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">{e.descripcion}</p>}

      {puedeResponder && (
        <div className="mb-6 rounded-xl border-2 border-primary/40 bg-card p-4">
          <ResponderForm encuestaId={e.id} preguntas={e.preguntas.map((p) => ({ id: p.id, tipo: p.tipo, texto: p.texto, opciones: p.opciones, requerida: p.requerida }))} />
        </div>
      )}
      {e.respondida && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success/5 p-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-5" /> Ya respondiste esta encuesta. ¡Gracias!
        </p>
      )}

      {res && (
        <Section titulo={e.estado === "CERRADA" ? "Resultados finales" : "Resultados en vivo"}>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <StatCard label="Respuestas" value={res.total} />
            <StatCard label="Participación" value={`${num(res.participacion)} %`} hint={`de ${res.audiencia} personas en la audiencia`} />
          </div>
          <div className="space-y-3">
            {res.preguntas.map((p, i) => (
              <div key={p.id} className="rounded-xl border bg-card p-4">
                <p className="font-medium">
                  {i + 1}. {p.texto}
                </p>
                <p className="mb-2 text-xs text-muted-foreground">
                  {label(p.tipo)} · {p.respuestas} respuesta(s)
                  {p.promedio !== undefined && p.promedio !== null ? ` · promedio ${num(p.promedio)} de 5` : ""}
                </p>
                {p.tipo !== "TEXTO" ? (
                  <BarrasResultado datos={p.opciones.map((o) => ({ nombre: p.tipo === "ESCALA" ? `${o.opcion} de 5` : o.opcion, valor: o.pct, detalle: `${o.votos} respuesta(s)` }))} max={100} />
                ) : p.textos?.length ? (
                  <ul className="max-h-72 space-y-1.5 overflow-y-auto text-sm">
                    {p.textos.map((t, k) => (
                      <li key={k} className="rounded-lg bg-muted p-2">
                        {t}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{p.respuestas ? "Las respuestas abiertas solo las ve la administración." : "Sin respuestas aún."}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {gestor && (
        <div className="flex flex-wrap gap-2">
          {verDetalle && (
            <Button variant="outline" render={<a href={`/api/export/encuesta-respuestas?encuestaId=${e.id}`} />}>
              <FileSpreadsheet /> Exportar respuestas
            </Button>
          )}
          {e.estado === "ABIERTA" && (
            <ActionButton action={cerrarEncuestaAction} input={{ id: e.id }} variant="outline" confirm="¿Cerrar la encuesta ahora?" successMessage="Encuesta cerrada">
              Cerrar ahora
            </ActionButton>
          )}
          <ActionButton action={eliminarEncuestaAction} input={{ id: e.id }} variant="destructive" confirm="¿Eliminar la encuesta y sus respuestas?" successMessage="Encuesta eliminada" redirectTo="/encuestas">
            Eliminar
          </ActionButton>
        </div>
      )}
    </div>
  );
}
