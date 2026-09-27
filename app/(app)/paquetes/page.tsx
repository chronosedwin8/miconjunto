import Link from "next/link";
import { Package, PackageCheck, UserPlus } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { misPaquetes } from "@/lib/paqueteria/service";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "Mis paquetes" };

/** Vista del residente: paquetes en portería, entregados y quién puede recogerlos. */
export default async function MisPaquetesPage() {
  const ctx = await requirePage(["paqueteria.ver", "paqueteria.ver_todos"]);
  const { enPorteria, entregados, autorizados } = await misPaquetes(ctx);
  const variasUnidades = ctx.unidadIds.length > 1;
  return (
    <>
      <PageHeader titulo="Mis paquetes" descripcion="Te avisamos apenas llega algo a portería." />
      <Section titulo={`En portería (${enPorteria.length})`}>
        {enPorteria.length === 0 ? (
          <EmptyState icon={Package} titulo="No tienes paquetes pendientes" descripcion="Cuando portería reciba algo para tu unidad, te llegará una notificación." />
        ) : (
          <ul className="space-y-2">
            {enPorteria.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", p.dias >= 3 && "border-warning/50 bg-warning/5")}>
                {p.fotoUrl ? (
                  <img src={p.fotoUrl} alt="Foto del paquete" className="size-14 rounded-lg object-cover" />
                ) : (
                  <span className="grid size-14 place-items-center rounded-lg bg-muted">
                    <Package className="size-6" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {label(p.tipo)}
                    {p.transportadora && ` · ${p.transportadora}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Llegó {fechaHora(p.llegadaEn)}
                    {p.destinatario && ` · para ${p.destinatario}`}
                    {variasUnidades && ` · ${p.unidad.codigo}`}
                  </p>
                  {p.dias >= 1 && <p className={cn("text-xs font-medium", p.dias >= 3 ? "text-warning" : "text-muted-foreground")}>Lleva {p.dias} día(s) en portería</p>}
                </div>
                <StatusBadge value={p.estado} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        titulo="¿Quién puede recogerlos?"
        acciones={
          can(ctx, "residentes.crear") && (
            <Link href="/mi-hogar" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              <UserPlus className="size-4" /> Agregar autorizado
            </Link>
          )
        }
      >
        <p className="mb-2 text-sm text-muted-foreground">Portería solo entrega a estas personas (residentes mayores de 14 años y autorizados para paquetes), con firma o foto.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {autorizados.map((a) => (
            <li key={`${a.unidad}-${a.personaId}`} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              {a.fotoUrl ? (
                <img src={a.fotoUrl} alt="" className="size-10 rounded-full object-cover" />
              ) : (
                <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-semibold">{a.nombre.slice(0, 1)}</span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{a.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {label(a.tipo)}
                  {variasUnidades && ` · ${a.unidad}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section titulo="Entregados recientemente">
        {entregados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay entregas.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {entregados.map((p) => (
              <li key={p.id} className="flex items-center gap-3 p-3 text-sm">
                <PackageCheck className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {label(p.tipo)}
                    {p.transportadora && ` · ${p.transportadora}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.estado === "ENTREGADO" ? `Entregado a ${p.recogidoPor ?? "—"} · ${fechaHora(p.entregadoEn)}` : `Devuelto · ${fechaHora(p.entregadoEn)}`}
                  </span>
                </span>
                <StatusBadge value={p.estado} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
