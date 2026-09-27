import { Timer } from "lucide-react";
import type { Simulacro } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha, isoDate, num } from "@/lib/format";
import { listarSimulacros } from "@/lib/emergencias/service";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { StatCard } from "@/components/app/stat-card";
import { ActionButton } from "@/components/form/action-form";
import { FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { eliminarSimulacroAction, guardarSimulacroAction } from "../actions";

export const metadata = { title: "Simulacros" };

const TIPOS = ["Evacuación por sismo", "Evacuación por incendio", "Simulacro nacional de respuesta a emergencias", "Primeros auxilios", "Otro"];

function Campos({ s }: { s?: Simulacro }) {
  return (
    <>
      <FormGrid>
        <TextField name="fecha" label="Fecha" type="date" defaultValue={isoDate(s?.fecha ?? new Date())} required />
        <SelectField name="tipo" label="Tipo" options={TIPOS.map((t) => ({ value: t, label: t }))} defaultValue={s?.tipo ?? TIPOS[0]} placeholder={false} />
        <TextField name="participantes" label="Participantes" type="number" inputMode="numeric" defaultValue={s?.participantes ?? ""} required />
        <TextField name="tiempoEvacuacionMin" label="Tiempo de evacuación (minutos)" type="number" inputMode="numeric" defaultValue={s?.tiempoEvacuacionMin ?? ""} />
      </FormGrid>
      <TextAreaField name="observaciones" label="Observaciones y oportunidades de mejora" defaultValue={s?.observaciones ?? ""} />
    </>
  );
}

export default async function SimulacrosPage() {
  const ctx = await requirePage(["emergencias.ver", "emergencias.gestionar"]);
  const gestiona = can(ctx, "emergencias.gestionar");
  const rows = await listarSimulacros(ctx);
  const conTiempo = rows.filter((r) => r.tiempoEvacuacionMin);
  const promedio = conTiempo.length ? conTiempo.reduce((a, r) => a + (r.tiempoEvacuacionMin ?? 0), 0) / conTiempo.length : null;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Simulacros registrados" value={rows.length} />
        <StatCard label="Último simulacro" value={rows[0] ? fecha(rows[0].fecha) : "—"} />
        <StatCard label="Tiempo promedio de evacuación" value={promedio ? `${num(promedio, 1)} min` : "—"} icon={Timer} />
      </div>
      {gestiona && (
        <div className="mb-3">
          <FormDialog titulo="Registrar simulacro" action={guardarSimulacroAction} triggerLabel="Registrar simulacro" successMessage="Simulacro registrado">
            <Campos />
          </FormDialog>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={Timer} titulo="No hay simulacros registrados" descripcion="Registra cada simulacro con participantes y tiempo de evacuación para medir la mejora del plan." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((s) => (
            <li key={s.id} className="space-y-1 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {fecha(s.fecha)} · {s.tipo}
                </span>
                <span className="text-muted-foreground">
                  {s.participantes} participantes{s.tiempoEvacuacionMin ? ` · ${s.tiempoEvacuacionMin} min` : ""}
                </span>
              </div>
              {s.observaciones && <p className="text-muted-foreground">{s.observaciones}</p>}
              {gestiona && (
                <div className="flex gap-1">
                  <FormDialog titulo="Editar simulacro" action={guardarSimulacroAction} extra={{ id: s.id }} triggerLabel="Editar" triggerVariant="ghost" triggerSize="sm">
                    <Campos s={s} />
                  </FormDialog>
                  <ActionButton action={eliminarSimulacroAction} input={{ id: s.id }} size="sm" variant="ghost" confirm="¿Eliminar este simulacro?" successMessage="Simulacro eliminado">
                    Eliminar
                  </ActionButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
