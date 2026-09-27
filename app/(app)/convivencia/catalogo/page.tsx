import { Pencil } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { cop, toNumber } from "@/lib/format";
import { options } from "@/lib/labels";
import { listarInfracciones } from "@/lib/convivencia/service";
import { DataList } from "@/components/app/data-list";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { CheckboxField, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { guardarInfraccionAction } from "../actions";

export const metadata = { title: "Catálogo de infracciones" };

export default async function CatalogoPage() {
  const ctx = await requirePage("convivencia.infracciones");
  const rows = await listarInfracciones(ctx);
  const campos = (i?: (typeof rows)[number]) => (
    <>
      <FormGrid>
        <TextField name="codigo" label="Código" defaultValue={i?.codigo} placeholder="RUI-02" required />
        <SelectField name="gravedad" label="Gravedad" options={options(["LEVE", "MODERADA", "GRAVE"])} defaultValue={i?.gravedad ?? "LEVE"} placeholder={false} />
      </FormGrid>
      <TextField name="nombre" label="Infracción" defaultValue={i?.nombre} required />
      <FormGrid>
        <MoneyField name="valorSugerido" label="Valor sugerido de la multa" defaultValue={i ? toNumber(i.valorSugerido) : 0} />
        <TextField name="articulo" label="Artículo del manual" defaultValue={i?.articulo ?? ""} placeholder="Manual de convivencia, art. 12" />
      </FormGrid>
      <TextAreaField name="descripcion" label="Descripción" defaultValue={i?.descripcion ?? ""} />
      <CheckboxField name="activo" label="Activa" defaultChecked={i?.activo ?? true} />
    </>
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Infracciones y tarifas según el manual de convivencia aprobado por la asamblea.</p>
        <FormDialog titulo="Nueva infracción" action={guardarInfraccionAction} triggerLabel="Nueva infracción" successMessage="Infracción guardada">
          {campos()}
        </FormDialog>
      </div>
      <DataList
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "n", header: "Infracción", primary: true, cell: (r) => `${r.codigo} · ${r.nombre}` },
          { key: "g", header: "Gravedad", cell: (r) => <StatusBadge value={r.gravedad} /> },
          { key: "v", header: "Valor sugerido", align: "right", cell: (r) => cop(r.valorSugerido) },
          { key: "a", header: "Artículo", hideOnMobile: true, cell: (r) => r.articulo ?? "—" },
          { key: "e", header: "Estado", cell: (r) => <StatusBadge value={r.activo ? "ACTIVA" : "INACTIVA"} /> },
          {
            key: "x",
            header: "",
            align: "right",
            cell: (r) => (
              <FormDialog titulo={`Editar ${r.codigo}`} action={guardarInfraccionAction} extra={{ id: r.id }} successMessage="Infracción actualizada" trigger={<Button variant="ghost" size="icon-sm" aria-label="Editar"><Pencil /></Button>}>
                {campos(r)}
              </FormDialog>
            ),
          },
        ]}
      />
    </>
  );
}
