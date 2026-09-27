import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha } from "@/lib/format";
import { options } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";
import { unidadOptions } from "@/lib/conjunto/options";
import { esGestor, whereIncidentes } from "@/lib/convivencia/service";
import { DataList } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { TextAreaField, TextField } from "@/components/form/fields";
import { crearIncidenteAction } from "../actions";
import { UnidadesMultiples } from "./unidades-multiples";

export const metadata = { title: "Incidentes de convivencia" };

export default async function IncidentesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  if (!esGestor(ctx)) redirect("/convivencia");
  const sp = await searchParams;
  const estado = spGet(sp, "estado");
  const [rows, unidades] = await Promise.all([
    ctx.db.incidenteConvivencia.findMany({ where: { AND: [whereIncidentes(ctx), estado ? { estado: estado as never } : {}] }, orderBy: { fecha: "desc" }, take: 200 }),
    unidadOptions(ctx),
  ]);
  const codigos = new Map(unidades.map((u) => [u.value, u.label]));
  return (
    <>
      <ListToolbar placeholder="Buscar…" filters={[{ name: "estado", label: "Estado", options: options(["ABIERTO", "EN_MEDIACION", "ACUERDO", "CERRADO", "ESCALADO"]) }]}>
        {can(ctx, "convivencia.incidentes") && (
          <div className="ml-auto shrink-0">
            <FormDialog titulo="Registrar incidente" descripcion="Conflicto entre unidades que requiere mediación." action={crearIncidenteAction} triggerLabel="Registrar incidente" successMessage="Incidente registrado" redirectTo="/convivencia/incidentes/{id}" wide>
              <TextField name="titulo" label="Título" placeholder="Ruido nocturno entre T1-502 y T1-602" required />
              <UnidadesMultiples name="unidadesIds" label="Unidades involucradas" options={unidades} />
              <TextAreaField name="descripcion" label="Descripción" required />
            </FormDialog>
          </div>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/convivencia/incidentes/${r.id}`}
        empty={<EmptyState titulo="No hay incidentes registrados" descripcion="Registra aquí los conflictos entre vecinos para hacer seguimiento a la mediación y los acuerdos." />}
        columns={[
          { key: "t", header: "Incidente", primary: true, cell: (r) => r.titulo },
          { key: "u", header: "Unidades", cell: (r) => r.unidadesIds.map((u) => codigos.get(u) ?? "").join(", ") },
          { key: "s", header: "Sesiones", align: "right", cell: (r) => (Array.isArray(r.sesiones) ? r.sesiones.length : 0) },
          { key: "f", header: "Fecha", cell: (r) => fecha(r.fecha) },
          { key: "e", header: "Estado", cell: (r) => <StatusBadge value={r.estado} /> },
        ]}
      />
    </>
  );
}
