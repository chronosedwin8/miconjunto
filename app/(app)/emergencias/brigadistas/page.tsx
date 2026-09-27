import { Phone, ShieldPlus } from "lucide-react";
import type { Brigadista } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { nombreCompleto } from "@/lib/format";
import { label, options } from "@/lib/labels";
import { listarBrigadistas } from "@/lib/emergencias/service";
import { torreOptions } from "@/lib/conjunto/options";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { FormGrid, SearchSelect, SelectField, TextField, type Option } from "@/components/form/fields";
import { eliminarBrigadistaAction, guardarBrigadistaAction } from "../actions";

export const metadata = { title: "Brigadistas" };

const ROLES = ["COORDINADOR", "PRIMEROS_AUXILIOS", "EVACUACION", "CONTRA_INCENDIO"];

function Campos({ b, personas, torres }: { b?: Brigadista; personas: Option[]; torres: Option[] }) {
  return (
    <>
      <SearchSelect name="personaId" label="Residente (opcional)" options={personas} defaultValue={b?.personaId} hint="Si eliges un residente, se toman su nombre y celular." />
      <FormGrid>
        <TextField name="nombre" label="Nombre" defaultValue={b?.nombre ?? ""} hint="Obligatorio si no eliges un residente" />
        <SelectField name="rol" label="Rol en la brigada" options={options(ROLES)} defaultValue={b?.rol ?? "EVACUACION"} placeholder={false} />
        <SelectField name="torreNombre" label="Torre que cubre" options={[...torres, { value: "Todo el conjunto", label: "Todo el conjunto" }]} defaultValue={b?.torreNombre} />
        <TextField name="telefono" label="Celular" type="tel" inputMode="tel" defaultValue={b?.telefono ?? ""} />
      </FormGrid>
    </>
  );
}

export default async function BrigadistasPage() {
  const ctx = await requirePage(["emergencias.ver", "emergencias.gestionar"]);
  const gestiona = can(ctx, "emergencias.gestionar");
  const [brigadistas, personasDb, torresDb] = await Promise.all([
    listarBrigadistas(ctx),
    gestiona ? ctx.db.persona.findMany({ where: { anonimizada: false, vinculos: { some: { estado: "ACTIVO", deletedAt: null, tipo: { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] } } } }, select: { id: true, nombres: true, apellidos: true, vinculos: { where: { estado: "ACTIVO", deletedAt: null }, select: { unidad: { select: { codigo: true } } }, take: 1 } }, orderBy: { nombres: "asc" } }) : [],
    torreOptions(ctx),
  ]);
  const personas = personasDb.map((p) => ({ value: p.id, label: nombreCompleto(p), group: p.vinculos[0]?.unidad.codigo }));
  const torres = torresDb.map((t) => ({ value: t.label, label: t.label }));
  return (
    <>
      {gestiona && (
        <div className="mb-3">
          <FormDialog titulo="Agregar brigadista" action={guardarBrigadistaAction} triggerLabel="Agregar brigadista" successMessage="Brigadista registrado">
            <Campos personas={personas} torres={torres} />
          </FormDialog>
        </div>
      )}
      {brigadistas.length === 0 ? (
        <EmptyState icon={ShieldPlus} titulo="Aún no hay brigadistas" descripcion="Conforma la brigada con residentes y personal capacitados en evacuación, primeros auxilios y control de incendios." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {brigadistas.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <ShieldPlus className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{b.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {label(b.rol)} · {b.torreNombre ?? "Sin torre asignada"}
                </span>
              </span>
              {b.telefono && (
                <a href={`tel:${b.telefono}`} className="grid size-11 place-items-center rounded-full border" aria-label={`Llamar a ${b.nombre}`}>
                  <Phone className="size-4" />
                </a>
              )}
              {gestiona && (
                <span className="flex gap-1">
                  <FormDialog titulo={`Editar a ${b.nombre}`} action={guardarBrigadistaAction} extra={{ id: b.id }} triggerLabel="Editar" triggerVariant="ghost" triggerSize="sm">
                    <Campos b={b} personas={personas} torres={torres} />
                  </FormDialog>
                  <ActionButton action={eliminarBrigadistaAction} input={{ id: b.id }} size="sm" variant="ghost" confirm={`¿Quitar a ${b.nombre} de la brigada?`} successMessage="Brigadista retirado">
                    Quitar
                  </ActionButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
