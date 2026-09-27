import { Gift, Mail, MapPin, Phone, User } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha, num } from "@/lib/format";
import { fichaProveedor } from "@/lib/directorio/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { ActionButton, ActionForm } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { Estrellas } from "../../_components/estrellas";
import { SelectorEstrellas } from "../../_components/selector-estrellas";
import { calificarProveedorAction, eliminarCalificacionAction } from "../../actions";

export const metadata = { title: "Proveedor" };

export default async function ProveedorComunidadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("directorio.proveedores");
  const { id } = await params;
  const { proveedor: p, calificaciones, mia, distribucion } = await fichaProveedor(ctx, id);
  const total = calificaciones.length;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader volver="/directorio/proveedores" titulo={p.razonSocial} descripcion={p.categoria} />
      <div className="mb-5 space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <p className="text-4xl font-bold tabular-nums">{total ? num(p.calificacionPromedio, 1) : "—"}</p>
          <div>
            <Estrellas valor={p.calificacionPromedio} />
            <p className="text-xs text-muted-foreground">{total} calificación{total === 1 ? "" : "es"} de vecinos</p>
          </div>
        </div>
        {total > 0 && (
          <ul className="space-y-1 text-xs">
            {distribucion.map((d) => (
              <li key={d.puntaje} className="flex items-center gap-2">
                <span className="w-3 tabular-nums">{d.puntaje}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full bg-amber-400" style={{ width: `${(d.total / total) * 100}%` }} />
                </span>
                <span className="w-6 text-right tabular-nums text-muted-foreground">{d.total}</span>
              </li>
            ))}
          </ul>
        )}
        {p.tarifas && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Tarifas publicadas</p>
            <p className="whitespace-pre-line text-sm">{p.tarifas}</p>
          </div>
        )}
        {p.beneficioComunidad && (
          <p className="flex items-start gap-1.5 rounded-lg bg-success/10 p-2 text-sm text-success">
            <Gift className="mt-0.5 size-4 shrink-0" /> {p.beneficioComunidad}
          </p>
        )}
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {p.contactoNombre && (
            <p className="flex items-center gap-2">
              <User className="size-4 text-muted-foreground" /> {p.contactoNombre}
            </p>
          )}
          {p.telefono && (
            <a href={`tel:${p.telefono}`} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 hover:bg-muted">
              <Phone className="size-4 text-primary" /> {p.telefono}
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 hover:bg-muted">
              <Mail className="size-4 text-primary" /> <span className="truncate">{p.email}</span>
            </a>
          )}
          {p.direccion && (
            <p className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" /> {p.direccion}
            </p>
          )}
        </div>
      </div>

      {can(ctx, "directorio.calificar") && (
        <Section titulo={mia ? "Tu calificación" : "Califica a este proveedor"}>
          <div className="rounded-2xl border bg-card p-4">
            <ActionForm action={calificarProveedorAction} extra={{ id }} submitLabel={mia ? "Actualizar calificación" : "Enviar calificación"} successMessage="¡Gracias por tu calificación!" submitClassName="w-full">
              <SelectorEstrellas defaultValue={mia?.puntaje ?? 0} />
              <TextAreaField name="comentario" label="Comentario (opcional)" maxLength={500} rows={2} defaultValue={mia?.comentario ?? ""} placeholder="¿Cómo fue el servicio? ¿Cumplió con el precio y el horario?" />
            </ActionForm>
            {mia && (
              <div className="mt-2">
                <ActionButton action={eliminarCalificacionAction} input={{ id }} variant="ghost" size="sm" confirm="¿Eliminar tu calificación?" successMessage="Calificación eliminada">
                  Eliminar mi calificación
                </ActionButton>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section titulo="Opiniones de vecinos">
        {calificaciones.filter((c) => c.comentario).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay comentarios.</p>
        ) : (
          <ul className="space-y-2">
            {calificaciones
              .filter((c) => c.comentario)
              .map((c) => (
                <li key={c.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{c.usuarioNombre}</span>
                    <Estrellas valor={c.puntaje} />
                  </div>
                  <p className="mt-1 text-sm">{c.comentario}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fecha(c.updatedAt)}</p>
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
