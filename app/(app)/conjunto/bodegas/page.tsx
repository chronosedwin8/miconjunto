import { Pencil } from "lucide-react";
import type { Bodega, Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, insensitive, type SP } from "@/lib/pagination";
import { unidadOptions } from "@/lib/conjunto/options";
import { num } from "@/lib/format";
import { options } from "@/lib/labels";
import { DataList } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { FormGrid, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { guardarBodegaAction } from "../actions";

export const metadata = { title: "Bodegas" };
const ESTADOS = ["DISPONIBLE", "ASIGNADO", "OCUPADO", "FUERA_SERVICIO"] as const;

export default async function BodegasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("conjunto.ver");
  const sp = await searchParams;
  const q = spGet(sp, "q");
  const where: Prisma.BodegaWhereInput = {
    ...(q ? { OR: [{ codigo: insensitive(q) }, { unidad: { codigo: insensitive(q) } }] } : {}),
    ...(spGet(sp, "estado") ? { estado: spGet(sp, "estado") as never } : {}),
  };
  const [rows, unidades] = await Promise.all([ctx.db.bodega.findMany({ where, include: { unidad: true }, orderBy: { codigo: "asc" } }), unidadOptions(ctx)]);
  const fields = (b?: Bodega) => (
    <>
      <FormGrid>
        <TextField name="codigo" label="Código" defaultValue={b?.codigo} required />
        <TextField name="ubicacion" label="Ubicación" defaultValue={b?.ubicacion ?? ""} />
        <TextField name="area" label="Área m²" inputMode="decimal" defaultValue={b?.area?.toString() ?? ""} />
        <SelectField name="estado" label="Estado" options={options(ESTADOS)} defaultValue={b?.estado ?? "DISPONIBLE"} placeholder={false} />
      </FormGrid>
      <SearchSelect name="unidadId" label="Asignada a la unidad" options={unidades} defaultValue={b?.unidadId} />
      <TextAreaField name="notas" label="Notas" defaultValue={b?.notas ?? ""} />
    </>
  );
  return (
    <>
      <ListToolbar placeholder="Buscar bodega o unidad…" exportRecurso="bodegas" filters={[{ name: "estado", label: "Estado", options: options(ESTADOS) }]}>
        {can(ctx, "conjunto.crear") && (
          <FormDialog titulo="Nueva bodega" action={guardarBodegaAction} triggerLabel="Nueva" triggerSize="sm">
            {fields()}
          </FormDialog>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "codigo", header: "Código", primary: true, cell: (r) => r.codigo },
          { key: "ubic", header: "Ubicación", cell: (r) => r.ubicacion ?? "—" },
          { key: "area", header: "Área", align: "right", cell: (r) => (r.area ? `${num(r.area)} m²` : "—") },
          { key: "unidad", header: "Unidad", cell: (r) => r.unidad?.codigo ?? "—" },
          { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
          {
            key: "acc",
            header: "",
            align: "right",
            cell: (r) =>
              can(ctx, "conjunto.editar") ? (
                <FormDialog titulo={`Bodega ${r.codigo}`} action={guardarBodegaAction} extra={{ id: r.id }} trigger={<Button variant="ghost" size="icon-sm" aria-label="Editar"><Pencil /></Button>}>
                  {fields(r)}
                </FormDialog>
              ) : null,
          },
        ]}
      />
    </>
  );
}
