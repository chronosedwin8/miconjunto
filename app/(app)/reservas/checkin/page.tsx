import Link from "next/link";
import { ChevronLeft, ChevronRight, LogIn, LogOut, Phone, UserX } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fechaLarga, hora } from "@/lib/format";
import { nombrePersona, reservasDelDia } from "@/lib/reservas/service";
import { checklistActa, fechaLocal, sumarDias } from "@/lib/reservas/reglas";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { ActaDialog, BotonGrande } from "../componentes";
import { noShowAction } from "../actions";

export const metadata = { title: "Check-in de reservas" };

export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const ctx = await requirePage("reservas.checkin");
  const hoy = fechaLocal(new Date());
  const { dia: d } = await searchParams;
  const dia = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : hoy;
  const rs = await reservasDelDia(ctx, dia);
  const personas = await Promise.all(rs.map((r) => nombrePersona(ctx.db, r.personaId)));
  const ahora = Date.now();
  return (
    <>
      <PageHeader titulo="Reservas del día" descripcion="Entrega y recepción de zonas con acta y fotos." />
      <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border bg-card p-1">
        <Link href={`/reservas/checkin?dia=${sumarDias(dia, -1)}`} className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Día anterior">
          <ChevronLeft className="size-5" />
        </Link>
        <p className="text-center font-semibold first-letter:uppercase">{dia === hoy ? "Hoy · " : ""}{fechaLarga(`${dia}T12:00:00-05:00`)}</p>
        <Link href={`/reservas/checkin?dia=${sumarDias(dia, 1)}`} className="grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label="Día siguiente">
          <ChevronRight className="size-5" />
        </Link>
      </div>
      {rs.length === 0 ? (
        <EmptyState titulo="No hay reservas este día" descripcion="Las reservas aprobadas aparecerán aquí para el check-in." />
      ) : (
        <ul className="space-y-3">
          {rs.map((r, i) => {
            const p = personas[i];
            const items = checklistActa(r.zona.categoria);
            const puedeIn = r.estado === "APROBADA" && !r.checkInEn && ahora >= r.inicio.getTime() - 2 * 3600000 && ahora <= r.fin.getTime();
            const puedeOut = !!r.checkInEn && !r.checkOutEn;
            const noShow = r.estado === "APROBADA" && !r.checkInEn && ahora > r.inicio.getTime();
            return (
              <li key={r.id} className="rounded-2xl border bg-card p-4">
                <Link href={`/reservas/detalle/${r.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-semibold">{r.zona.nombre}</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {hora(r.inicio)}–{hora(r.fin)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge value={r.estado} />
                      {r.checkOutEn ? <Badge variant="success">Recibida</Badge> : r.checkInEn ? <Badge variant="info">En uso</Badge> : null}
                      {r.estado === "SOLICITADA" && <Badge variant="warning">{r.pagada ? "Sin aprobar" : "Sin pagar"}</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-sm">
                    <b>{r.unidad.codigo}</b>
                    {p ? ` · ${p.nombre}` : ""} · {r.asistentes} personas
                  </p>
                </Link>
                {p?.telefono && (
                  <a href={`tel:${p.telefono}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm text-primary">
                    <Phone className="size-4" /> Llamar
                  </a>
                )}
                {(puedeIn || puedeOut || noShow) && (
                  <div className="mt-3 flex gap-2">
                    {puedeIn && (
                      <ActaDialog
                        id={r.id}
                        tipo="entrega"
                        items={items}
                        zona={r.zona.nombre}
                        trigger={
                          <BotonGrande>
                            <LogIn /> Check-in
                          </BotonGrande>
                        }
                      />
                    )}
                    {puedeOut && (
                      <ActaDialog
                        id={r.id}
                        tipo="recepcion"
                        items={items}
                        zona={r.zona.nombre}
                        trigger={
                          <BotonGrande variant="secondary">
                            <LogOut /> Check-out
                          </BotonGrande>
                        }
                      />
                    )}
                    {noShow && (
                      <ActionButton action={noShowAction} input={{ id: r.id }} variant="outline" size="lg" className="h-14 flex-1 text-base" confirm="¿Marcar que no se presentó?" successMessage="Marcada como no se presentó">
                        <UserX /> No llegó
                      </ActionButton>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
