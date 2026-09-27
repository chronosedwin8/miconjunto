import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ChevronRight, Clock, Users } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fechaHora, hora } from "@/lib/format";
import { label } from "@/lib/labels";
import { zonasReservables } from "@/lib/reservas/service";
import { formatoDuracion, valoresReserva } from "@/lib/reservas/reglas";
import { resumenResidente } from "@/lib/reservas/inicio";
import { PageHeader, Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Reservar zonas comunes" };

export default async function ReservasPage() {
  const ctx = await requirePage(["reservas.ver", "reservas.ver_todos", "reservas.checkin"]);
  if (!can(ctx, "reservas.crear")) redirect(can(ctx, "reservas.checkin") && !can(ctx, "reservas.aprobar") ? "/reservas/checkin" : "/reservas/admin");
  const [zonas, resumen] = await Promise.all([zonasReservables(ctx), ctx.unidadIds.length ? resumenResidente(ctx) : Promise.resolve(null)]);
  return (
    <>
      <PageHeader titulo="Reservar" descripcion="Elige una zona, mira su calendario y aparta tu turno." />
      {resumen && resumen.proximas.length > 0 && (
        <Section titulo="Tus próximas reservas" acciones={<Link href="/reservas/mis" className="text-sm text-primary">Ver todas</Link>}>
          <ul className="space-y-2">
            {resumen.proximas.map((r) => (
              <li key={r.id}>
                <Link href={r.enlace} className="flex items-center gap-3 rounded-xl border bg-card p-3 active:opacity-80">
                  <CalendarClock className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.zona}</p>
                    <p className="text-xs text-muted-foreground">
                      {fechaHora(r.inicio)} – {hora(r.fin)} · {r.unidad}
                    </p>
                  </div>
                  {r.enlacePago ? <Badge variant="warning">Por pagar</Badge> : <StatusBadge value={r.estado} />}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {zonas.length === 0 ? (
        <EmptyState titulo="No hay zonas para reservar" descripcion="Cuando la administración habilite zonas reservables aparecerán aquí." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {zonas.map((z) => {
            const v = valoresReserva({ tarifa: Number(z.tarifa), gravaIva: z.gravaIva, tarifaIva: Number(z.tarifaIva), deposito: Number(z.deposito) });
            return (
              <li key={z.id}>
                <Link href={`/reservas/${z.id}`} className="block overflow-hidden rounded-2xl border bg-card shadow-xs transition active:scale-[0.99] hover:bg-muted/40">
                  {z.fotos[0] ? (
                     
                    <img src={z.fotos[0]} alt={z.nombre} className="h-36 w-full object-cover" />
                  ) : (
                    <div className="grid h-24 place-items-center bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-medium text-primary">{label(z.categoria)}</div>
                  )}
                  <div className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold">{z.nombre}</p>
                      {z.estado !== "ACTIVA" && <StatusBadge value={z.estado === "MANTENIMIENTO" ? "EN_MANTENIMIENTO" : z.estado} />}
                    </div>
                    <p className="text-sm font-medium">{v.total > 0 ? <>{cop(v.total)} <span className="font-normal text-muted-foreground">por turno{v.iva > 0 ? " (IVA incluido)" : ""}</span></> : <span className="text-success">Incluida en la cuota</span>}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {z.capacidad ? (
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" /> {z.capacidad} personas
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" /> {formatoDuracion(z.duracionMinimaMin)} mín.
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {z.requiereAprobacion && <Badge variant="info">Requiere aprobación</Badge>}
                      {v.deposito > 0 && <Badge variant="outline">Depósito {cop(v.deposito)}</Badge>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {can(ctx, "reservas.ver_todos") && (
        <div className="mt-6">
          <Button variant="outline" render={<Link href="/reservas/admin" />}>
            Administrar reservas
          </Button>
        </div>
      )}
    </>
  );
}
