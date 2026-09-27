import Link from "next/link";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { cop, fechaLarga, hora, toNumber } from "@/lib/format";
import { whereReservas } from "@/lib/reservas/service";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Mis reservas" };

export default async function MisReservasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ctx = await requirePage("reservas.ver");
  const { ver } = await searchParams;
  const historial = ver === "historial";
  const ahora = new Date();
  const rows = await ctx.db.reserva.findMany({
    where: {
      AND: [
        whereReservas(ctx, { soloPropias: true }),
        historial ? { OR: [{ fin: { lte: ahora } }, { estado: { in: ["CANCELADA", "RECHAZADA", "CUMPLIDA", "NO_SHOW"] } }] } : { fin: { gt: ahora }, estado: { in: ["SOLICITADA", "APROBADA"] } },
      ],
    },
    include: { zona: { select: { nombre: true, fotos: true } }, unidad: { select: { codigo: true } } },
    orderBy: { inicio: historial ? "desc" : "asc" },
    take: 60,
  });
  return (
    <>
      <PageHeader
        titulo="Mis reservas"
        acciones={
          <Button render={<Link href="/reservas" />}>
            <CalendarPlus /> Reservar
          </Button>
        }
      />
      <nav className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-medium" aria-label="Filtro">
        {[
          { href: "/reservas/mis", label: "Próximas", activo: !historial },
          { href: "/reservas/mis?ver=historial", label: "Historial", activo: historial },
        ].map((t) => (
          <Link key={t.href} href={t.href} aria-current={t.activo ? "page" : undefined} className={t.activo ? "grid h-10 place-items-center rounded-lg bg-background shadow-sm" : "grid h-10 place-items-center rounded-lg text-muted-foreground"}>
            {t.label}
          </Link>
        ))}
      </nav>
      {historial && <p className="-mt-2 mb-3 text-xs text-muted-foreground">Toca una reserva cumplida para calificarla.</p>}
      {rows.length === 0 ? (
        <EmptyState
          titulo={historial ? "Aún no tienes historial" : "No tienes reservas próximas"}
          descripcion="Aparta el salón, la BBQ o la cancha en pocos toques."
          accion={
            <Button render={<Link href="/reservas" />}>
              <CalendarPlus /> Hacer una reserva
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const total = toNumber(r.valor) + toNumber(r.iva) + toNumber(r.deposito);
            return (
              <li key={r.id}>
                <Link href={`/reservas/detalle/${r.id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-3 active:opacity-80">
                  {r.zona.fotos[0] ? (
                     
                    <img src={r.zona.fotos[0]} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">{r.zona.nombre[0]}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.zona.nombre}</p>
                    <p className="truncate text-sm first-letter:uppercase">{fechaLarga(r.inicio)}</p>
                    <p className="text-xs text-muted-foreground">
                      {hora(r.inicio)}–{hora(r.fin)} · {r.unidad.codigo}
                      {total > 0 ? ` · ${cop(total)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge value={r.estado} />
                    {!r.pagada && total > 0 && r.estado === "SOLICITADA" && <Badge variant="warning">Por pagar</Badge>}
                    {r.estado === "CUMPLIDA" && !r.calificacion && <Badge variant="info">Califica</Badge>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
