import { IdCard, Pencil, Phone, UserRound } from "lucide-react";
import type { Empleado } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { CARGOS_EMPLEADO, listarEmpleados, resumenEmpleados, TURNOS_EMPLEADO } from "@/lib/empleados/service";
import { fecha, isoDate, startOfDayBogota } from "@/lib/format";
import { semaforoVencimiento } from "@/lib/mantenimiento/calculos";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FileField, FormGrid, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { guardarEmpleadoAction, retirarEmpleadoAction } from "./actions";

export const metadata = { title: "Empleados" };

function EmpleadoFields({ e }: { e?: Empleado }) {
  return (
    <>
      <FileField name="fotoUrl" label="Foto (para identificarlo en portería)" folder="empleados" defaultValue={e?.fotoUrl ?? null} />
      <FormGrid>
        <TextField name="nombre" label="Nombre completo" defaultValue={e?.nombre} required />
        <TextField name="documento" label="Documento" defaultValue={e?.documento ?? ""} inputMode="numeric" />
        <TextField name="cargo" label="Cargo" defaultValue={e?.cargo} list="cargos-empleado" required />
        <TextField name="turno" label="Turno" defaultValue={e?.turno ?? ""} list="turnos-empleado" />
        <TextField name="telefono" label="Teléfono" type="tel" defaultValue={e?.telefono ?? ""} />
        <TextField name="fechaIngreso" label="Fecha de ingreso" type="date" defaultValue={isoDate(e?.fechaIngreso)} />
        <TextField name="epsVence" label="EPS vence" type="date" defaultValue={isoDate(e?.epsVence)} />
        <TextField name="arlVence" label="ARL vence" type="date" defaultValue={isoDate(e?.arlVence)} />
      </FormGrid>
      <datalist id="cargos-empleado">
        {CARGOS_EMPLEADO.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="turnos-empleado">
        {TURNOS_EMPLEADO.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <FileField name="documentos" label="Documentos (contrato, certificados, cursos)" multiple accept="application/pdf,image/*" capture={false} folder="empleados" defaultValue={e?.documentos ?? []} />
      <CheckboxField name="activo" label="Empleado activo" defaultChecked={e?.activo ?? true} />
    </>
  );
}

export default async function EmpleadosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("empleados.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const filtros = { q: spGet(sp, "q"), cargo: spGet(sp, "cargo"), estado: spGet(sp, "estado"), alerta: spGet(sp, "alerta") };
  const [{ items, total }, res, cargos] = await Promise.all([
    listarEmpleados(ctx, filtros, { skip, take }),
    resumenEmpleados(ctx),
    ctx.db.empleado.findMany({ distinct: ["cargo"], select: { cargo: true }, orderBy: { cargo: "asc" } }),
  ]);
  const edita = can(ctx, "empleados.editar");
  const hoy = startOfDayBogota();
  return (
    <>
      <PageHeader titulo="Empleados del conjunto" descripcion="Personal propio (sin nómina): cargo, turno, seguridad social y foto para portería." />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Activos" value={res.activos} />
        <StatCard label="EPS/ARL vencida" value={res.vencidos} tone={res.vencidos ? "danger" : "default"} href="/empleados?alerta=si" />
        <StatCard label="Por vencer" value={res.porVencer} tone={res.porVencer ? "warning" : "default"} href="/empleados?alerta=si" />
      </div>
      <ListToolbar
        placeholder="Buscar por nombre, documento o cargo…"
        exportRecurso="empleados"
        filters={[
          { name: "cargo", label: "Cargo", options: cargos.map((c) => ({ value: c.cargo, label: c.cargo })) },
          { name: "alerta", label: "Seguridad social", options: [{ value: "si", label: "Vencida o por vencer" }] },
          { name: "estado", label: "Estado", options: [{ value: "inactivos", label: "Retirados" }, { value: "todos", label: "Todos" }] },
        ]}
      >
        {can(ctx, "empleados.crear") && (
          <FormDialog titulo="Nuevo empleado" action={guardarEmpleadoAction} triggerLabel="Nuevo" triggerSize="sm" successMessage="Empleado registrado" wide>
            <EmpleadoFields />
          </FormDialog>
        )}
      </ListToolbar>
      {items.length === 0 ? (
        <EmptyState icon={IdCard} titulo="Sin empleados" descripcion="Registra porteros, personal de aseo y jardinería para controlar su seguridad social y que portería los reconozca." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 [&>li]:min-w-0">
          {items.map((e) => {
            const eps = semaforoVencimiento(e.epsVence, hoy);
            const arl = semaforoVencimiento(e.arlVence, hoy);
            return (
              <li key={e.id} className={cn("flex gap-3 rounded-xl border bg-card p-3", !e.activo && "opacity-60", e.semaforo === "VENCIDO" && "border-destructive/40")}>
                {e.fotoUrl ? (
                   
                  <img src={e.fotoUrl} alt={`Foto de ${e.nombre}`} className="size-16 shrink-0 rounded-xl border object-cover" />
                ) : (
                  <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <UserRound className="size-8" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-1">
                    <p className="font-medium leading-snug">{e.nombre}</p>
                    {edita && (
                      <FormDialog titulo="Editar empleado" action={guardarEmpleadoAction} extra={{ id: e.id }} wide successMessage="Empleado actualizado" trigger={<Button variant="ghost" size="icon-sm" aria-label={`Editar a ${e.nombre}`}><Pencil /></Button>}>
                        <EmpleadoFields e={e} />
                      </FormDialog>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.cargo}
                    {e.turno && ` · ${e.turno}`}
                    {e.documento && ` · CC ${e.documento}`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                    <span className="inline-flex items-center gap-1">
                      EPS <StatusBadge value={eps ?? "PENDIENTE"} text={e.epsVence ? fecha(e.epsVence) : "Sin dato"} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      ARL <StatusBadge value={arl ?? "PENDIENTE"} text={e.arlVence ? fecha(e.arlVence) : "Sin dato"} />
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {e.telefono && (
                      <a href={`tel:${e.telefono}`} className="inline-flex min-h-9 items-center gap-1 text-sm text-primary">
                        <Phone className="size-3.5" /> {e.telefono}
                      </a>
                    )}
                    {e.documentos.length > 0 && <span className="text-xs text-muted-foreground">{e.documentos.length} documento(s)</span>}
                    {edita && e.activo && (
                      <ActionButton action={retirarEmpleadoAction} input={{ id: e.id }} size="sm" variant="ghost" className="ml-auto text-destructive" confirm={`¿Marcar a ${e.nombre} como retirado?`} successMessage="Empleado retirado">
                        Retirar
                      </ActionButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/empleados" />
    </>
  );
}
