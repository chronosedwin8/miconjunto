import Link from "next/link";
import { Bell, CalendarCheck, CreditCard, LifeBuoy, Megaphone, Package, Siren, UserCheck, Users } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { tiempoRelativo } from "@/lib/format";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { listarNotificaciones } from "@/lib/perfil/notificaciones";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Pager } from "@/components/app/data-list";
import { ActionButton } from "@/components/form/action-form";
import { cn } from "@/lib/utils";
import { eliminarLeidasAction, marcarTodasLeidasAction } from "./actions";
import { NotificacionItem } from "./item";

export const metadata = { title: "Notificaciones" };

function icono(tipo: string, titulo: string) {
  const t = `${tipo} ${titulo}`.toUpperCase();
  const cls = "size-4";
  if (t.includes("EMERGENCIA") || t.includes("PÁNICO")) return <Siren className={cn(cls, "text-destructive")} />;
  if (t.includes("PAQUETE")) return <Package className={cls} />;
  if (t.includes("VISITA") || t.includes("PORTERIA")) return <UserCheck className={cls} />;
  if (t.includes("PAGO") || t.includes("CUOTA") || t.includes("CARTERA")) return <CreditCard className={cls} />;
  if (t.includes("RESERVA")) return <CalendarCheck className={cls} />;
  if (t.includes("TICKET") || t.includes("PQRS")) return <LifeBuoy className={cls} />;
  if (t.includes("RESIDENTE") || t.includes("VÍNCULO") || t.includes("ARRENDATARIO")) return <Users className={cls} />;
  if (t.includes("MURO") || t.includes("AVISO")) return <Megaphone className={cls} />;
  return <Bell className={cls} />;
}

export default async function NotificacionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const soloNoLeidas = spGet(sp, "ver") === "no-leidas";
  const { rows, total, noLeidas } = await listarNotificaciones(ctx, { soloNoLeidas, skip, take });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        titulo="Notificaciones"
        descripcion={noLeidas ? `${noLeidas} sin leer` : "Estás al día"}
        acciones={
          <>
            {noLeidas > 0 && (
              <ActionButton action={marcarTodasLeidasAction} variant="outline" size="sm" successMessage="Todas marcadas como leídas">
                Marcar todas como leídas
              </ActionButton>
            )}
            {total > noLeidas && !soloNoLeidas && (
              <ActionButton action={eliminarLeidasAction} variant="ghost" size="sm" confirm="¿Borrar las notificaciones ya leídas?" successMessage="Notificaciones leídas borradas">
                Borrar leídas
              </ActionButton>
            )}
          </>
        }
      />
      <div className="mb-3 flex gap-2" role="tablist">
        {[
          { href: "/notificaciones", label: "Todas", activo: !soloNoLeidas },
          { href: "/notificaciones?ver=no-leidas", label: `Sin leer (${noLeidas})`, activo: soloNoLeidas },
        ].map((t) => (
          <Link key={t.href} href={t.href} role="tab" aria-selected={t.activo} className={cn("inline-flex h-10 items-center rounded-full border px-4 text-sm", t.activo ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
            {t.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          titulo={soloNoLeidas ? "No tienes notificaciones sin leer" : "Aún no tienes notificaciones"}
          descripcion="Aquí verás avisos de paquetes, visitantes, pagos, reservas y comunicados. Activa las notificaciones en tu teléfono para no perderte nada."
          accion={
            <Link href="/perfil/notificaciones" className="text-sm font-medium text-primary underline">
              Configurar notificaciones
            </Link>
          }
        />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((n) => (
            <li key={n.id}>
              <NotificacionItem id={n.id} titulo={n.titulo} cuerpo={n.cuerpo} enlace={n.enlace} leida={n.leida} cuando={tiempoRelativo(n.createdAt)} icono={icono(n.tipo, n.titulo)} />
            </li>
          ))}
        </ul>
      )}
      {total > 0 && <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/notificaciones" />}
    </div>
  );
}
