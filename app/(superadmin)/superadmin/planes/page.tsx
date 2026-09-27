import { prisma } from "@/lib/db";
import { MODULOS_SAAS } from "@/lib/superadmin/service";
import { FormDialog } from "@/components/app/form-dialog";
import { CheckboxField, FormGrid, MoneyField, TextAreaField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { cop, toNumber } from "@/lib/format";
import type { PlanSuscripcion } from "@prisma/client";
import { guardarPlanAction } from "../actions";

export const metadata = { title: "Planes" };

function Campos({ p }: { p?: PlanSuscripcion }) {
  return (
    <>
      <TextField name="nombre" label="Nombre" defaultValue={p?.nombre} required />
      <TextAreaField name="descripcion" label="Descripción" defaultValue={p?.descripcion ?? ""} />
      <FormGrid cols={3}>
        <MoneyField name="precioMensual" label="Precio base mensual" defaultValue={p ? toNumber(p.precioMensual) : 0} />
        <MoneyField name="precioUnidad" label="Precio por unidad" defaultValue={p ? toNumber(p.precioUnidad) : 0} />
        <TextField name="maxUnidades" label="Máx. unidades" type="number" defaultValue={p?.maxUnidades ?? 100} />
      </FormGrid>
      <input type="hidden" name="modulos[]" value="" />
      <div className="grid grid-cols-2 gap-1">
        {MODULOS_SAAS.map((m) => (
          <label key={m.value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="modulos[]" value={m.value} defaultChecked={p?.modulos.includes(m.value)} className="size-4" /> {m.label}
          </label>
        ))}
      </div>
      <CheckboxField name="activo" label="Plan activo" defaultChecked={p?.activo ?? true} />
    </>
  );
}

export default async function PlanesPage() {
  const planes = await prisma.planSuscripcion.findMany({ where: { deletedAt: null }, orderBy: { precioMensual: "asc" }, include: { _count: { select: { conjuntos: true } } } });
  return (
    <>
      <div className="mb-4">
        <FormDialog titulo="Nuevo plan" action={guardarPlanAction} triggerLabel="Nuevo plan">
          <Campos />
        </FormDialog>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {planes.map((p) => (
          <div key={p.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">{p.nombre}</h3>
              {!p.activo && <Badge variant="secondary">Inactivo</Badge>}
            </div>
            <p className="text-2xl font-bold text-primary">{cop(p.precioMensual)}</p>
            <p className="text-xs text-muted-foreground">+ {cop(p.precioUnidad)} por unidad · hasta {p.maxUnidades} unidades</p>
            <p className="my-2 text-sm">{p.descripcion}</p>
            <p className="mb-3 text-xs text-muted-foreground">{p._count.conjuntos} conjunto(s)</p>
            <FormDialog titulo={`Editar ${p.nombre}`} action={guardarPlanAction} extra={{ id: p.id }} triggerLabel="Editar" triggerVariant="outline" triggerSize="sm">
              <Campos p={p} />
            </FormDialog>
          </div>
        ))}
      </div>
    </>
  );
}
