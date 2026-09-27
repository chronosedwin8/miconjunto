import { ShieldBan } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha } from "@/lib/format";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { FileField, FormGrid, TextAreaField, TextField } from "@/components/form/fields";
import { listaNegraAction, quitarListaNegraAction } from "../actions";
import { Foto, KTitle } from "../_components/kiosk";

export const metadata = { title: "Lista negra" };

/** Personas con orden de no ingreso. El motivo solo lo ven portería y administración. */
export default async function ListaNegraPage() {
  const ctx = await requirePage(["porteria.ver", "porteria.lista_negra"]);
  const gestiona = can(ctx, "porteria.lista_negra");
  const rows = await ctx.db.visitante.findMany({ where: { listaNegra: true }, orderBy: { updatedAt: "desc" } });
  return (
    <>
      <KTitle
        acciones={
          gestiona && (
            <FormDialog titulo="Agregar orden de no ingreso" action={listaNegraAction} triggerLabel="Agregar persona" submitLabel="Agregar a la lista" successMessage="Persona agregada a la lista negra" confirm="¿Registrar la orden de no ingreso?">
              <FormGrid>
                <TextField name="nombre" label="Nombre completo" required />
                <TextField name="documento" label="Documento" />
              </FormGrid>
              <TextAreaField name="motivo" label="Motivo (visible solo para portería y administración)" required />
              <FileField name="fotoUrl" label="Foto" folder="porteria" />
            </FormDialog>
          )
        }
      >
        Lista negra
      </KTitle>
      <p className="mb-4 text-base text-muted-foreground">Si alguna de estas personas llega, no permitas el ingreso y avisa a la administración. El sistema bloquea su ingreso automáticamente.</p>
      {rows.length === 0 ? (
        <EmptyState icon={ShieldBan} titulo="No hay personas con orden de no ingreso" />
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {rows.map((v) => (
            <li key={v.id} className="flex items-start gap-3 rounded-2xl border-2 border-red-700 bg-red-50 p-3 dark:bg-red-950/30">
              <Foto src={v.fotoUrl} alt={v.nombre} className="size-20" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black">⛔ {v.nombre}</p>
                {v.numeroDocumento && <p className="text-base">Documento: {v.numeroDocumento}</p>}
                <p className="text-base">
                  <b>Motivo:</b> {v.motivoListaNegra ?? "—"}
                </p>
                <p className="text-sm text-muted-foreground">Desde {fecha(v.updatedAt)}</p>
              </div>
              {gestiona && (
                <ActionButton action={quitarListaNegraAction} input={{ id: v.id }} variant="outline" confirm={`¿Quitar a ${v.nombre} de la lista negra?`} successMessage="Retirado de la lista">
                  Quitar
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
