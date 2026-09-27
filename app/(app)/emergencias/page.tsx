import { MapPin, Phone, ShieldPlus } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { can } from "@/lib/permisos";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { listarBrigadistas, obtenerPlan } from "@/lib/emergencias/service";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { TextAreaField } from "@/components/form/fields";
import { guardarPlanAction } from "./actions";
import { ActivarEmergencia } from "./activar-dialog";

export const metadata = { title: "Plan de emergencia" };

export default async function PlanPage() {
  const ctx = await requirePage(["emergencias.ver", "emergencias.gestionar"]);
  const [plan, brigadistas] = await Promise.all([obtenerPlan(ctx), listarBrigadistas(ctx)]);
  const gestiona = can(ctx, "emergencias.gestionar");
  const puedeActivar = can(ctx, ["emergencias.gestionar", "porteria.ver"]);
  return (
    <>
      {(puedeActivar || gestiona) && (
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          {puedeActivar && <ActivarEmergencia aTodosPorDefecto={conjuntoConfig(ctx).porteria.emergenciaATodos} />}
          {gestiona && (
            <FormDialog titulo="Editar plan de emergencia" descripcion="Una línea por elemento. Separa el nombre del detalle con |" action={guardarPlanAction} triggerLabel="Editar plan" triggerVariant="outline" wide>
              <TextAreaField name="puntos" label="Puntos de encuentro" placeholder={"Parque central | frente a la torre 2\nParqueadero de visitantes | entrada principal"} defaultValue={plan.puntosEncuentro.map((p) => `${p.nombre}${p.ubicacion ? ` | ${p.ubicacion}` : ""}`).join("\n")} />
              <TextAreaField name="telefonos" label="Teléfonos de emergencia" placeholder={"Portería | 3001234567\nBomberos | 119"} defaultValue={plan.telefonosPropios ? plan.telefonos.map((t) => `${t.nombre} | ${t.numero}`).join("\n") : ""} hint="Si lo dejas vacío se muestran las líneas nacionales (123, 119, 132…)." />
              <TextAreaField name="instrucciones" label="Instrucciones de evacuación" defaultValue={plan.instrucciones} className="[&_textarea]:min-h-40" />
            </FormDialog>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titulo="Teléfonos de emergencia">
          <ul className="grid grid-cols-2 gap-2">
            {plan.telefonos.map((t) => (
              <li key={`${t.nombre}${t.numero}`}>
                <a href={`tel:${t.numero.replace(/\s/g, "")}`} className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 hover:bg-muted/60">
                  <Phone className="size-5 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block text-lg font-bold tabular-nums">{t.numero}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.nombre}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Section>

        <Section titulo="Puntos de encuentro">
          {plan.puntosEncuentro.length ? (
            <ul className="divide-y rounded-xl border bg-card">
              {plan.puntosEncuentro.map((p) => (
                <li key={p.nombre} className="flex items-start gap-3 p-3 text-sm">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
                  <span>
                    <span className="block font-medium">{p.nombre}</span>
                    {p.ubicacion && <span className="block text-muted-foreground">{p.ubicacion}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={MapPin} titulo="Sin puntos de encuentro definidos" descripcion={gestiona ? "Edita el plan para indicar a dónde deben dirigirse los residentes al evacuar." : "La administración aún no los ha publicado."} />
          )}
        </Section>
      </div>

      <Section titulo="Qué hacer en una emergencia">
        <ol className="list-decimal space-y-2 rounded-xl border bg-card p-4 pl-9 text-sm">
          {plan.instrucciones
            .split(/\r?\n/)
            .filter((l) => l.trim())
            .map((l, i) => (
              <li key={i}>{l.replace(/^\s*[-•\d.]+\s*/, "")}</li>
            ))}
        </ol>
        {plan.actualizado && <p className="mt-1 text-xs text-muted-foreground">Actualizado el {fecha(plan.actualizado)}</p>}
      </Section>

      <Section titulo={`Brigadistas (${brigadistas.length})`}>
        {brigadistas.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {brigadistas.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                <ShieldPlus className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{b.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {label(b.rol)}
                    {b.torreNombre && ` · ${b.torreNombre}`}
                  </span>
                </span>
                {b.telefono && (
                  <a href={`tel:${b.telefono}`} className="grid size-11 place-items-center rounded-full border" aria-label={`Llamar a ${b.nombre}`}>
                    <Phone className="size-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={ShieldPlus} titulo="Aún no hay brigadistas" descripcion="La administración puede registrarlos en la pestaña Brigadistas." />
        )}
      </Section>
    </>
  );
}
