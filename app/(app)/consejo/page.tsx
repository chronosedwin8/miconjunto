import { UsersRound } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarMiembros } from "@/lib/consejo/service";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { CheckboxField, FormGrid, SearchSelect, SelectField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { fecha, isoDate } from "@/lib/format";
import { label } from "@/lib/labels";
import { retirarMiembroAction, guardarMiembroAction } from "./actions";

export const metadata = { title: "Consejo" };

const CARGOS = [
  { value: "PRESIDENTE", label: "Presidente" },
  { value: "SECRETARIO", label: "Secretario" },
  { value: "VOCAL", label: "Vocal" },
  { value: "SUPLENTE", label: "Suplente" },
];

type Miembro = Awaited<ReturnType<typeof listarMiembros>>[number];

function CamposMiembro({ m, personas }: { m?: Miembro; personas: { value: string; label: string; group?: string }[] }) {
  const inicio = m?.periodoInicio ?? new Date();
  const fin = m?.periodoFin ?? new Date(new Date().setFullYear(new Date().getFullYear() + 1));
  return (
    <>
      <SearchSelect name="personaId" label="Copropietario" options={personas} defaultValue={m?.personaId} hint="Búscalo por nombre o unidad." />
      <TextField name="nombre" label="O escribe el nombre" defaultValue={m?.personaId ? "" : (m?.nombre ?? "")} />
      <FormGrid>
        <SelectField name="cargo" label="Cargo" options={CARGOS} placeholder={false} defaultValue={m?.cargo ?? "VOCAL"} />
        <div />
        <TextField name="periodoInicio" label="Inicio del periodo" type="date" required defaultValue={isoDate(inicio)} />
        <TextField name="periodoFin" label="Fin del periodo" type="date" required defaultValue={isoDate(fin)} />
      </FormGrid>
      <CheckboxField name="activo" label="Activo" defaultChecked={m?.activo ?? true} />
    </>
  );
}

export default async function ConsejoPage() {
  const ctx = await requirePage("consejo.ver");
  const gestiona = can(ctx, "consejo.gestionar");
  const miembros = await listarMiembros(ctx, { incluirInactivos: gestiona });
  const personas = gestiona
    ? (
        await ctx.db.vinculoUnidad.findMany({
          where: { estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] }, persona: { deletedAt: null } },
          select: { persona: { select: { id: true, nombres: true, apellidos: true } }, unidad: { select: { codigo: true } } },
        })
      )
        .map((v) => ({ value: v.persona.id, label: `${v.persona.nombres} ${v.persona.apellidos}`, group: v.unidad.codigo }))
        .filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i)
        .sort((a, b) => a.label.localeCompare(b.label, "es"))
    : [];
  const vigentes = miembros.filter((m) => m.vigente);
  const otros = miembros.filter((m) => !m.vigente);

  const tarjeta = (m: Miembro) => (
    <li key={m.id} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {m.nombre
            .split(" ")
            .slice(0, 2)
            .map((s) => s[0])
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{m.nombre}</p>
          <p className="text-sm text-muted-foreground">
            <Badge variant={m.cargo === "PRESIDENTE" ? "default" : "secondary"}>{label(m.cargo)}</Badge> {m.unidadCodigo ? `· ${m.unidadCodigo}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Periodo {fecha(m.periodoInicio)} – {fecha(m.periodoFin)}
            {!m.activo ? " · retirado" : ""}
          </p>
        </div>
      </div>
      {gestiona && (
        <div className="flex shrink-0 flex-col gap-1">
          <FormDialog titulo="Editar miembro" action={guardarMiembroAction} extra={{ id: m.id }} triggerLabel="Editar" triggerVariant="ghost" triggerSize="sm">
            <CamposMiembro m={m} personas={personas} />
          </FormDialog>
          {m.activo && (
            <ActionButton action={retirarMiembroAction} input={{ id: m.id }} variant="ghost" size="sm" confirm={`¿Retirar a ${m.nombre} del consejo?`}>
              Retirar
            </ActionButton>
          )}
        </div>
      )}
    </li>
  );

  return (
    <>
      <Section
        titulo={`Miembros vigentes (${vigentes.length})`}
        acciones={
          gestiona ? (
            <FormDialog titulo="Agregar miembro del consejo" descripcion="El consejo lo elige la asamblea general (Ley 675, art. 53)." action={guardarMiembroAction} triggerLabel="Agregar miembro">
              <CamposMiembro personas={personas} />
            </FormDialog>
          ) : null
        }
      >
        {vigentes.length ? <ul className="grid gap-3 md:grid-cols-2">{vigentes.map(tarjeta)}</ul> : <EmptyState icon={UsersRound} titulo="No hay miembros vigentes" descripcion="Registra los miembros elegidos en la última asamblea." />}
      </Section>
      {otros.length > 0 && (
        <Section titulo="Periodos anteriores e inactivos">
          <ul className="grid gap-3 md:grid-cols-2">{otros.map(tarjeta)}</ul>
        </Section>
      )}
    </>
  );
}
