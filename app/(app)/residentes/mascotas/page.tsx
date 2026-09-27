import { PawPrint } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, spGet, insensitive, type SP } from "@/lib/pagination";
import { addDays, fecha } from "@/lib/format";
import { unidadOptions } from "@/lib/conjunto/options";
import { estadoVencimiento } from "@/lib/residentes/calculos";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { Badge } from "@/components/ui/badge";
import { ESPECIES, MascotaFields } from "../_components/campos";
import { eliminarMascotaAction, guardarMascotaAction } from "../actions";

export const metadata = { title: "Mascotas" };

export default async function MascotasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("vehiculos.ver_todos");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const q = spGet(sp, "q");
  const filtro = spGet(sp, "filtro");
  const where: Prisma.MascotaWhereInput = {
    activo: true,
    ...(q ? { OR: [{ nombre: insensitive(q) }, { raza: insensitive(q) }, { unidad: { codigo: insensitive(q) } }, { microchip: { contains: q } }] } : {}),
    ...(spGet(sp, "especie") ? { especie: spGet(sp, "especie") } : {}),
    ...(filtro === "VACUNA" ? { antirrabicaVence: { lte: addDays(new Date(), 30) } } : filtro === "PELIGROSAS" ? { potencialmentePeligrosa: true } : filtro === "SIN_POLIZA" ? { potencialmentePeligrosa: true, polizaUrl: null } : {}),
  };
  const [rows, total, unidades] = await Promise.all([
    ctx.db.mascota.findMany({ where, include: { unidad: { select: { codigo: true } } }, orderBy: [{ nombre: "asc" }], skip, take }),
    ctx.db.mascota.count({ where }),
    unidadOptions(ctx),
  ]);
  return (
    <>
      <ListToolbar
        placeholder="Buscar nombre, raza, unidad o microchip…"
        exportRecurso="mascotas"
        filters={[
          { name: "especie", label: "Especie", options: ESPECIES.map((e) => ({ value: e, label: e })) },
          {
            name: "filtro",
            label: "Alertas",
            options: [
              { value: "VACUNA", label: "Antirrábica vencida o por vencer" },
              { value: "PELIGROSAS", label: "Potencialmente peligrosas" },
              { value: "SIN_POLIZA", label: "Peligrosas sin póliza" },
            ],
          },
        ]}
      >
        {can(ctx, "vehiculos.crear") && (
          <span className="ml-auto shrink-0">
            <FormDialog titulo="Registrar mascota" action={guardarMascotaAction} triggerLabel="Mascota" triggerSize="sm" successMessage="Mascota registrada" wide>
              <MascotaFields unidades={unidades} />
            </FormDialog>
          </span>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={PawPrint} titulo="No hay mascotas con esos criterios" descripcion="Los residentes registran sus mascotas desde Mi hogar." />}
        columns={[
          {
            key: "nombre",
            header: "Nombre",
            primary: true,
            cell: (r) => (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {r.nombre}
                {r.potencialmentePeligrosa && <Badge variant={r.polizaUrl ? "warning" : "destructive"}>{r.polizaUrl ? "Ley 746" : "Sin póliza"}</Badge>}
              </span>
            ),
          },
          { key: "unidad", header: "Unidad", cell: (r) => r.unidad.codigo },
          { key: "especie", header: "Especie", cell: (r) => [r.especie, r.raza].filter(Boolean).join(" · ") },
          {
            key: "vacuna",
            header: "Antirrábica",
            cell: (r) => {
              const e = estadoVencimiento(r.antirrabicaVence);
              return e ? <StatusBadge value={e} text={fecha(r.antirrabicaVence)} /> : "—";
            },
          },
          { key: "chip", header: "Microchip", hideOnMobile: true, cell: (r) => r.microchip ?? "—" },
          {
            key: "acc",
            header: "",
            cell: (r) => (
              <span className="flex gap-1">
                {can(ctx, "vehiculos.editar") && (
                  <FormDialog titulo={`Editar ${r.nombre}`} action={guardarMascotaAction} extra={{ id: r.id }} triggerLabel="Editar" triggerVariant="ghost" triggerSize="sm" wide>
                    <MascotaFields mascota={r} unidades={unidades} />
                  </FormDialog>
                )}
                {can(ctx, "vehiculos.eliminar") && (
                  <ActionButton action={eliminarMascotaAction} input={{ id: r.id }} size="sm" variant="ghost" confirm={`¿Eliminar a ${r.nombre} del registro?`} successMessage="Mascota eliminada">
                    Eliminar
                  </ActionButton>
                )}
              </span>
            ),
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/residentes/mascotas" />
    </>
  );
}
