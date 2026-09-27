import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { cop, fecha, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { SearchSelect, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { cerrarConciliacionAction, crearPagoLineaAction, deshacerLineaAction, emparejarLineaAction, ignorarLineaAction, reemparejarAction } from "../../actions";

export const metadata = { title: "Conciliación" };

export default async function ConciliacionDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePage("pagos.conciliar");
  const { id } = await params;
  const sp = await searchParams;
  const ver = spGet(sp, "ver") ?? "PENDIENTE";
  const c = await ctx.db.conciliacionBancaria.findUnique({ where: { id }, include: { cuenta: true } });
  if (!c) notFound();
  const [lineas, conteo, unidades] = await Promise.all([
    ctx.db.lineaExtracto.findMany({ where: { conciliacionId: id, ...(ver === "TODAS" ? {} : { estado: ver as never }) }, orderBy: { fecha: "asc" } }),
    ctx.db.lineaExtracto.groupBy({ by: ["estado"], where: { conciliacionId: id }, _count: { _all: true }, _sum: { valor: true } }),
    unidadOptions(ctx),
  ]);
  const codigo = new Map(unidades.map((u) => [u.value, u.label]));
  // Candidatos para emparejar manualmente: pagos aprobados sin conciliar ±10 días del extracto.
  const fechas = lineas.map((l) => l.fecha.getTime());
  const candidatos = fechas.length
    ? await ctx.db.pago.findMany({
        where: { estado: "APROBADO", conciliado: false, fecha: { gte: new Date(Math.min(...fechas) - 10 * 86_400_000), lte: new Date(Math.max(...fechas) + 10 * 86_400_000) } },
        include: { unidad: { select: { codigo: true } } },
        orderBy: { fecha: "asc" },
        take: 300,
      })
    : [];
  const n = (e: string) => conteo.find((x) => x.estado === e)?._count._all ?? 0;
  const v = (e: string) => toNumber(conteo.find((x) => x.estado === e)?._sum.valor);
  const cerrada = c.estado === "CERRADA";
  return (
    <>
      <Link href="/cartera/conciliacion" className="text-sm text-muted-foreground">
        ← Conciliación
      </Link>
      <h2 className="mb-1 text-xl font-bold">{c.archivoNombre}</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {c.cuenta ? `${c.cuenta.banco} ${c.cuenta.numero} · ` : ""}
        {c.periodo ?? ""} · cargado el {fecha(c.createdAt)} · {cerrada ? "Cerrada" : "En proceso"}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pendientes por identificar" value={n("PENDIENTE")} hint={cop(v("PENDIENTE"))} tone={n("PENDIENTE") ? "warning" : "success"} />
        <StatCard label="Emparejadas" value={n("EMPAREJADA")} hint={cop(v("EMPAREJADA"))} tone="success" />
        <StatCard label="Pagos creados" value={n("CREADA")} hint={cop(v("CREADA"))} />
        <StatCard label="Ignoradas" value={n("IGNORADA")} hint={cop(v("IGNORADA"))} />
      </div>
      {!cerrada && (
        <div className="mb-4 flex flex-wrap gap-2">
          <ActionButton variant="outline" action={reemparejarAction} input={{ id }} successMessage="Emparejamiento automático ejecutado">
            Volver a emparejar
          </ActionButton>
          <ActionButton action={cerrarConciliacionAction} input={{ id }} confirm="¿Cerrar la conciliación? Ya no se podrá modificar." successMessage="Conciliación cerrada" disabled={n("PENDIENTE") > 0}>
            Cerrar conciliación
          </ActionButton>
        </div>
      )}
      <nav className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0" aria-label="Filtrar líneas">
        {["PENDIENTE", "EMPAREJADA", "CREADA", "IGNORADA", "TODAS"].map((e) => (
          <Link
            key={e}
            href={`/cartera/conciliacion/${id}?ver=${e}`}
            aria-current={ver === e ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm ${ver === e ? "border-primary bg-primary/10 font-medium text-primary" : ""}`}
          >
            {e === "TODAS" ? "Todas" : label(e)}
            {e !== "TODAS" && <span className="rounded-full bg-muted px-1.5 text-[11px]">{n(e)}</span>}
          </Link>
        ))}
      </nav>
      <ul className="space-y-2">
        {lineas.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay líneas en esta vista.</li>}
        {lineas.map((l) => {
          const cands = candidatos.filter((p) => Math.abs(toNumber(p.valor) - toNumber(l.valor)) < 1);
          return (
            <li key={l.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold tabular-nums">{cop(l.valor)}</p>
                  <p className="text-sm">{l.descripcion ?? "Sin descripción"}</p>
                  <p className="text-xs text-muted-foreground">
                    {fecha(l.fecha)}
                    {l.referencia ? ` · Ref. ${l.referencia}` : ""}
                    {l.unidadSugeridaId ? ` · Unidad: ${codigo.get(l.unidadSugeridaId) ?? "—"}` : ""}
                  </p>
                </div>
                <StatusBadge value={l.estado} />
              </div>
              {!cerrada && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {l.estado === "PENDIENTE" && (
                    <>
                      <FormDialog
                        titulo="Crear pago desde el extracto"
                        descripcion={`Se registrará un pago de ${cop(l.valor)} del ${fecha(l.fecha)} y se aplicará a la cartera de la unidad.`}
                        action={crearPagoLineaAction}
                        extra={{ lineaId: l.id }}
                        triggerLabel="Crear pago"
                        triggerSize="sm"
                        confirm={`¿Registrar el pago de ${cop(l.valor)}?`}
                        successMessage="Pago creado y conciliado"
                      >
                        <SearchSelect name="unidadId" label="Unidad" options={unidades} defaultValue={l.unidadSugeridaId} required />
                        <SelectField name="medio" label="Medio" options={["CONSIGNACION", "TRANSFERENCIA", "PSE"].map((m) => ({ value: m, label: label(m) }))} defaultValue="CONSIGNACION" placeholder={false} required />
                      </FormDialog>
                      {cands.length > 0 && (
                        <FormDialog titulo="Emparejar con un pago registrado" action={emparejarLineaAction} extra={{ lineaId: l.id }} triggerLabel={`Emparejar (${cands.length})`} triggerVariant="outline" triggerSize="sm" successMessage="Línea emparejada">
                          <SelectField name="pagoId" label="Pago" options={cands.map((p) => ({ value: p.id, label: `${p.unidad.codigo} · ${fecha(p.fecha)} · ${label(p.medio)}${p.numeroRecibo ? ` · RC ${p.numeroRecibo}` : ""}` }))} required />
                        </FormDialog>
                      )}
                      <FormDialog titulo="Ignorar línea" descripcion="Para abonos que no son de cartera (rendimientos, reintegros, etc.)." action={ignorarLineaAction} extra={{ lineaId: l.id }} trigger={<Button size="sm" variant="ghost">Ignorar</Button>} successMessage="Línea ignorada">
                        <TextField name="motivo" label="Motivo" placeholder="Ej.: rendimientos financieros" />
                      </FormDialog>
                    </>
                  )}
                  {(l.estado === "EMPAREJADA" || l.estado === "IGNORADA") && (
                    <ActionButton size="sm" variant="ghost" action={deshacerLineaAction} input={{ lineaId: l.id }} successMessage="Línea pendiente de nuevo">
                      Deshacer
                    </ActionButton>
                  )}
                  {l.pagoId && (
                    <Button size="sm" variant="ghost" render={<a href={`/api/cartera/recibo/${l.pagoId}`} target="_blank" rel="noopener" />}>
                      Recibo
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
