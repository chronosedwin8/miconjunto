import { Pencil } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { DataList } from "@/components/app/data-list";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { eliminarTorreAction, generarUnidadesAction, guardarTorreAction } from "../actions";

export const metadata = { title: "Torres" };

export default async function TorresPage() {
  const ctx = await requirePage("conjunto.ver");
  const torres = await ctx.db.torre.findMany({ orderBy: { nombre: "asc" }, include: { _count: { select: { unidades: { where: { deletedAt: null } } } } } });
  const puedeEditar = can(ctx, "conjunto.editar");
  const fields = (t?: (typeof torres)[number]) => (
    <>
      <TextField name="nombre" label="Nombre" defaultValue={t?.nombre} placeholder="Torre 4 / Bloque B" required />
      <FormGrid>
        <TextField name="pisos" label="Número de pisos" type="number" defaultValue={t?.pisos ?? 1} required />
        <TextField name="unidadesPorPiso" label="Unidades por piso" type="number" defaultValue={t?.unidadesPorPiso ?? ""} />
      </FormGrid>
      <CheckboxField name="ascensores" label="Tiene ascensores" defaultChecked={t?.ascensores} />
      <TextAreaField name="notas" label="Notas" defaultValue={t?.notas ?? ""} />
    </>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        {can(ctx, "conjunto.crear") && (
          <>
            <FormDialog titulo="Nueva torre" action={guardarTorreAction} triggerLabel="Nueva torre">
              {fields()}
            </FormDialog>
            {torres.length > 0 && (
              <FormDialog titulo="Generar unidades en bloque" descripcion="Crea apartamentos numerados por piso (ej. T4-101…T4-804). Luego ajusta coeficientes." action={generarUnidadesAction} triggerLabel="Generar unidades" triggerVariant="outline" successMessage="Unidades generadas">
                <SelectField name="torreId" label="Torre" options={torres.map((t) => ({ value: t.id, label: t.nombre }))} required />
                <FormGrid>
                  <TextField name="desdePiso" label="Desde piso" type="number" defaultValue={1} />
                  <TextField name="hastaPiso" label="Hasta piso" type="number" defaultValue={8} />
                  <TextField name="porPiso" label="Unidades por piso" type="number" defaultValue={4} />
                  <TextField name="area" label="Área privada m²" inputMode="decimal" defaultValue={70} />
                </FormGrid>
                <TextField name="prefijo" label="Prefijo del código" placeholder="T4" hint="Por defecto se toma del nombre de la torre" />
              </FormDialog>
            )}
          </>
        )}
      </div>
      <DataList
        rows={torres}
        rowKey={(t) => t.id}
        empty={undefined}
        columns={[
          { key: "nombre", header: "Torre", primary: true, cell: (t) => t.nombre },
          { key: "pisos", header: "Pisos", align: "right", cell: (t) => t.pisos },
          { key: "unidades", header: "Unidades", align: "right", cell: (t) => t._count.unidades },
          { key: "asc", header: "Ascensores", cell: (t) => (t.ascensores ? "Sí" : "No") },
          {
            key: "acc",
            header: "",
            align: "right",
            cell: (t) =>
              puedeEditar ? (
                <div className="flex justify-end gap-1">
                  <FormDialog titulo={`Editar ${t.nombre}`} action={guardarTorreAction} extra={{ id: t.id }} trigger={<Button variant="ghost" size="icon-sm" aria-label="Editar"><Pencil /></Button>}>
                    {fields(t)}
                  </FormDialog>
                  {can(ctx, "conjunto.eliminar") && (
                    <ActionButton action={eliminarTorreAction} input={{ id: t.id }} variant="ghost" size="sm" confirm={`¿Eliminar ${t.nombre}?`} successMessage="Torre eliminada">
                      Eliminar
                    </ActionButton>
                  )}
                </div>
              ) : null,
          },
        ]}
      />
    </>
  );
}
