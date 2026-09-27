import Link from "next/link";
import { Plus, Ticket } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { insensitive, pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { ListToolbar } from "@/components/app/list-toolbar";
import { Pager } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { ticketNovedadAction } from "../actions";
import { KTitle } from "../_components/kiosk";

export const metadata = { title: "Novedades" };

const TIPOS = ["RUIDO", "DANO", "EMERGENCIA", "INCIDENTE", "SEGURIDAD", "SERVICIOS", "OTRO"] as const;
const SEV = ["BAJA", "MEDIA", "ALTA", "CRITICA"] as const;

export default async function NovedadesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["porteria.novedades", "porteria.ver"]);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const where: Prisma.NovedadWhereInput = {
    ...(spGet(sp, "tipo") ? { tipo: spGet(sp, "tipo") as never } : {}),
    ...(spGet(sp, "severidad") ? { severidad: spGet(sp, "severidad") as never } : {}),
    ...(spGet(sp, "q") ? { descripcion: insensitive(spGet(sp, "q")!) } : {}),
  };
  const [rows, total] = await Promise.all([ctx.db.novedad.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }), ctx.db.novedad.count({ where })]);
  const unidades = await ctx.db.unidad.findMany({ where: { id: { in: rows.map((r) => r.unidadId).filter(Boolean) as string[] } }, select: { id: true, codigo: true } });
  const uMap = new Map(unidades.map((u) => [u.id, u.codigo]));
  const tickets = await ctx.db.ticket.findMany({ where: { id: { in: rows.map((r) => r.ticketId).filter(Boolean) as string[] } }, select: { id: true, radicado: true } });
  const tMap = new Map(tickets.map((t) => [t.id, t.radicado]));
  return (
    <>
      <KTitle
        acciones={
          can(ctx, "porteria.novedades") && (
            <Link href="/porteria/novedades/nueva" className="inline-flex h-14 items-center gap-2 rounded-xl bg-primary px-5 text-lg font-bold text-primary-foreground">
              <Plus className="size-6" /> Nueva novedad
            </Link>
          )
        }
      >
        Novedades
      </KTitle>
      <ListToolbar
        placeholder="Buscar en la descripción…"
        exportRecurso="novedades"
        filters={[
          { name: "tipo", label: "Tipo", options: options(TIPOS) },
          { name: "severidad", label: "Severidad", options: options(SEV) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState titulo="Sin novedades" descripcion="Las novedades del turno aparecerán aquí." />
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li key={n.id} className="rounded-2xl border-2 bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={n.severidad} />
                <span className="text-base font-bold">{label(n.tipo)}</span>
                {n.unidadId && <span className="rounded bg-muted px-1.5 text-sm font-semibold">{uMap.get(n.unidadId)}</span>}
                <span className="ml-auto text-sm text-muted-foreground">{fechaHora(n.createdAt)}</span>
              </div>
              <p className="mt-1 text-base">{n.descripcion}</p>
              {n.fotos.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {n.fotos.map((f) => (
                    <a key={f} href={f} target="_blank"><img src={f} alt="Foto de la novedad" className="size-16 rounded-lg object-cover" /></a>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {n.notificada && <span className="text-muted-foreground">✉️ Notificada a la administración</span>}
                {n.ticketId ? (
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Ticket className="size-4" /> Ticket {tMap.get(n.ticketId)}
                  </span>
                ) : (
                  can(ctx, ["porteria.novedades", "tickets.crear"]) && (
                    <ActionButton action={ticketNovedadAction} input={{ id: n.id }} variant="outline" size="sm" successMessage="Ticket creado">
                      <Ticket /> Crear ticket
                    </ActionButton>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/porteria/novedades" />
    </>
  );
}
