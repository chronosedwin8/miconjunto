import { Pencil } from "lucide-react";
import type { Parqueadero, Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { unidadOptions } from "@/lib/conjunto/options";
import { cop } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { FormGrid, MoneyField, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { guardarParqueaderoAction } from "../actions";

export const metadata = { title: "Parqueaderos" };

const TIPOS = ["PRIVADO", "COMUN", "VISITANTES", "MOTO", "BICICLETA", "DISCAPACIDAD"] as const;
const ESTADOS = ["DISPONIBLE", "ASIGNADO", "OCUPADO", "FUERA_SERVICIO"] as const;

export default async function ParqueaderosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("conjunto.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 40);
  const q = spGet(sp, "q");
  const where: Prisma.ParqueaderoWhereInput = {
    ...(q ? { OR: [{ codigo: insensitive(q) }, { unidad: { codigo: insensitive(q) } }] } : {}),
    ...(spGet(sp, "tipo") ? { tipo: spGet(sp, "tipo") as never } : {}),
    ...(spGet(sp, "estado") ? { estado: spGet(sp, "estado") as never } : {}),
  };
  const [rows, total, unidades] = await Promise.all([
    ctx.db.parqueadero.findMany({ where, include: { unidad: true }, orderBy: { codigo: "asc" }, skip, take }),
    ctx.db.parqueadero.count({ where }),
    unidadOptions(ctx),
  ]);
  const fields = (p?: Parqueadero) => (
    <>
      <FormGrid>
        <TextField name="codigo" label="Código" defaultValue={p?.codigo} required />
        <SelectField name="tipo" label="Tipo" options={options(TIPOS)} defaultValue={p?.tipo ?? "PRIVADO"} placeholder={false} />
        <TextField name="ubicacion" label="Ubicación" placeholder="Sótano 1" defaultValue={p?.ubicacion ?? ""} />
        <SelectField name="estado" label="Estado" options={options(ESTADOS)} defaultValue={p?.estado ?? "DISPONIBLE"} placeholder={false} />
      </FormGrid>
      <SearchSelect name="unidadId" label="Asignado a la unidad" options={unidades} defaultValue={p?.unidadId} />
      <FormGrid>
        <MoneyField name="tarifaHora" label="Tarifa por hora (visitantes)" defaultValue={p?.tarifaHora?.toString()} />
        <MoneyField name="tarifaDia" label="Tarifa por día (visitantes)" defaultValue={p?.tarifaDia?.toString()} />
      </FormGrid>
      <TextAreaField name="notas" label="Notas" defaultValue={p?.notas ?? ""} />
    </>
  );
  return (
    <>
      <ListToolbar
        placeholder="Buscar por código o unidad…"
        exportRecurso="parqueaderos"
        filters={[
          { name: "tipo", label: "Tipo", options: options(TIPOS) },
          { name: "estado", label: "Estado", options: options(ESTADOS) },
        ]}
      >
        {can(ctx, "conjunto.crear") && (
          <FormDialog titulo="Nuevo parqueadero" action={guardarParqueaderoAction} triggerLabel="Nuevo" triggerSize="sm">
            {fields()}
          </FormDialog>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "codigo", header: "Código", primary: true, cell: (r) => r.codigo },
          { key: "tipo", header: "Tipo", cell: (r) => label(r.tipo) },
          { key: "ubic", header: "Ubicación", cell: (r) => r.ubicacion ?? "—" },
          { key: "unidad", header: "Unidad", cell: (r) => r.unidad?.codigo ?? "—" },
          { key: "tarifa", header: "Tarifa", align: "right", cell: (r) => (r.tarifaHora ? `${cop(r.tarifaHora)}/h` : "—") },
          { key: "estado", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
          {
            key: "acc",
            header: "",
            align: "right",
            hideOnMobile: false,
            cell: (r) =>
              can(ctx, "conjunto.editar") ? (
                <FormDialog titulo={`Parqueadero ${r.codigo}`} action={guardarParqueaderoAction} extra={{ id: r.id }} trigger={<Button variant="ghost" size="icon-sm" aria-label="Editar"><Pencil /></Button>}>
                  {fields(r)}
                </FormDialog>
              ) : null,
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/conjunto/parqueaderos" />
    </>
  );
}
