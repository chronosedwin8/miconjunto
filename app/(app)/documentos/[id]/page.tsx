import { BookCheck, CheckCircle2, Download, FileText, Pencil, Upload } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha, fechaHora, num, pct } from "@/lib/format";
import { label } from "@/lib/labels";
import { acusesDocumento, esGestorDocumentos, obtenerDocumento, whereCarpetaVisible } from "@/lib/documentos/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FileField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACEPTA_DOCS, CamposDocumento } from "../_components/campos";
import { confirmarLecturaAction, eliminarDocumentoAction, guardarDocumentoAction, nuevaVersionAction } from "../actions";

export const metadata = { title: "Documento" };

const tam = (b: number) => (b > 1_048_576 ? `${num(b / 1_048_576, 1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("documentos.ver");
  const { id } = await params;
  const d = await obtenerDocumento(ctx, id);
  const gestor = esGestorDocumentos(ctx);
  const actual = d.versiones.find((v) => v.version === d.versionActual) ?? d.versiones[0];
  const [acuses, carpetas, roles] = await Promise.all([
    gestor && d.requiereAcuse ? acusesDocumento(ctx, id) : null,
    gestor ? ctx.db.carpetaDocumento.findMany({ where: whereCarpetaVisible(ctx), orderBy: { nombre: "asc" } }) : [],
    gestor ? ctx.db.rol.findMany({ orderBy: { nombre: "asc" }, select: { clave: true, nombre: true } }) : [],
  ]);
  const rolNombre = new Map(roles.map((r) => [r.clave, r.nombre]));
  const descarga = (v?: number) => `/api/v1/documentos/${id}/archivo${v ? `?version=${v}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        volver="/documentos"
        titulo={d.titulo}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{label(d.categoria)}</Badge>
            {d.carpeta && <span>{d.carpeta.nombre}</span>}
            <span>Versión {d.versionActual}</span>
            {!d.publicado && <Badge variant="secondary">Borrador</Badge>}
          </span>
        }
        acciones={
          gestor ? (
            <>
              {can(ctx, ["documentos.crear", "documentos.editar"]) && (
                <>
                  <FormDialog
                    titulo="Subir nueva versión"
                    descripcion={d.requiereAcuse ? "Los residentes deberán confirmar la lectura de la nueva versión." : undefined}
                    action={nuevaVersionAction}
                    extra={{ id }}
                    submitLabel="Publicar versión"
                    successMessage="Nueva versión publicada"
                    trigger={
                      <Button variant="outline">
                        <Upload /> Nueva versión
                      </Button>
                    }
                  >
                    <FileField name="archivoUrl" label="Archivo" accept={ACEPTA_DOCS} capture={false} folder="documentos" />
                    <TextField name="notas" label="¿Qué cambió?" maxLength={500} placeholder="Ej.: Reforma aprobada en asamblea de marzo" />
                    <CheckboxField name="notificar" label="Notificar a quienes pueden verlo" defaultChecked={d.requiereAcuse} />
                  </FormDialog>
                  <FormDialog
                    titulo="Editar documento"
                    action={guardarDocumentoAction}
                    extra={{ id }}
                    wide
                    successMessage="Documento actualizado"
                    trigger={
                      <Button variant="outline">
                        <Pencil /> Editar
                      </Button>
                    }
                  >
                    <CamposDocumento carpetas={carpetas.map((c) => ({ value: c.id, label: c.nombre }))} roles={roles.map((r) => ({ value: r.clave, label: r.nombre }))} inicial={d} />
                  </FormDialog>
                </>
              )}
              {can(ctx, "documentos.eliminar") && (
                <ActionButton action={eliminarDocumentoAction} input={{ id }} variant="ghost" confirm="¿Eliminar el documento y todas sus versiones?" redirectTo="/documentos" successMessage="Documento eliminado">
                  Eliminar
                </ActionButton>
              )}
            </>
          ) : null
        }
      />

      {d.descripcion && <p className="mb-4 text-sm text-muted-foreground">{d.descripcion}</p>}

      <div className="mb-5 space-y-3 rounded-2xl border bg-card p-4">
        {actual ? (
          <a href={descarga()} target="_blank" className="flex min-h-14 items-center gap-3 rounded-xl bg-primary/5 px-3 hover:bg-primary/10">
            <FileText className="size-7 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{actual.nombreArchivo}</span>
              <span className="text-xs text-muted-foreground">
                {tam(actual.tamano)} · {fecha(actual.createdAt)}
              </span>
            </span>
            <Download className="size-5 text-primary" />
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">Este documento no tiene archivo.</p>
        )}
        {d.requiereAcuse &&
          (d.acusado ? (
            <p className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="size-5" /> Confirmaste la lectura de la versión {d.versionActual} el {fechaHora(d.acusadoEn)}.
            </p>
          ) : (
            <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm">La administración pide confirmar que leíste este documento.</p>
              <ActionButton action={confirmarLecturaAction} input={{ id }} successMessage="¡Gracias! Lectura confirmada" className="w-full">
                <BookCheck /> Leí el documento
              </ActionButton>
            </div>
          ))}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {d.vence && (
            <div>
              <dt className="text-xs text-muted-foreground">Vence</dt>
              <dd className={d.vence < new Date() ? "font-medium text-destructive" : ""}>{fecha(d.vence)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Visible para</dt>
            <dd>{d.rolesVisibles.length ? d.rolesVisibles.map((r) => rolNombre.get(r) ?? label(r)).join(", ") : "Todos"}</dd>
          </div>
          {d.codigoVerificacion && (
            <div>
              <dt className="text-xs text-muted-foreground">Código de verificación</dt>
              <dd className="font-mono">{d.codigoVerificacion}</dd>
            </div>
          )}
        </dl>
      </div>

      {acuses && (
        <Section titulo="Confirmaciones de lectura">
          <div className="rounded-2xl border bg-card p-4 text-sm">
            <p>
              Versión {acuses.version}: <b className="tabular-nums">{acuses.leidos.length}</b> de <b className="tabular-nums">{acuses.total}</b> confirmaron ({pct(acuses.total ? (acuses.leidos.length / acuses.total) * 100 : 0, 0)}).
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-success" style={{ width: `${acuses.total ? (acuses.leidos.length / acuses.total) * 100 : 0}%` }} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <details open={acuses.leidos.length <= 10}>
                <summary className="cursor-pointer font-medium">Leyeron ({acuses.leidos.length})</summary>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {acuses.leidos.map((a) => (
                    <li key={a.usuarioId} className="flex justify-between gap-2">
                      <span className="truncate">{a.nombre}</span>
                      <span className="shrink-0 text-muted-foreground">{fecha(a.leidoEn)}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary className="cursor-pointer font-medium">Pendientes ({acuses.pendientes.length})</summary>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                  {acuses.pendientes.map((a) => (
                    <li key={a.usuarioId} className="truncate">
                      {a.nombre}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </Section>
      )}

      <Section titulo="Historial de versiones">
        <ul className="divide-y rounded-2xl border bg-card">
          {d.versiones.map((v) => (
            <li key={v.id} className="flex items-center gap-3 p-3 text-sm">
              <Badge variant={v.version === d.versionActual ? "default" : "outline"}>v{v.version}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{v.nombreArchivo}</span>
                <span className="text-xs text-muted-foreground">
                  {fechaHora(v.createdAt)}
                  {v.notas ? ` · ${v.notas}` : ""}
                </span>
              </span>
              <a href={descarga(v.version)} target="_blank" className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label={`Descargar versión ${v.version}`}>
                <Download className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
