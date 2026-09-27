import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fechaHora, nombreCompleto } from "@/lib/format";
import { label } from "@/lib/labels";
import { pendientesAprobacion } from "@/lib/residentes/service";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { FormDialog } from "@/components/app/form-dialog";
import { TextAreaField } from "@/components/form/fields";
import { resolverVinculoAction } from "../actions";

export const metadata = { title: "Vínculos por aprobar" };

export default async function AprobacionesPage() {
  const ctx = await requirePage("residentes.aprobar");
  const rows = await pendientesAprobacion(ctx);
  const verDoc = can(ctx, "campos.persona_documento");
  const verTel = can(ctx, "campos.persona_telefono");
  if (!rows.length) {
    return <EmptyState icon={CheckCircle2} titulo="No hay vínculos por aprobar" descripcion="Cuando un propietario registre o invite a un arrendatario, aparecerá aquí para que lo verifiques." />;
  }
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">Verifica el contrato de arrendamiento o la autorización del propietario antes de aprobar. Al aprobar un arrendatario, la unidad queda marcada como arrendada.</p>
      <ul className="space-y-2">
        {rows.map((v) => (
          <li key={v.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/residentes/${v.personaId}`} className="font-semibold text-primary hover:underline">
                  {nombreCompleto(v.persona)}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {label(v.tipo)} de <b className="text-foreground">{v.unidad.codigo}</b> · registrado {fechaHora(v.createdAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {verDoc && `${v.persona.tipoDocumento} ${v.persona.numeroDocumento}`}
                  {verTel && v.persona.telefono && ` · ${v.persona.telefono}`}
                  {v.persona.usuarioId ? " · ya creó su cuenta" : " · sin cuenta"}
                </p>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <ActionButton action={resolverVinculoAction} input={{ id: v.id, aprobar: true }} successMessage="Vínculo aprobado" className="flex-1 sm:flex-none">
                  Aprobar
                </ActionButton>
                <FormDialog titulo="Rechazar vínculo" descripcion="Se notificará al propietario con el motivo." action={resolverVinculoAction} extra={{ id: v.id, aprobar: false }} triggerLabel="Rechazar" triggerVariant="outline" submitLabel="Rechazar" successMessage="Vínculo rechazado">
                  <TextAreaField name="motivo" label="Motivo" placeholder="Ej.: falta el contrato de arrendamiento" />
                </FormDialog>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
