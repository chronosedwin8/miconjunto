import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2, Vote } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { obtenerAsamblea } from "@/lib/asambleas/service";
import { parseOrdenDelDia } from "@/lib/votaciones/calculos";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { ListaEditable } from "@/components/gobierno/lista-editable";
import { agregarPuntoAction, asociarVotacionAction, eliminarPuntoAction, moverPuntoAction } from "../../actions";

export const metadata = { title: "Orden del día" };

function CamposVotacion() {
  return (
    <>
      <TextField name="pregunta" label="Pregunta a votar" placeholder="Si se deja vacío, se usa el título del punto" />
      <ListaEditable name="opciones" label="Opciones" defaultValue={["Sí, apruebo", "No apruebo", "Me abstengo"]} />
      <FormGrid>
        <SelectField
          name="tipoMayoria"
          label="Mayoría"
          placeholder={false}
          defaultValue="SIMPLE"
          options={[
            { value: "SIMPLE", label: "Simple (art. 45)" },
            { value: "CALIFICADA_70", label: "Calificada 70 % (art. 46)" },
            { value: "UNANIME", label: "Unanimidad" },
          ]}
          hint="70 %: cuotas extraordinarias, reformas al reglamento, cambios de destinación…"
        />
        <SelectField
          name="ponderacion"
          label="Ponderación"
          placeholder={false}
          defaultValue="COEFICIENTE"
          options={[
            { value: "COEFICIENTE", label: "Por coeficiente" },
            { value: "UNIDAD", label: "Por unidad" },
          ]}
        />
        <SelectField
          name="quienVota"
          label="Quién vota"
          placeholder={false}
          defaultValue="PROPIETARIOS"
          options={[
            { value: "PROPIETARIOS", label: "Propietarios" },
            { value: "PROPIETARIOS_AL_DIA", label: "Propietarios al día" },
          ]}
        />
      </FormGrid>
      <CheckboxField name="secreto" label="Voto secreto" hint="Útil para elecciones (consejo, revisor fiscal)." />
    </>
  );
}

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["asambleas.gestionar", "asambleas.crear"]);
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const puntos = parseOrdenDelDia(a.ordenDelDia);
  const votaciones = await ctx.db.votacion.findMany({ where: { asambleaId: id } });
  const editable = a.estado !== "FINALIZADA" && a.estado !== "CANCELADA";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Los puntos con votación se abren y cierran desde la pantalla <Link href={`/asambleas/${id}/conducir`} className="text-primary underline">Conducir</Link> durante la asamblea.</p>
      <ol className="space-y-2">
        {puntos.map((p, i) => {
          const v = votaciones.find((x) => x.id === p.votacionId);
          return (
            <li key={`${p.orden}-${p.titulo}`} className="rounded-xl border bg-card p-3">
              <div className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">{p.orden}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.titulo}</p>
                  {p.descripcion && <p className="text-sm text-muted-foreground">{p.descripcion}</p>}
                  {v ? (
                    <Link href={`/votaciones/${v.id}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-primary">
                      <Vote className="size-4" /> {v.pregunta} <StatusBadge value={v.estado} />
                    </Link>
                  ) : null}
                </div>
              </div>
              {editable && (
                <div className="mt-2 flex flex-wrap justify-end gap-1">
                  {!v && (
                    <FormDialog titulo={`Votación del punto ${p.orden}`} action={asociarVotacionAction} extra={{ asambleaId: id, orden: p.orden }} triggerLabel="Agregar votación" triggerVariant="outline" triggerSize="sm" wide>
                      <CamposVotacion />
                    </FormDialog>
                  )}
                  <ActionButton action={moverPuntoAction} input={{ asambleaId: id, orden: p.orden, dir: "arriba" }} variant="ghost" size="icon-sm" disabled={i === 0}>
                    <ArrowUp />
                    <span className="sr-only">Subir</span>
                  </ActionButton>
                  <ActionButton action={moverPuntoAction} input={{ asambleaId: id, orden: p.orden, dir: "abajo" }} variant="ghost" size="icon-sm" disabled={i === puntos.length - 1}>
                    <ArrowDown />
                    <span className="sr-only">Bajar</span>
                  </ActionButton>
                  <ActionButton action={eliminarPuntoAction} input={{ asambleaId: id, orden: p.orden }} variant="ghost" size="icon-sm" confirm={`¿Eliminar el punto «${p.titulo}»?`}>
                    <Trash2 />
                    <span className="sr-only">Eliminar</span>
                  </ActionButton>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {editable && (
        <FormDialog titulo="Agregar punto al orden del día" action={agregarPuntoAction} extra={{ asambleaId: id }} triggerLabel="Agregar punto" wide>
          <TextField name="titulo" label="Título del punto" required />
          <TextAreaField name="descripcion" label="Descripción (opcional)" />
          <CheckboxField name="conVotacion" label="Este punto se somete a votación" />
          <CamposVotacion />
        </FormDialog>
      )}
    </div>
  );
}
