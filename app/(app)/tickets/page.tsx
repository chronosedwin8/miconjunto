import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can, seesAll } from "@/lib/permisos";
import { spFlat, pageParams, type SP } from "@/lib/pagination";
import { fecha } from "@/lib/format";
import { options } from "@/lib/labels";
import { torreOptions } from "@/lib/conjunto/options";
import { listarTickets, opcionesAsignacion, whereFiltros } from "@/lib/tickets/service";
import { ESTADOS_ABIERTOS, PRIORIDADES, TIPOS_TICKET, estadoSla } from "@/lib/tickets/reglas";
import { PageHeader } from "@/components/app/page-header";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Pager } from "@/components/app/data-list";
import { Button } from "@/components/ui/button";
import { TableroTickets, type TarjetaTicket } from "./tablero";
import { SlaBadge, TipoIcono } from "./ui";
import { TabsGestion } from "./tabs";

export const metadata = { title: "PQRS y daños" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["tickets.ver", "tickets.ver_todos"]);
  const sp = await searchParams;
  const f = spFlat(sp);
  const gestion = seesAll(ctx, "tickets");
  const puedeCrear = can(ctx, "tickets.crear");
  const botonNuevo = puedeCrear ? (
    <Button size="lg" render={<Link href="/tickets/nuevo" />}>
      <Plus /> Reportar o radicar
    </Button>
  ) : null;

  // ── Residentes y mantenimiento: sus tickets ──
  if (!gestion) {
    const { page, pageSize, skip, take } = pageParams(sp, 20);
    const vista = f.vista === "cerrados" ? "cerrados" : "abiertos";
    const filtros = { q: f.q, abiertos: vista === "abiertos" };
    const where = whereFiltros(ctx, filtros);
    const [items, total] = await Promise.all([
      ctx.db.ticket.findMany({
        where: vista === "cerrados" ? { AND: [where, { estado: { in: ["RESUELTO", "CERRADO"] } }] } : where,
        include: { unidad: { select: { codigo: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      ctx.db.ticket.count({ where: vista === "cerrados" ? { AND: [where, { estado: { in: ["RESUELTO", "CERRADO"] } }] } : where }),
    ]);
    const mantenimiento = !ctx.unidadIds.length && can(ctx, "tickets.gestionar");
    return (
      <>
        <PageHeader
          titulo={mantenimiento ? "Tickets asignados" : "PQRS y daños"}
          descripcion={mantenimiento ? "Trabajos que tienes a cargo, ordenados por fecha de radicación." : "Reporta daños y radica peticiones, quejas, reclamos o sugerencias. Te respondemos con número de radicado."}
          acciones={botonNuevo}
        />
        <nav className="mb-3 flex gap-2" aria-label="Filtro">
          {(["abiertos", "cerrados"] as const).map((v) => (
            <Link
              key={v}
              href={`/tickets?vista=${v}`}
              className={`inline-flex h-10 items-center rounded-full border px-4 text-sm ${vista === v ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {v === "abiertos" ? "En curso" : "Resueltos y cerrados"}
            </Link>
          ))}
        </nav>
        {items.length === 0 ? (
          <EmptyState
            titulo={vista === "abiertos" ? "No tienes solicitudes en curso" : "Aún no hay solicitudes resueltas"}
            descripcion={puedeCrear ? "¿Algo dañado o una solicitud para la administración? Repórtalo en menos de un minuto." : undefined}
            accion={botonNuevo}
          />
        ) : (
          <ul className="space-y-2">
            {items.map((t) => (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="block rounded-xl border bg-card p-3 active:opacity-80">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <TipoIcono tipo={t.tipo} className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 font-medium">{t.titulo}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Radicado <span className="font-mono">{t.radicado}</span> · {fecha(t.createdAt)}
                        {t.unidad ? ` · ${t.unidad.codigo}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <StatusBadge value={t.estado} />
                        <SlaBadge t={t} />
                        {(t.estado === "RESUELTO" || t.estado === "CERRADO") && t.calificacion === null && !mantenimiento && <StatusBadge value="PENDIENTE" text="Califica la atención" />}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Pager page={page} pageSize={pageSize} total={total} searchParams={f} basePath="/tickets" />
      </>
    );
  }

  // ── Administración: tablero ──
  const [{ items }, torres, asignables] = await Promise.all([
    listarTickets(ctx, { ...f, take: 400 }),
    torreOptions(ctx),
    opcionesAsignacion(ctx),
  ]);
  const ahora = new Date();
  const historico = !!(f.q || f.estado);
  const recientes = historico ? items : items.filter((t) => ESTADOS_ABIERTOS.includes(t.estado) || t.updatedAt.getTime() > ahora.getTime() - 30 * 86_400_000);
  const tarjetas: TarjetaTicket[] = recientes.map((t) => {
    const sla = estadoSla(t, ahora);
    return {
      id: t.id,
      radicado: t.radicado,
      titulo: t.titulo,
      tipo: t.tipo,
      prioridad: t.prioridad,
      estado: t.estado,
      fechaLimite: t.fechaLimite.toISOString(),
      unidad: t.unidad?.codigo ?? null,
      zona: t.zona?.nombre ?? null,
      asignado: t.asignadoA?.nombre ?? null,
      vencido: sla === "VENCIDO",
      porVencer: sla === "POR_VENCER",
    };
  });
  const abiertos = tarjetas.filter((t) => ESTADOS_ABIERTOS.includes(t.estado));
  const exportable = can(ctx, ["tickets.exportar"]);
  return (
    <>
      <PageHeader titulo="PQRS y daños" descripcion="Mesa de ayuda: radicados, asignaciones y tiempos de respuesta." acciones={botonNuevo} />
      <TabsGestion />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Abiertos" value={abiertos.length} href="/tickets" />
        <StatCard label="SLA vencido" value={abiertos.filter((t) => t.vencido).length} tone={abiertos.some((t) => t.vencido) ? "danger" : "default"} href="/tickets?sla=vencidos" />
        <StatCard label="Urgentes" value={abiertos.filter((t) => t.prioridad === "URGENTE").length} tone="warning" href="/tickets?prioridad=URGENTE" />
        <StatCard label="Sin asignar" value={abiertos.filter((t) => !t.asignado && t.estado !== "EN_ESPERA_RESIDENTE").length} href="/tickets?asignado=sin" />
      </div>
      <ListToolbar
        placeholder="Buscar radicado, título o unidad…"
        exportRecurso={exportable ? "tickets" : undefined}
        filters={[
          { name: "tipo", label: "Tipo", options: options(TIPOS_TICKET) },
          { name: "prioridad", label: "Prioridad", options: options(PRIORIDADES) },
          { name: "asignado", label: "Asignado", options: [{ value: "sin", label: "Sin asignar" }, { value: "yo", label: "A mí" }, ...asignables.usuarios.map((u) => ({ value: u.value, label: u.label }))] },
          { name: "sla", label: "SLA", options: [{ value: "vencidos", label: "Vencidos" }, { value: "por_vencer", label: "Vencen en 24 h" }] },
          { name: "torre", label: "Torre", options: torres },
        ]}
      />
      {tarjetas.length === 0 ? (
        <EmptyState titulo="No hay tickets con estos filtros" descripcion="Cambia los filtros o espera nuevos reportes de los residentes." />
      ) : (
        <TableroTickets tickets={tarjetas} puedeMover={can(ctx, "tickets.gestionar")} />
      )}
      <p className="mt-2 text-xs text-muted-foreground">Se muestran los tickets abiertos y los resueltos o cerrados en los últimos 30 días. Usa la búsqueda o exporta para ver el histórico.</p>
    </>
  );
}
