import Link from "next/link";
import { Archive, EyeOff, Eye, Pencil, Phone, Pin, PinOff, Trash2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fechaHora, pct, tiempoRelativo } from "@/lib/format";
import { label } from "@/lib/labels";
import { metaDe } from "@/lib/muro/contenido";
import { detallePublicacion, esGestorMuro, estadisticasLectura, registrarLectura } from "@/lib/muro/service";
import { describirDef, nombresDesdeOpciones, normalizarDef, opcionesSegmento } from "@/lib/segmentos";
import { PageHeader, Section } from "@/components/app/page-header";
import { ActionButton, ActionForm } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BloquesView } from "../_components/bloques-view";
import { CategoriaChip } from "../_components/tarjeta";
import { Reacciones } from "../_components/reacciones";
import {
  archivarPublicacionAction,
  comentarAction,
  eliminarComentarioAction,
  eliminarPublicacionAction,
  fijarPublicacionAction,
  moderarComentarioAction,
  moderarPublicacionAction,
  reaccionarAction,
} from "../actions";

export const metadata = { title: "Publicación" };

export default async function PublicacionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["comunicaciones.ver", "clasificados.ver"]);
  const { id } = await params;
  const d = await detallePublicacion(ctx, id);
  const p = d.publicacion;
  if (p.estado === "PUBLICADA") await registrarLectura(ctx, id);
  const gestor = esGestorMuro(ctx);
  const esAutor = p.autorId === ctx.userId;
  const esClasificado = p.categoria === "CLASIFICADO";
  const meta = metaDe(p.contenido);
  const [stats, audiencia, encuesta] = await Promise.all([
    gestor || esAutor ? estadisticasLectura(ctx, id) : null,
    gestor && (p.segmentoId || p.audiencia)
      ? p.segmentoId
        ? ctx.db.segmento.findUnique({ where: { id: p.segmentoId }, select: { nombre: true } }).then((s) => [`Segmento: ${s?.nombre ?? "eliminado"}`])
        : opcionesSegmento(ctx).then((o) => describirDef(normalizarDef(p.audiencia), nombresDesdeOpciones(o)))
      : null,
    p.encuestaId ? ctx.db.encuesta.findUnique({ where: { id: p.encuestaId }, select: { id: true, titulo: true } }) : null,
  ]);
  const puedeComentar = p.permiteComentarios && p.estado === "PUBLICADA" && can(ctx, "comunicaciones.comentar");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        volver={esClasificado ? "/clasificados" : "/muro"}
        titulo={p.titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <CategoriaChip categoria={p.categoria} />
            {p.fijada && (
              <Badge variant="secondary">
                <Pin /> Fijada
              </Badge>
            )}
            {p.estado !== "PUBLICADA" && <Badge variant="warning">{label(p.estado)}</Badge>}
            <span>
              {p.autor.nombre} · {tiempoRelativo(p.createdAt)}
            </span>
          </span>
        }
      />

      {p.estado === "PENDIENTE_MODERACION" && d.moderador && (
        <div className="mb-4 space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-medium">Este clasificado espera tu revisión.</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton action={moderarPublicacionAction} input={{ id, decision: "APROBAR" }} successMessage="Publicado">
              Aprobar y publicar
            </ActionButton>
            <Button variant="outline" render={<Link href="/clasificados/moderacion" />}>
              Rechazar con motivo
            </Button>
          </div>
        </div>
      )}
      {p.estado === "PENDIENTE_MODERACION" && esAutor && !d.moderador && (
        <p className="mb-4 rounded-xl bg-warning/10 p-3 text-sm">Tu publicación está en revisión. Te avisaremos cuando la administración la apruebe.</p>
      )}

      {esClasificado && (
        <div className="mb-4 space-y-3">
          {p.precio !== null && <p className="text-2xl font-bold text-primary">{cop(p.precio)}</p>}
          {meta?.subcategoria && <Badge variant="outline">{label(meta.subcategoria)}</Badge>}
          {p.imagenes.length > 0 && (
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
              {p.imagenes.map((u) => (
                <img key={u} src={u} alt="" className="h-60 w-[85%] shrink-0 snap-center rounded-xl object-cover sm:w-80" />
              ))}
            </div>
          )}
        </div>
      )}

      <BloquesView contenido={p.contenido} encuestas={encuesta ? { [encuesta.id]: encuesta.titulo } : {}} />

      {esClasificado && meta?.contacto && (
        <a href={/^[\d +]+$/.test(meta.contacto) ? `tel:${meta.contacto.replace(/\s/g, "")}` : undefined} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border bg-card px-3 text-sm">
          <Phone className="size-4 text-primary" /> Contacto: <b>{meta.contacto}</b>
        </a>
      )}

      {p.venceEn && <p className="mt-4 text-xs text-muted-foreground">Visible hasta el {fechaHora(p.venceEn)}</p>}

      {p.estado === "PUBLICADA" && (
        <div className="mt-5">
          <Reacciones id={id} conteos={d.reacciones} mia={d.miReaccion} accion={reaccionarAction} deshabilitado={!can(ctx, ["comunicaciones.comentar", "clasificados.ver"])} />
        </div>
      )}

      {(gestor || esAutor || d.moderador) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
          {(gestor || (esAutor && esClasificado)) && (
            <Button variant="outline" size="sm" render={<Link href={esClasificado ? `/clasificados/${id}/editar` : `/muro/${id}/editar`} />}>
              <Pencil /> Editar
            </Button>
          )}
          {gestor && !esClasificado && (
            <ActionButton action={fijarPublicacionAction} input={{ id, fijada: !p.fijada }} variant="outline" size="sm" successMessage={p.fijada ? "Desfijada" : "Fijada"}>
              {p.fijada ? <PinOff /> : <Pin />} {p.fijada ? "Desfijar" : "Fijar"}
            </ActionButton>
          )}
          {p.estado === "PUBLICADA" && (
            <ActionButton action={archivarPublicacionAction} input={{ id }} variant="outline" size="sm" confirm="¿Archivar la publicación? Dejará de verse en el muro." successMessage="Archivada">
              <Archive /> {esClasificado ? "Marcar vendido / terminado" : "Archivar"}
            </ActionButton>
          )}
          <ActionButton action={eliminarPublicacionAction} input={{ id }} variant="ghost" size="sm" confirm="¿Eliminar la publicación?" redirectTo={esClasificado ? "/clasificados" : "/muro"} successMessage="Eliminada">
            <Trash2 /> Eliminar
          </ActionButton>
        </div>
      )}

      {stats && (
        <Section titulo="Alcance" className="mt-6">
          <div className="rounded-xl border bg-card p-4 text-sm">
            <p>
              Leída por <b className="tabular-nums">{stats.lecturas}</b> de <b className="tabular-nums">{stats.destinatarios}</b> destinatarios ({pct(stats.porcentaje, 0)}).
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${stats.porcentaje}%` }} />
            </div>
            {audiencia && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {audiencia.map((a) => (
                  <Badge key={a} variant="secondary">
                    {a}
                  </Badge>
                ))}
              </div>
            )}
            {gestor && stats.lectores.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-primary">Ver quién la leyó</summary>
                <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                  {stats.lectores.map((l, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{l.nombre}</span>
                      <span className="text-muted-foreground">{fechaHora(l.fecha)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Section>
      )}

      {(p.permiteComentarios || d.comentarios.length > 0) && (
        <Section titulo={`Comentarios (${d.comentarios.filter((c) => !c.oculto).length})`} className="mt-6">
          <ul className="space-y-2">
            {d.comentarios.map((c) => (
              <li key={c.id} className={cn("rounded-xl border bg-card p-3", c.oculto && "border-dashed opacity-70")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">
                    <b>{c.autorNombre}</b> <span className="text-xs text-muted-foreground">· {tiempoRelativo(c.createdAt)}</span>
                  </p>
                  <div className="flex shrink-0 gap-1">
                    {d.moderador && (
                      <ActionButton
                        action={moderarComentarioAction}
                        input={{ id: c.id, oculto: !c.oculto, publicacionId: id }}
                        variant="ghost"
                        size="icon-sm"
                        successMessage={c.oculto ? "Comentario visible" : "Comentario oculto"}
                      >
                        {c.oculto ? <Eye aria-label="Mostrar comentario" /> : <EyeOff aria-label="Ocultar comentario" />}
                      </ActionButton>
                    )}
                    {c.autorId === ctx.userId && (
                      <ActionButton action={eliminarComentarioAction} input={{ id: c.id, publicacionId: id }} variant="ghost" size="icon-sm" confirm="¿Eliminar tu comentario?">
                        <Trash2 aria-label="Eliminar comentario" />
                      </ActionButton>
                    )}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm">{c.contenido}</p>
                {c.oculto && <p className="mt-1 text-xs text-muted-foreground">Oculto por moderación{c.autorId === ctx.userId ? " (solo tú y la administración lo ven)" : ""}.</p>}
              </li>
            ))}
          </ul>
          {puedeComentar ? (
            <ActionForm action={comentarAction} extra={{ id }} submitLabel="Comentar" resetOnSuccess className="mt-3" successMessage="Comentario publicado">
              <TextAreaField name="contenido" label="Tu comentario" required maxLength={1000} rows={2} placeholder="Escribe un comentario respetuoso…" />
            </ActionForm>
          ) : !p.permiteComentarios ? (
            <p className="mt-2 text-sm text-muted-foreground">Los comentarios están desactivados.</p>
          ) : null}
        </Section>
      )}
    </div>
  );
}
