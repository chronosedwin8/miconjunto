import Link from "next/link";
import QRCode from "qrcode";
import { FileText, Printer, Wrench } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fichaActivo } from "@/lib/activos/service";
import { ESTADOS_ACTIVO } from "@/lib/activos/constants";
import { zonaOptions } from "@/lib/conjunto/options";
import { activoOptions, proveedorOptions, responsablesOptions } from "@/lib/mantenimiento/service";
import { appUrl } from "@/lib/email";
import { cop, fecha, num } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { SelectAction } from "@/components/form/select-action";
import { Button } from "@/components/ui/button";
import { OrdenFields } from "../../mantenimiento/orden-fields";
import { guardarOrdenAction } from "../../mantenimiento/actions";
import { ActivoForm } from "../activo-form";
import { cambiarEstadoActivoAction, eliminarActivoAction } from "../actions";

export const metadata = { title: "Ficha del activo" };

export default async function ActivoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("activos.ver");
  const { id } = await params;
  const a = await fichaActivo(ctx, id);
  const qrUrl = appUrl(`/activo/${a.codigoQr}`);
  const qr = await QRCode.toDataURL(qrUrl, { margin: 1, width: 240 });
  const puedeOrden = can(ctx, ["mantenimiento.crear", "mantenimiento.gestionar"]);
  const [zonas, proveedores, activos, responsables] = await Promise.all([
    zonaOptions(ctx),
    proveedorOptions(ctx),
    puedeOrden ? activoOptions(ctx) : Promise.resolve([]),
    puedeOrden ? responsablesOptions(ctx) : Promise.resolve([]),
  ]);
  const verValor = can(ctx, ["presupuesto.ver", "activos.crear"]);
  const antiguedad = a.fechaCompra ? (Date.now() - a.fechaCompra.getTime()) / (365.25 * 86_400_000) : null;
  const datos: [string, React.ReactNode][] = [
    ["Categoría", a.categoria],
    ["Ubicación", a.ubicacion ?? a.zona?.nombre ?? "—"],
    ["Zona", a.zona ? <Link key="z" href={`/conjunto/zonas/${a.zona.id}`} className="text-primary">{a.zona.nombre}</Link> : "—"],
    ["Marca / modelo", [a.marca, a.modelo].filter(Boolean).join(" ") || "—"],
    ["Serie", a.serie ?? "—"],
    ["Compra", a.fechaCompra ? `${fecha(a.fechaCompra)}${antiguedad !== null ? ` (${num(antiguedad, 1)} años)` : ""}` : "—"],
    ...(verValor ? ([["Valor", a.valor ? cop(a.valor) : "—"]] as [string, React.ReactNode][]) : []),
    ["Vida útil", a.vidaUtilAnios ? `${a.vidaUtilAnios} años` : "—"],
    ["Garantía", a.garantiaVence ? fecha(a.garantiaVence) : "—"],
    ["Proveedor", a.proveedor ? <Link key="p" href={`/proveedores/${a.proveedor.id}`} className="text-primary">{a.proveedor.razonSocial}</Link> : "—"],
  ];
  const historial = [
    ...a.ordenes.map((o) => ({ key: `o-${o.id}`, fecha: o.fechaCierre ?? o.fechaProgramada, titulo: `OT #${o.numero} · ${o.titulo}`, sub: `${label(o.origen)}${o.proveedor ? ` · ${o.proveedor.razonSocial}` : ""}${o.costo && verValor ? ` · ${cop(o.costo)}` : ""}`, estado: o.estado, href: `/mantenimiento/ordenes/${o.id}` })),
    ...a.tickets.map((t) => ({ key: `t-${t.id}`, fecha: t.createdAt, titulo: `Ticket ${t.radicado} · ${t.titulo}`, sub: `${label(t.origen)} · prioridad ${label(t.prioridad).toLowerCase()}`, estado: t.estado, href: `/tickets/${t.id}` })),
  ].sort((x, y) => y.fecha.getTime() - x.fecha.getTime());

  return (
    <>
      <PageHeader
        volver="/activos"
        titulo={a.nombre}
        descripcion={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge value={a.estado} /> {a.categoria}
          </span>
        }
        acciones={
          <>
            {can(ctx, "activos.editar") && (
              <SelectAction action={cambiarEstadoActivoAction} input={{ id: a.id }} field="estado" value={a.estado} options={options(ESTADOS_ACTIVO)} ariaLabel="Cambiar estado del activo" className="h-11 rounded-lg border bg-background px-3 text-sm" />
            )}
            {puedeOrden && (
              <FormDialog titulo="Nueva orden de trabajo" action={guardarOrdenAction} triggerLabel="Nueva orden" redirectTo="/mantenimiento/ordenes/{id}" wide>
                <OrdenFields o={{ activoId: a.id, zonaId: a.zonaId, proveedorId: a.proveedorId }} activos={activos} zonas={zonas} proveedores={proveedores} responsables={responsables} />
              </FormDialog>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <Section titulo="Datos del activo">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
              {datos.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium break-words">{v}</dd>
                </div>
              ))}
            </dl>
            {a.notas && <p className="mt-2 text-sm text-muted-foreground">{a.notas}</p>}
          </Section>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Órdenes" value={a.ordenes.length} hint={`${a.costos.correctivas} correctivas`} />
            <StatCard label="Tickets" value={a.tickets.length} />
            {verValor ? <StatCard label="Costo este año" value={<span className="whitespace-nowrap text-lg sm:text-2xl">{cop(a.costos.anio)}</span>} hint={`Histórico ${cop(a.costos.total)}`} /> : <StatCard label="Planes" value={a.planes.length} />}
          </div>

          <Section titulo={`Plan de mantenimiento (${a.planes.length})`} acciones={can(ctx, "mantenimiento.crear") ? <Link href={`/mantenimiento/planes?activoId=${a.id}`} className="text-sm text-primary">Gestionar planes</Link> : undefined}>
            <ul className="divide-y rounded-xl border bg-card text-sm">
              {a.planes.length === 0 && <li className="p-4 text-muted-foreground">Sin planes. Programa el mantenimiento preventivo o legal de este activo.</li>}
              {a.planes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      Cada {p.frecuenciaDias} días · próxima {fecha(p.proximaFecha)}
                      {p.proveedor && ` · ${p.proveedor.razonSocial}`}
                    </p>
                  </div>
                  <StatusBadge value={p.activoPlan ? p.tipo : "INACTIVO"} />
                </li>
              ))}
            </ul>
          </Section>

          <Section titulo="Historial">
            <ol className="relative space-y-3 border-l pl-4">
              {historial.length === 0 && <li className="text-sm text-muted-foreground">Sin órdenes ni tickets registrados.</li>}
              {historial.map((h) => (
                <li key={h.key} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
                  <Link href={h.href} className="block rounded-lg border bg-card p-3 hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{h.titulo}</p>
                      <StatusBadge value={h.estado} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fecha(h.fecha)} · {h.sub}
                    </p>
                  </Link>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4 text-center">
            { }
            <img src={qr} alt={`Código QR de ${a.nombre}`} className="mx-auto size-40" />
            <p className="mt-2 text-xs text-muted-foreground">Al escanearlo se abre la ficha y el botón para reportar una falla.</p>
            <Button variant="outline" className="mt-3 w-full" render={<a href={`/activos/etiquetas?ids=${a.id}`} target="_blank" rel="noopener" />}>
              <Printer /> Imprimir etiqueta
            </Button>
          </div>
          {a.fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {a.fotos.map((f) => (
                <a key={f} href={f} target="_blank" rel="noopener">
                  { }
                  <img src={f} alt={`Foto de ${a.nombre}`} className="aspect-square w-full rounded-lg border object-cover" />
                </a>
              ))}
            </div>
          )}
          {a.manuales.length > 0 && (
            <ul className="space-y-1 rounded-xl border bg-card p-3 text-sm">
              {a.manuales.map((m, i) => (
                <li key={m}>
                  <a href={m} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-2 text-primary">
                    <FileText className="size-4" /> Manual {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" className="w-full" render={<Link href={`/mantenimiento?activoId=${a.id}`} />}>
            <Wrench /> Ver órdenes del activo
          </Button>
        </aside>
      </div>

      {can(ctx, "activos.editar") && (
        <details className="mb-6 rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold">Editar activo</summary>
          <div className="mt-4">
            <ActivoForm activo={a} zonas={zonas} proveedores={proveedores} />
          </div>
        </details>
      )}
      {can(ctx, "activos.eliminar") && (
        <ActionButton action={eliminarActivoAction} input={{ id: a.id }} variant="destructive" confirm={`¿Eliminar el activo ${a.nombre}? Sus planes quedarán inactivos.`} successMessage="Activo eliminado" redirectTo="/activos">
          Eliminar activo
        </ActionButton>
      )}
    </>
  );
}
