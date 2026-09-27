import { BellRing, Phone } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fechaHora, tiempoRelativo } from "@/lib/format";
import { pageParams, spFlat, type SP } from "@/lib/pagination";
import { listarAlertas, TIPO_ALERTA_LABEL } from "@/lib/emergencias/service";
import { Section } from "@/components/app/page-header";
import { Pager } from "@/components/app/data-list";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { atenderAlertaAction } from "../actions";
import { AlertasEnVivo } from "./en-vivo";

export const metadata = { title: "Alertas de emergencia" };

export default async function AlertasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["emergencias.gestionar", "porteria.ver"]);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 20);
  const [activas, historial] = await Promise.all([listarAlertas(ctx, { activas: true, take: 50 }), listarAlertas(ctx, { skip, take })]);
  const verTel = can(ctx, "campos.persona_telefono") || can(ctx, "porteria.ver");
  return (
    <>
      <AlertasEnVivo />
      <Section titulo="Activas">
        {activas.rows.length === 0 ? (
          <EmptyState icon={BellRing} titulo="No hay alertas activas" descripcion="Cuando un residente use el botón de pánico o se active una emergencia, aparecerá aquí en tiempo real." />
        ) : (
          <ul className="space-y-2">
            {activas.rows.map((a) => (
              <li key={a.id} className="rounded-xl border-2 border-red-600 bg-red-50 p-4 dark:bg-red-950/30">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-red-700 dark:text-red-400">
                      {TIPO_ALERTA_LABEL[a.tipo]}
                      {a.unidad && ` — ${a.unidad.codigo}`}
                    </p>
                    <p className="text-sm">
                      {a.unidad?.torre?.nombre && `${a.unidad.torre.nombre} · piso ${a.unidad.piso ?? "—"} · `}
                      {a.usuario?.nombre ?? "Portería"} · {tiempoRelativo(a.createdAt)}
                    </p>
                    {a.mensaje && <p className="mt-1 text-sm">“{a.mensaje}”</p>}
                  </div>
                  {verTel && a.usuario?.telefono && (
                    <a href={`tel:${a.usuario.telefono}`} className="inline-flex h-11 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium">
                      <Phone className="size-4" /> Llamar
                    </a>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <ActionButton action={atenderAlertaAction} input={{ id: a.id }} successMessage="Alerta atendida" className="flex-1 sm:flex-none">
                    Marcar atendida
                  </ActionButton>
                  <ActionButton action={atenderAlertaAction} input={{ id: a.id, falsaAlarma: true }} variant="outline" confirm="¿Marcar como falsa alarma?" successMessage="Registrada como falsa alarma">
                    Falsa alarma
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section titulo="Historial">
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {historial.rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="block font-medium">
                  {TIPO_ALERTA_LABEL[a.tipo]}
                  {a.unidad && ` · ${a.unidad.codigo}`}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {fechaHora(a.createdAt)} · {a.usuario?.nombre ?? a.origen.toLowerCase()}
                  {a.atendidaEn && ` · atendida ${fechaHora(a.atendidaEn)}${a.atendidaPor ? ` por ${a.atendidaPor}` : ""}`}
                </span>
                {a.mensaje && <span className="block truncate text-xs text-muted-foreground">{a.mensaje}</span>}
              </span>
              <StatusBadge value={a.estado} />
            </li>
          ))}
          {historial.rows.length === 0 && <li className="p-4 text-muted-foreground">Sin alertas registradas.</li>}
        </ul>
        <Pager page={page} pageSize={pageSize} total={historial.total} searchParams={spFlat(sp)} basePath="/emergencias/alertas" />
      </Section>
    </>
  );
}
