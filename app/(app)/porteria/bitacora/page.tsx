import { Ban } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { addDays, fecha, hora, parseLocal, startOfDayBogota } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { bitacora } from "@/lib/porteria/service";
import { turnoAbierto } from "@/lib/porteria/turnos";
import { cn } from "@/lib/utils";
import { ListToolbar } from "@/components/app/list-toolbar";
import { Pager } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { TextAreaField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { anularRegistroAction } from "../actions";
import { FechaFiltro } from "../_components/fecha-filtro";
import { KTitle } from "../_components/kiosk";

export const metadata = { title: "Bitácora" };

const TIPOS = ["INGRESO", "SALIDA", "ANULACION"] as const;
const SUJETOS = ["VISITANTE", "RESIDENTE", "EMPLEADO", "VEHICULO", "PROVEEDOR", "DOMICILIARIO"] as const;
const MEDIOS = ["QR", "CODIGO", "LLAMADA_RESIDENTE", "LISTA_FRECUENTES", "MANUAL"] as const;

/** Bitácora inmutable: cronológica, filtrable, exportable y paginada. Las correcciones son anulaciones. */
export default async function BitacoraPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["porteria.bitacora", "porteria.ver"]);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 50);
  const turno = await turnoAbierto(ctx);
  const filtrado = ["q", "tipo", "sujeto", "medio", "unidad", "desde", "hasta"].some((k) => spGet(sp, k));
  // Por defecto: la bitácora del turno abierto (o de hoy)
  const desdeDef = turno ? turno.apertura : startOfDayBogota();
  const desde = spGet(sp, "desde") ? parseLocal(spGet(sp, "desde")!) : filtrado ? null : desdeDef;
  const hasta = spGet(sp, "hasta") ? addDays(parseLocal(spGet(sp, "hasta")!), 1) : null;
  const { rows, total } = await bitacora(ctx, { tipo: spGet(sp, "tipo"), sujeto: spGet(sp, "sujeto"), medio: spGet(sp, "medio"), unidad: spGet(sp, "unidad"), q: spGet(sp, "q"), desde, hasta }, { skip, take });
  const puedeAnular = can(ctx, "porteria.anular");
  let diaActual = "";
  return (
    <>
      <KTitle>Bitácora</KTitle>
      {!filtrado && <p className="mb-2 text-base text-muted-foreground">{turno ? `Mostrando desde el inicio de tu turno (${hora(turno.apertura)}).` : "Mostrando los registros de hoy."} Usa los filtros para ver otras fechas.</p>}
      <ListToolbar
        placeholder="Nombre, cédula, placa u observación…"
        exportRecurso="bitacora"
        filters={[
          { name: "tipo", label: "Tipo", options: options(TIPOS) },
          { name: "sujeto", label: "Quién", options: options(SUJETOS) },
          { name: "medio", label: "Medio", options: options(MEDIOS) },
        ]}
      >
        <FechaFiltro />
      </ListToolbar>
      {rows.length === 0 ? (
        <EmptyState titulo="Sin registros" descripcion="No hay movimientos con estos filtros." />
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => {
            const dia = fecha(r.hora);
            const sep = dia !== diaActual;
            diaActual = dia;
            return (
              <li key={r.id} className="[content-visibility:auto] [contain-intrinsic-size:auto_76px]">
                {sep && <p className="mb-1 mt-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{dia}</p>}
                <div className={cn("flex items-start gap-3 rounded-xl border-2 bg-card p-3", r.anulado && "opacity-60", r.tipo === "ANULACION" && "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30")}>
                  <span className="w-14 shrink-0 font-mono text-lg font-bold tabular-nums">{hora(r.hora)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-base font-bold", r.anulado && "line-through")}>
                      {r.nombre}
                      {r.unidad && <span className="ml-2 whitespace-nowrap rounded bg-muted px-1.5 text-sm font-semibold">{r.unidad.codigo}</span>}
                      {r.placa && <span className="ml-2 whitespace-nowrap font-mono text-sm">🚗 {r.placa}</span>}
                    </p>
                    <p className="text-sm text-foreground/75">
                      {label(r.sujeto)} · {label(r.medio)}
                      {r.portero && ` · ${r.portero.nombre}`}
                    </p>
                    {r.observaciones && <p className="text-sm">{r.tipo === "ANULACION" ? `Motivo: ${r.observaciones}` : r.observaciones}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge value={r.tipo} />
                    {r.anulado && <StatusBadge value="ANULADA" text="Anulado" />}
                    {puedeAnular && !r.anulado && r.tipo !== "ANULACION" && (
                      <FormDialog
                        titulo="Anular registro"
                        descripcion="La bitácora no se modifica: se crea un registro de anulación que referencia al original."
                        action={anularRegistroAction}
                        extra={{ id: r.id }}
                        submitLabel="Anular registro"
                        successMessage="Registro anulado"
                        confirm="¿Anular este registro de la bitácora?"
                        trigger={
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Ban /> Anular
                          </Button>
                        }
                      >
                        <TextAreaField name="motivo" label="Motivo de la anulación" required placeholder="Ej.: se registró en la unidad equivocada" />
                      </FormDialog>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/porteria/bitacora" />
    </>
  );
}
