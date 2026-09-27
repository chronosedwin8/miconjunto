import { Car } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { addDays, fecha } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { estadoVencimiento, normalizarPlaca } from "@/lib/residentes/calculos";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { VehiculoFields } from "../_components/campos";
import { eliminarVehiculoAction, guardarVehiculoAction } from "../actions";

export const metadata = { title: "Vehículos" };

export default async function VehiculosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("vehiculos.ver_todos");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const q = spGet(sp, "q");
  const docs = spGet(sp, "documentos");
  const limite = addDays(new Date(), 30);
  const where: Prisma.VehiculoWhereInput = {
    activo: true,
    ...(q ? { OR: [{ placa: insensitive(normalizarPlaca(q) || q) }, { unidad: { codigo: insensitive(q) } }, { marca: insensitive(q) }] } : {}),
    ...(spGet(sp, "tipo") ? { tipo: spGet(sp, "tipo") as never } : {}),
    ...(docs === "SOAT" ? { soatVence: { lte: limite } } : docs === "TECNO" ? { tecnomecanicaVence: { lte: limite } } : {}),
  };
  const [rows, total, unidades, parqueaderos] = await Promise.all([
    ctx.db.vehiculo.findMany({ where, include: { unidad: { select: { codigo: true } }, parqueadero: { select: { codigo: true } } }, orderBy: { placa: "asc" }, skip, take }),
    ctx.db.vehiculo.count({ where }),
    unidadOptions(ctx),
    ctx.db.parqueadero.findMany({ where: { tipo: { notIn: ["VISITANTES"] } }, select: { id: true, codigo: true, unidad: { select: { codigo: true } } }, orderBy: { codigo: "asc" } }),
  ]);
  const pqOpts = parqueaderos.map((p) => ({ value: p.id, label: `${p.codigo}${p.unidad ? ` · ${p.unidad.codigo}` : " · común"}` }));
  return (
    <>
      <ListToolbar
        placeholder="Buscar placa, unidad o marca…"
        exportRecurso="vehiculos"
        filters={[
          { name: "tipo", label: "Tipo", options: options(["CARRO", "MOTO", "BICICLETA", "OTRO"]) },
          {
            name: "documentos",
            label: "Documentos",
            options: [
              { value: "SOAT", label: "SOAT vencido o por vencer" },
              { value: "TECNO", label: "Tecnomecánica vencida o por vencer" },
            ],
          },
        ]}
      >
        {can(ctx, "vehiculos.crear") && (
          <span className="ml-auto shrink-0">
            <FormDialog titulo="Registrar vehículo" action={guardarVehiculoAction} triggerLabel="Vehículo" triggerSize="sm" successMessage="Vehículo registrado" wide>
              <VehiculoFields unidades={unidades} parqueaderos={pqOpts} />
            </FormDialog>
          </span>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={Car} titulo="No hay vehículos con esos criterios" descripcion="Los residentes registran sus vehículos desde Mi hogar; también puedes registrarlos aquí." />}
        columns={[
          { key: "placa", header: "Placa", primary: true, cell: (r) => <span className="font-mono font-semibold">{r.placa}</span> },
          { key: "unidad", header: "Unidad", cell: (r) => r.unidad.codigo },
          { key: "tipo", header: "Tipo", cell: (r) => label(r.tipo) },
          { key: "desc", header: "Vehículo", cell: (r) => [r.marca, r.modelo, r.color].filter(Boolean).join(" · ") || "—" },
          { key: "pq", header: "Parqueadero", hideOnMobile: true, cell: (r) => r.parqueadero?.codigo ?? "—" },
          {
            key: "soat",
            header: "SOAT",
            cell: (r) => {
              const e = estadoVencimiento(r.soatVence);
              return e ? <StatusBadge value={e} text={fecha(r.soatVence)} /> : "—";
            },
          },
          {
            key: "tecno",
            header: "Tecnomecánica",
            hideOnMobile: true,
            cell: (r) => {
              const e = estadoVencimiento(r.tecnomecanicaVence);
              return e ? <StatusBadge value={e} text={fecha(r.tecnomecanicaVence)} /> : "—";
            },
          },
          {
            key: "acc",
            header: "",
            cell: (r) => (
              <span className="flex gap-1">
                {can(ctx, "vehiculos.editar") && (
                  <FormDialog titulo={`Editar ${r.placa}`} action={guardarVehiculoAction} extra={{ id: r.id }} triggerLabel="Editar" triggerVariant="ghost" triggerSize="sm" wide>
                    <VehiculoFields vehiculo={r} unidades={unidades} parqueaderos={pqOpts} />
                  </FormDialog>
                )}
                {can(ctx, "vehiculos.eliminar") && (
                  <ActionButton action={eliminarVehiculoAction} input={{ id: r.id }} size="sm" variant="ghost" confirm={`¿Eliminar el vehículo ${r.placa}?`} successMessage="Vehículo eliminado">
                    Eliminar
                  </ActionButton>
                )}
              </span>
            ),
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/residentes/vehiculos" />
    </>
  );
}
