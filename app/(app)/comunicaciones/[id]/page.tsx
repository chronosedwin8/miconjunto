import { notFound } from "next/navigation";
import { Copy, FileText, Send, XCircle } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fechaHora, isoDateTimeLocal, pct } from "@/lib/format";
import { label } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";
import { correosDeCampana, metricasCampana, VARIABLES_CORREO } from "@/lib/comunicaciones/correo-masivo";
import { describirDef, listarSegmentos, nombresDesdeOpciones, normalizarDef, opcionesSegmento } from "@/lib/segmentos";
import { sanitizarHtml } from "@/lib/muro/contenido";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { DataList } from "@/components/app/data-list";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { PROSE } from "@/app/(app)/muro/_components/prose";
import { CampanaForm } from "../_components/campana-form";
import { cancelarCampanaAction, duplicarCampanaAction, eliminarCampanaAction, enviarCampanaAction, guardarCampanaAction, vistaPreviaCorreoAction } from "../actions";
import { contarSegmentoAction } from "../segmentos/actions";

export const metadata = { title: "Campaña" };

export default async function CampanaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePage("comunicaciones.correo_masivo");
  const { id } = await params;
  const sp = await searchParams;
  const c = await ctx.db.campanaCorreo.findUnique({ where: { id } });
  if (!c) notFound();
  const editable = c.tipo === "GENERAL" && (c.estado === "BORRADOR" || c.estado === "PROGRAMADA");
  const [opciones, segmentos, m, correos] = await Promise.all([
    opcionesSegmento(ctx),
    listarSegmentos(ctx),
    metricasCampana(ctx, id),
    correosDeCampana(ctx, id, { estado: spGet(sp, "estado"), take: 100 }),
  ]);
  const seg = c.segmentoId ? segmentos.find((s) => s.id === c.segmentoId) : null;
  const chips = seg ? [`Segmento: ${seg.nombre}`] : describirDef(normalizarDef(c.definicionSegmento), nombresDesdeOpciones(opciones));
  const enviados = Math.max(m.enviados, c.enviados);
  const aperturas = Math.max(m.abiertos, c.aperturas);
  const clics = Math.max(m.clics, c.clics);

  return (
    <>
      <PageHeader
        volver="/comunicaciones"
        titulo={c.asunto}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={c.estado} />
            {c.tipo !== "GENERAL" && <Badge variant="outline">{label(c.tipo)}</Badge>}
            {c.programadaPara && (
              <span>
                {c.estado === "PROGRAMADA" ? "Programada para" : "Enviada"} {fechaHora(c.programadaPara)}
              </span>
            )}
          </span>
        }
        acciones={
          c.tipo === "GENERAL" ? (
            <>
              {c.estado === "PROGRAMADA" && (
                <ActionButton action={enviarCampanaAction} input={{ id }} confirm="¿Enviar la campaña ahora?" successMessage="Campaña enviada a la cola">
                  <Send /> Enviar ahora
                </ActionButton>
              )}
              {["PROGRAMADA", "ENVIANDO"].includes(c.estado) || (c.estado === "ENVIADA" && m.pendientes > 0) ? (
                <ActionButton action={cancelarCampanaAction} input={{ id }} variant="outline" confirm="¿Cancelar los correos que aún no han salido?" successMessage="Campaña cancelada">
                  <XCircle /> Cancelar
                </ActionButton>
              ) : null}
              <ActionButton action={duplicarCampanaAction} input={{ id }} variant="outline" redirectTo="/comunicaciones/{id}" successMessage="Campaña duplicada">
                <Copy /> Duplicar
              </ActionButton>
              {["BORRADOR", "CANCELADA"].includes(c.estado) && (
                <ActionButton action={eliminarCampanaAction} input={{ id }} variant="ghost" confirm="¿Eliminar esta campaña?" redirectTo="/comunicaciones" successMessage="Campaña eliminada">
                  Eliminar
                </ActionButton>
              )}
            </>
          ) : null
        }
      />

      {editable ? (
        <Section titulo="Editar campaña">
          <div className="max-w-2xl">
            <CampanaForm
              guardar={guardarCampanaAction}
              previa={vistaPreviaCorreoAction}
              contar={contarSegmentoAction}
              opciones={opciones}
              segmentos={segmentos.map((s) => ({ value: s.id, label: s.nombre }))}
              variables={[...VARIABLES_CORREO]}
              inicial={{
                id: c.id,
                asunto: c.asunto,
                plantilla: c.plantilla,
                segmentoId: c.segmentoId,
                definicion: c.definicionSegmento,
                adjuntos: c.adjuntos,
                programadaPara: c.programadaPara ? isoDateTimeLocal(c.programadaPara) : null,
              }}
            />
          </div>
        </Section>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <StatCard label="Destinatarios" value={c.totalDestinatarios || m.total} />
            <StatCard label="Enviados" value={enviados} hint={m.pendientes ? `${m.pendientes} en cola` : undefined} tone="success" />
            <StatCard label="Aperturas" value={aperturas} hint={enviados ? pct((aperturas / enviados) * 100) : undefined} />
            <StatCard label="Clics" value={clics} hint={enviados ? pct((clics / enviados) * 100) : undefined} />
            <StatCard label="Rebotes / errores" value={Math.max(m.errores, c.rebotes)} tone={m.errores || c.rebotes ? "warning" : "default"} />
          </div>
          <Section titulo="Destinatarios">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((ch) => (
                <Badge key={ch} variant="secondary">
                  {ch}
                </Badge>
              ))}
            </div>
          </Section>
          <Section titulo="Mensaje">
            <div className={`rounded-xl border bg-card p-4 text-sm ${PROSE}`} dangerouslySetInnerHTML={{ __html: sanitizarHtml(c.plantilla) }} />
            {c.adjuntos.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {c.adjuntos.map((a) => (
                  <li key={a}>
                    <a href={a} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-muted">
                      <FileText className="size-4" /> {decodeURIComponent(a.split("/").pop() ?? "").replace(/^[a-f0-9]{16}-/, "")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section titulo={`Correos (${correos.total})`}>
            <DataList
              rows={correos.items}
              rowKey={(r) => r.id}
              columns={[
                { key: "para", header: "Para", primary: true, cell: (r) => r.para },
                { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
                { key: "env", header: "Enviado", cell: (r) => fechaHora(r.enviadoEn) },
                { key: "ab", header: "Abierto", cell: (r) => (r.abiertoEn ? fechaHora(r.abiertoEn) : "—") },
                { key: "cl", header: "Clic", cell: (r) => (r.clicEn ? fechaHora(r.clicEn) : "—") },
                { key: "err", header: "Error", hideOnMobile: true, cell: (r) => (r.estado === "ERROR" ? <span className="text-destructive">{r.error}</span> : "") },
              ]}
            />
            {correos.total > correos.items.length && <p className="mt-2 text-xs text-muted-foreground">Mostrando los primeros {correos.items.length} de {correos.total}.</p>}
          </Section>
        </>
      )}
    </>
  );
}
