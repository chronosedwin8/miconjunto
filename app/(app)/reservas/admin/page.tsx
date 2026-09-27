import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CalendarCheck, CalendarClock, ClipboardCheck, Lock, Receipt } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { cop, fecha, fechaHora, hora, toNumber } from "@/lib/format";
import { options } from "@/lib/labels";
import { zonaOptions } from "@/lib/conjunto/options";
import { ESTADOS_RESERVA, whereReservas } from "@/lib/reservas/service";
import { resumenAdmin } from "@/lib/reservas/inicio";
import { PageHeader, Section } from "@/components/app/page-header";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RechazarDialog } from "../componentes";
import { aprobarReservaAction } from "../actions";

export const metadata = { title: "Administrar reservas" };

export default async function AdminReservasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("reservas.ver_todos");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 25);
  const cuando = spGet(sp, "cuando") ?? "proximas";
  const ahora = new Date();
  const filtroTiempo: Prisma.ReservaWhereInput = cuando === "proximas" ? { fin: { gt: ahora } } : cuando === "pasadas" ? { fin: { lte: ahora } } : {};
  const where: Prisma.ReservaWhereInput = { AND: [whereReservas(ctx, { zona: spGet(sp, "zona"), estado: spGet(sp, "estado"), q: spGet(sp, "q") }), filtroTiempo] };
  const [rows, total, zonas, resumen, porAprobar] = await Promise.all([
    ctx.db.reserva.findMany({ where, include: { zona: { select: { nombre: true } }, unidad: { select: { codigo: true } } }, orderBy: { inicio: cuando === "pasadas" ? "desc" : "asc" }, skip, take }),
    ctx.db.reserva.count({ where }),
    zonaOptions(ctx, true),
    resumenAdmin(ctx),
    can(ctx, "reservas.aprobar")
      ? ctx.db.reserva.findMany({ where: { estado: "SOLICITADA", aprobadaPorId: null, zona: { requiereAprobacion: true }, inicio: { gt: ahora } }, include: { zona: { select: { nombre: true } }, unidad: { select: { codigo: true } } }, orderBy: { inicio: "asc" }, take: 10 })
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader
        titulo="Reservas"
        descripcion="Aprobaciones, calendario de todas las zonas, bloqueos y actas."
        acciones={
          <>
            {can(ctx, "reservas.bloquear") && (
              <Button variant="outline" render={<Link href="/reservas/admin/bloqueos" />}>
                <Lock /> Bloqueos y reglas
              </Button>
            )}
            {can(ctx, "reservas.checkin") && (
              <Button variant="outline" render={<Link href="/reservas/checkin" />}>
                <ClipboardCheck /> Check-in de hoy
              </Button>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Por aprobar" value={resumen.pendientesAprobacion} tone={resumen.pendientesAprobacion ? "warning" : "default"} icon={CalendarClock} />
        <StatCard label="Hoy" value={resumen.hoy.length} icon={CalendarCheck} href="/reservas/checkin" />
        <StatCard label="Alquileres del mes" value={cop(resumen.ingresosMes.total)} hint={`${resumen.ingresosMes.reservas} pagadas · IVA ${cop(resumen.ingresosMes.iva)}`} icon={Receipt} href={can(ctx, "facturacion.ver") ? "/facturacion/reporte" : undefined} />
        <StatCard label="Base gravable del mes" value={cop(resumen.ingresosMes.base)} tone="primary" />
      </div>

      {porAprobar.length > 0 && (
        <Section titulo={`Por aprobar (${porAprobar.length})`}>
          <ul className="space-y-2">
            {porAprobar.map((r) => (
              <li key={r.id} className="rounded-2xl border border-warning/30 bg-warning/5 p-3">
                <Link href={`/reservas/detalle/${r.id}`} className="block">
                  <p className="font-semibold">
                    {r.zona.nombre} · {r.unidad.codigo}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {fechaHora(r.inicio)}–{hora(r.fin)} · {r.asistentes} asistentes {r.motivo ? `· ${r.motivo}` : ""}
                  </p>
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.pagada ? <Badge variant="success">Pagada</Badge> : toNumber(r.valor) + toNumber(r.deposito) > 0 ? <Badge variant="warning">Sin pagar</Badge> : <Badge variant="outline">Sin costo</Badge>}
                  <div className="ml-auto flex gap-2">
                    <RechazarDialog id={r.id} />
                    <ActionButton action={aprobarReservaAction} input={{ id: r.id }} successMessage="Reserva aprobada">
                      Aprobar
                    </ActionButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section titulo="Todas las reservas">
        <ListToolbar
          placeholder="Buscar por unidad (T1-101)…"
          exportRecurso="reservas"
          filters={[
            { name: "cuando", label: "Cuándo", options: [{ value: "proximas", label: "Próximas" }, { value: "pasadas", label: "Pasadas" }, { value: "todas", label: "Todas" }] },
            { name: "zona", label: "Zona", options: zonas },
            { name: "estado", label: "Estado", options: options(ESTADOS_RESERVA) },
          ]}
        />
        <DataList
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => `/reservas/detalle/${r.id}`}
          columns={[
            { key: "zona", header: "Zona", primary: true, cell: (r) => `${r.zona.nombre} · ${r.unidad.codigo}` },
            { key: "fecha", header: "Fecha", cell: (r) => fecha(r.inicio) },
            { key: "hora", header: "Hora", cell: (r) => `${hora(r.inicio)}–${hora(r.fin)}` },
            { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
            { key: "valor", header: "Valor", align: "right", cell: (r) => (toNumber(r.valor) > 0 ? cop(toNumber(r.valor) + toNumber(r.iva)) : "Sin costo") },
            { key: "pago", header: "Pago", cell: (r) => (toNumber(r.valor) + toNumber(r.deposito) > 0 ? (r.pagada ? "Pagada" : "Pendiente") : "—") },
            { key: "acta", header: "Acta", hideOnMobile: true, cell: (r) => (r.checkOutEn ? "Recibida" : r.checkInEn ? "Entregada" : "—") },
          ]}
        />
        <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/reservas/admin" />
      </Section>
    </>
  );
}
