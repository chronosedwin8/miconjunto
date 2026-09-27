import Link from "next/link";
import { AlertTriangle, Package, PackagePlus, Undo2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { listarPaquetes, reporteDiario } from "@/lib/paqueteria/service";
import { cn } from "@/lib/utils";
import { ListToolbar } from "@/components/app/list-toolbar";
import { Pager } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { devolverPaqueteAction } from "../actions";
import { Foto, KTitle } from "../_components/kiosk";

export const metadata = { title: "Paquetería" };

const ESTADOS = ["EN_PORTERIA", "ENTREGADO", "DEVUELTO"] as const;

export default async function PaquetesPorteriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["paqueteria.ver_todos", "paqueteria.recibir"]);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const estado = spGet(sp, "estado") ?? (spGet(sp, "q") ? undefined : "EN_PORTERIA");
  const vencidos = spGet(sp, "vencidos") === "1";
  const [{ rows, total }, rep] = await Promise.all([listarPaquetes(ctx, { estado, q: spGet(sp, "q"), vencidos }, { skip, take }), reporteDiario(ctx)]);
  const entregar = can(ctx, "paqueteria.entregar");
  return (
    <>
      <KTitle
        acciones={
          can(ctx, "paqueteria.recibir") && (
            <Link href="/porteria/paquetes/recibir" className="inline-flex h-14 items-center gap-2 rounded-xl bg-blue-700 px-5 text-lg font-bold text-white">
              <PackagePlus className="size-6" /> Recibir paquete
            </Link>
          )
        }
      >
        Paquetería
      </KTitle>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["En portería", rep.enPorteria, "/porteria/paquetes?estado=EN_PORTERIA"],
          [`Más de ${rep.maxDias} días`, rep.vencidos, "/porteria/paquetes?vencidos=1"],
          ["Recibidos hoy", rep.recibidosHoy, "/porteria/paquetes?estado="],
          ["Entregados hoy", rep.entregadosHoy, "/porteria/paquetes?estado=ENTREGADO"],
        ].map(([k, v, href], i) => (
          <Link key={k as string} href={href as string} className={cn("rounded-2xl border-2 p-3", i === 1 && (v as number) > 0 && "border-amber-500 bg-amber-50 dark:bg-amber-950/30")}>
            <p className="text-3xl font-black">{v}</p>
            <p className="text-sm font-semibold">{k}</p>
          </Link>
        ))}
      </div>
      <ListToolbar placeholder="Unidad, destinatario, transportadora o guía…" exportRecurso="paquetes" filters={[{ name: "estado", label: "Estado", options: options(ESTADOS) }]} />
      {rows.length === 0 ? (
        <EmptyState titulo="No hay paquetes" descripcion={estado === "EN_PORTERIA" ? "No hay paquetes pendientes por entregar." : "No hay paquetes con estos filtros."} />
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {rows.map((p) => {
            const viejo = p.estado === "EN_PORTERIA" && p.dias >= rep.maxDias;
            return (
              <li key={p.id} className={cn("flex min-w-0 items-center gap-3 rounded-2xl border-2 bg-card p-3", viejo && "border-amber-500")}>
                {p.fotoUrl ? (
                  <Foto src={p.fotoUrl} alt={`Paquete ${p.unidad.codigo}`} className="size-16" />
                ) : (
                  <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted">
                    <Package className="size-7" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black">
                    {p.unidad.codigo} <span className="text-base font-semibold text-foreground/75">· {label(p.tipo)}</span>
                  </p>
                  <p className="truncate text-sm text-foreground/80">
                    {[p.transportadora, p.destinatario, p.guia && `Guía ${p.guia}`].filter(Boolean).join(" · ") || "Sin datos de guía"}
                  </p>
                  <p className="text-sm">
                    {fechaHora(p.llegadaEn)}
                    {p.estado === "EN_PORTERIA" && (
                      <span className={cn("ml-1 font-semibold", viejo && "text-amber-800 dark:text-amber-300")}>
                        {viejo && <AlertTriangle className="mr-0.5 inline size-4" />}
                        {p.dias} día(s)
                      </span>
                    )}
                    {p.recogidoPor && ` · recogió ${p.recogidoPor}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {p.estado === "EN_PORTERIA" && entregar ? (
                    <>
                      <Link href={`/porteria/paquetes/entregar?unidadId=${p.unidad.id}`} className="inline-flex h-12 items-center rounded-xl bg-violet-700 px-4 text-base font-bold text-white">
                        Entregar
                      </Link>
                      <FormDialog
                        titulo="Devolver paquete"
                        action={devolverPaqueteAction}
                        extra={{ id: p.id }}
                        submitLabel="Registrar devolución"
                        successMessage="Paquete devuelto"
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Undo2 /> Devolver
                          </Button>
                        }
                      >
                        <TextField name="motivo" label="Motivo" required placeholder="Ej.: dirección errada, lo recogió la transportadora" />
                      </FormDialog>
                    </>
                  ) : (
                    <StatusBadge value={p.estado} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/porteria/paquetes" />
    </>
  );
}
