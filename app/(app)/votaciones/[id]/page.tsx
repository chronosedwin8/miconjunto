import Link from "next/link";
import { FileDown, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { obtenerVotacion, resultadosVotacion, unidadesHabilitadas } from "@/lib/votaciones/service";
import { parseOpciones } from "@/lib/votaciones/calculos";
import { MAYORIA_TEXTO, PONDERACION_TEXTO, QUIEN_VOTA_TEXTO } from "@/lib/votaciones/textos";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/gobierno/live-refresh";
import { BarrasResultado } from "@/components/gobierno/barras-resultado";
import { CopiarTexto } from "@/components/gobierno/copiar";
import { fechaHora, num } from "@/lib/format";
import { cn } from "@/lib/utils";
import { abrirVotacionAction, anularVotacionAction, cerrarVotacionAction } from "../actions";
import { VotarPanel } from "./votar-panel";

export const metadata = { title: "Votación" };

export default async function VotacionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("votaciones.ver");
  const { id } = await params;
  const v = await obtenerVotacion(ctx, id);
  const gestor = can(ctx, ["votaciones.crear", "asambleas.gestionar"]);
  if (v.estado === "BORRADOR" && !gestor) {
    return <PageHeader titulo="Votación aún no abierta" volver="/votaciones" descripcion="Esta votación se abrirá durante la asamblea." />;
  }
  const [unidades, r] = await Promise.all([unidadesHabilitadas(ctx, v), resultadosVotacion(ctx, v)]);
  const opciones = parseOpciones(v.opciones);
  const ahora = new Date();
  const abierta = v.estado === "ABIERTA" && v.inicio <= ahora && v.fin > ahora;
  const votadas = unidades.filter((u) => u.yaVoto);
  const cerrable = v.estado === "ABIERTA" && can(ctx, v.asambleaId ? ["votaciones.cerrar", "asambleas.gestionar"] : "votaciones.cerrar");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        volver={v.asambleaId ? `/asambleas/${v.asambleaId}` : "/votaciones"}
        titulo={v.pregunta}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={v.estado} />
            {v.estado === "ABIERTA" ? `Cierra ${fechaHora(v.fin)}` : v.estado === "CERRADA" ? `Cerró ${fechaHora(v.fin)}` : null}
            {v.asamblea && (
              <Link href={`/asambleas/${v.asamblea.id}`} className="underline">
                {v.asamblea.titulo}
              </Link>
            )}
            {v.estado === "ABIERTA" && <LiveRefresh canales={[`votacion:${v.id}`]} />}
          </span>
        }
      />

      {v.descripcion && <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">{v.descripcion}</p>}

      {abierta && (
        <div className="mb-6">
          <VotarPanel votacionId={v.id} opciones={opciones} unidades={unidades} secreto={v.secreto} />
        </div>
      )}

      {votadas.length > 0 && (
        <Section titulo="Tus comprobantes">
          <ul className="space-y-2">
            {votadas.map((u) => (
              <li key={u.unidadId} className="rounded-xl border bg-card p-3">
                <p className="text-sm font-medium">
                  {u.codigo} {u.porPoder ? "(por poder)" : ""} · votó por «{opciones.find((o) => o.id === u.opcionVotada)?.texto ?? "—"}»
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground" data-testid="comprobante-guardado">
                  {u.comprobante}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <CopiarTexto texto={u.comprobante ?? ""} />
                  <Button variant="outline" size="sm" render={<Link href={`/votaciones/comprobante?hash=${u.comprobante}`} />}>
                    <ShieldCheck /> Verificar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section titulo={v.estado === "CERRADA" ? "Resultado final" : "Resultados en tiempo real"}>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Unidades que votaron" value={`${r.totalVotos} / ${r.totalUnidades}`} hint={`${num(r.participacionUnidades)} % de las unidades`} />
          <StatCard label="Participación por coeficiente" value={`${num(r.participacionCoeficiente)} %`} hint={`${num(r.coeficienteVotante, 4)} de ${num(r.totalCoeficientes, 2)} puntos`} />
          <StatCard className="col-span-2 sm:col-span-1" label="Mayoría exigida" value={r.aprobada ? "Alcanzada" : "No alcanzada"} tone={r.aprobada ? "success" : "warning"} hint={r.base.regla} />
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-medium">% del coeficiente total del conjunto por opción</p>
          <BarrasResultado datos={r.opciones.map((o) => ({ nombre: o.texto, valor: o.pctCoeficiente, detalle: `${o.votos} voto(s) · ${num(o.pctParticipacion)} % de lo emitido` }))} max={100} />
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Resultados por opción</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Opción</th>
                <th className="py-1.5 text-right font-medium">Votos</th>
                <th className="py-1.5 text-right font-medium">% coef. total</th>
                <th className="py-1.5 text-right font-medium">% emitido</th>
              </tr>
            </thead>
            <tbody>
              {r.opciones.map((o) => (
                <tr key={o.id} className={cn("border-b last:border-0", r.ganadora?.id === o.id && "font-semibold")}>
                  <td className="py-1.5">{o.texto}</td>
                  <td className="py-1.5 text-right tabular-nums">{o.votos}</td>
                  <td className="py-1.5 text-right tabular-nums">{num(o.pctCoeficiente)} %</td>
                  <td className="py-1.5 text-right tabular-nums">{num(o.pctParticipacion)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={cn("mt-3 rounded-lg p-3 text-sm font-medium", r.aprobada ? "bg-success/10 text-success" : "bg-muted")}>{v.estado === "CERRADA" ? r.decision : `Parcial: ${r.decision}`}</p>
        </div>
      </Section>

      <Section titulo="Reglas de esta votación">
        <dl className="grid gap-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Mayoría</dt>
            <dd>{MAYORIA_TEXTO[v.tipoMayoria]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Ponderación</dt>
            <dd>{PONDERACION_TEXTO[v.ponderacion]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Pueden votar</dt>
            <dd>{QUIEN_VOTA_TEXTO[v.quienVota]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tipo de voto</dt>
            <dd>{v.secreto ? "Secreto, con comprobante" : "Nominal, con comprobante"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Base de la mayoría</dt>
            <dd>{r.base.descripcion}</dd>
          </div>
          {v.codigoActa && (
            <div>
              <dt className="text-xs text-muted-foreground">Código de verificación del acta</dt>
              <dd className="font-mono">{v.codigoActa}</dd>
            </div>
          )}
        </dl>
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<a href={`/api/v1/votaciones/${v.id}/acta`} target="_blank" rel="noopener" />}>
          <FileDown /> {v.estado === "CERRADA" ? "Acta de resultados (PDF)" : "Resultado parcial (PDF)"}
        </Button>
        {gestor && (
          <Button variant="outline" render={<a href={`/api/export/votos?votacionId=${v.id}`} />}>
            <FileSpreadsheet /> Registro de votos (Excel)
          </Button>
        )}
        {v.estado === "BORRADOR" && gestor && (
          <FormDialog titulo="Abrir votación" action={abrirVotacionAction} extra={{ id: v.id }} triggerLabel="Abrir votación" submitLabel="Abrir">
            <TextField name="minutos" label="Minutos que estará abierta" type="number" inputMode="numeric" defaultValue={15} required />
          </FormDialog>
        )}
        {cerrable && (
          <ActionButton action={cerrarVotacionAction} input={{ id: v.id }} confirm="¿Cerrar la votación ahora? Se calculará el resultado final y no se recibirán más votos." successMessage="Votación cerrada">
            Cerrar votación
          </ActionButton>
        )}
        {v.estado !== "ANULADA" && v.estado !== "CERRADA" && can(ctx, "votaciones.cerrar") && (
          <FormDialog
            titulo="Anular votación"
            descripcion="La anulación queda registrada en la auditoría con su motivo."
            action={anularVotacionAction}
            extra={{ id: v.id }}
            triggerLabel="Anular"
            triggerVariant="destructive"
            submitLabel="Anular votación"
            confirm="¿Anular esta votación?"
          >
            <TextAreaField name="motivo" label="Motivo" required />
          </FormDialog>
        )}
      </div>
    </div>
  );
}
