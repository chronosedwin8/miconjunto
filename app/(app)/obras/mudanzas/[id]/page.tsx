import Link from "next/link";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha, fechaLarga } from "@/lib/format";
import { label } from "@/lib/labels";
import { obtenerMudanza } from "@/lib/obras/service";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { decidirMudanzaAction, estadoMudanzaAction, verificarPazYSalvoAction } from "../../actions";

export const metadata = { title: "Mudanza" };

export default async function MudanzaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["obras.ver", "obras.ver_todos"]);
  const { id } = await params;
  const m = await obtenerMudanza(ctx, id);
  const gestor = can(ctx, "obras.aprobar");
  const propio = ctx.unidadIds.includes(m.unidadId) || m.solicitanteId === ctx.userId;
  const salida = m.tipo === "SALIDA";
  return (
    <>
      <Link href="/obras/mudanzas" className="text-sm text-muted-foreground">
        ← Mudanzas
      </Link>
      <div className="mt-2 mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">
          {label(m.tipo)} · {m.unidad.codigo}
        </h2>
        <StatusBadge value={m.estado} />
      </div>
      <p className="mb-4 text-sm capitalize text-muted-foreground">
        {fechaLarga(m.fecha)} · {m.horaInicio} a {m.horaFin}
        {m.recurso ? ` · ${m.recurso}` : ""}
      </p>

      {salida && (
        <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3 text-sm ${m.pazYSalvoVerificado ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
          {m.pazYSalvoVerificado ? <ShieldCheck className="size-5 shrink-0 text-success" /> : <TriangleAlert className="size-5 shrink-0 text-warning" />}
          <div className="flex-1">
            <p className="font-medium">{m.pazYSalvoVerificado ? "La unidad está a paz y salvo" : "Paz y salvo pendiente"}</p>
            <p className="text-muted-foreground">{m.pazYSalvoVerificado ? "Se puede autorizar la salida de enseres." : "La salida solo se aprueba cuando la unidad no tenga saldos vencidos."}</p>
          </div>
          {(gestor || propio) && m.estado === "SOLICITADA" && (
            <ActionButton action={verificarPazYSalvoAction} input={{ id: m.id }} size="sm" variant="outline" successMessage="Paz y salvo verificado">
              Verificar
            </ActionButton>
          )}
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        {gestor && m.estado === "SOLICITADA" && (
          <>
            <ActionButton action={decidirMudanzaAction} input={{ id: m.id, aprobar: "true" }} successMessage="Mudanza aprobada">
              Aprobar
            </ActionButton>
            <FormDialog titulo="Rechazar mudanza" action={decidirMudanzaAction} extra={{ id: m.id, aprobar: "false" }} triggerLabel="Rechazar" triggerVariant="outline" submitLabel="Rechazar" successMessage="Mudanza rechazada">
              <TextAreaField name="observaciones" label="Motivo" required />
            </FormDialog>
          </>
        )}
        {gestor && m.estado === "APROBADA" && (
          <ActionButton action={estadoMudanzaAction} input={{ id: m.id, estado: "FINALIZADA" }} variant="outline" successMessage="Mudanza finalizada">
            Marcar finalizada
          </ActionButton>
        )}
        {(gestor || propio) && (m.estado === "SOLICITADA" || m.estado === "APROBADA") && (
          <ActionButton action={estadoMudanzaAction} input={{ id: m.id, estado: "CANCELADA" }} variant="ghost" confirm="¿Cancelar esta mudanza?" successMessage="Mudanza cancelada">
            Cancelar
          </ActionButton>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Section titulo={`Enseres ${salida ? "autorizados para salir" : ""} (${m.enseresLista.length})`}>
          {m.enseresLista.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se relacionaron enseres.</p>
          ) : (
            <ul className="divide-y rounded-xl border bg-card text-sm">
              {m.enseresLista.map((e, i) => (
                <li key={i} className="flex justify-between px-4 py-2.5">
                  <span>{e.descripcion}</span>
                  <span className="tabular-nums text-muted-foreground">× {e.cantidad}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <aside>
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm lg:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Empresa</dt>
              <dd>{m.empresa ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Placa</dt>
              <dd className="font-mono">{m.placaVehiculo ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Solicitada</dt>
              <dd>{fecha(m.createdAt)}</dd>
            </div>
            {m.observaciones && (
              <div className="col-span-2 lg:col-span-1">
                <dt className="text-xs text-muted-foreground">Observaciones</dt>
                <dd className="whitespace-pre-line">{m.observaciones}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </>
  );
}
