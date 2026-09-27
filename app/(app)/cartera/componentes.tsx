import { FormDialog } from "@/components/app/form-dialog";
import { FileField, FormGrid, MoneyField, SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { cop, fecha, isoDate, isoDateTimeLocal } from "@/lib/format";
import { label } from "@/lib/labels";
import type { Option } from "@/components/form/fields";
import { anularCuotaAction, anularPagoAction, crearCargoAction, registrarGestionAction, registrarPagoAction } from "./actions";

export const MEDIO_OPTIONS = ["EFECTIVO", "TRANSFERENCIA", "CONSIGNACION", "PSE", "NEQUI", "BANCOLOMBIA_QR", "TARJETA"].map((v) => ({ value: v, label: label(v) }));
export const CANAL_OPTIONS = ["LLAMADA", "CORREO", "VISITA", "WHATSAPP", "CARTA", "SMS"].map((v) => ({ value: v, label: label(v) }));

type CuotaSel = { id: string; descripcion: string; saldo: number; fechaVencimiento: Date; diasMora: number };

/** Registrar pago manual (efectivo, transferencia con comprobante, consignación). Con `cuotas`, permite elegir a qué aplicar. */
export function RegistrarPagoDialog({ unidadId, unidades, cuotas, sugerido, trigger, triggerLabel = "Registrar pago" }: { unidadId?: string; unidades?: Option[]; cuotas?: CuotaSel[]; sugerido?: number; trigger?: React.ReactNode; triggerLabel?: string }) {
  return (
    <FormDialog
      titulo="Registrar pago"
      descripcion="El pago se aplica automáticamente en el orden legal (intereses, cuotas más antiguas, actuales). Si eliges cuotas, se aplican primero a esas."
      action={registrarPagoAction}
      extra={unidadId ? { unidadId } : undefined}
      triggerLabel={triggerLabel}
      trigger={trigger}
      submitLabel="Registrar y generar recibo"
      successMessage="Pago registrado. Recibo generado."
      confirm="¿Confirmas el registro de este pago? Se generará un recibo de caja con consecutivo."
      wide
    >
      {!unidadId && unidades && <SearchSelect name="unidadId" label="Unidad" options={unidades} required />}
      <FormGrid>
        <MoneyField name="valor" label="Valor recibido" defaultValue={sugerido && sugerido > 0 ? sugerido : undefined} required />
        <TextField name="fecha" label="Fecha y hora del pago" type="datetime-local" defaultValue={isoDateTimeLocal(new Date())} required />
        <SelectField name="medio" label="Medio de pago" options={MEDIO_OPTIONS} defaultValue="TRANSFERENCIA" placeholder={false} required />
        <TextField name="referenciaExterna" label="N.º de transacción / consignación" placeholder="Opcional" />
      </FormGrid>
      <FileField name="comprobanteUrl" label="Comprobante" hint="Obligatorio para transferencias y consignaciones. Puedes tomar una foto." accept="image/*,application/pdf" folder="comprobantes" />
      {cuotas && cuotas.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Aplicar primero a (opcional)</legend>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {cuotas.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="checkbox" name="cuotaIds[]" value={c.id} className="size-5 accent-[var(--brand)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.descripcion}</span>
                    <span className="text-xs text-muted-foreground">
                      Vence {fecha(c.fechaVencimiento)}
                      {c.diasMora > 0 ? ` · ${c.diasMora} días de mora` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{cop(c.saldo)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <FormGrid>
        <TextField name="pagadorNombre" label="Nombre de quien paga" placeholder="Opcional" />
        <TextField name="observaciones" label="Observaciones" placeholder="Opcional" />
      </FormGrid>
    </FormDialog>
  );
}

export function AnularPagoDialog({ id, numeroRecibo, valor }: { id: string; numeroRecibo: number | null; valor: number }) {
  return (
    <FormDialog
      titulo={`Anular recibo N.º ${numeroRecibo ?? "—"}`}
      descripcion={`Se revertirá la aplicación de ${cop(valor)} a las cuotas y quedará registrado en la auditoría.`}
      action={anularPagoAction}
      extra={{ id }}
      trigger={
        <Button size="sm" variant="ghost" className="text-destructive">
          Anular
        </Button>
      }
      submitLabel="Anular pago"
      successMessage="Pago anulado"
      confirm="¿Anular este pago? Esta acción no se puede deshacer."
    >
      <TextAreaField name="motivo" label="Motivo de la anulación" required placeholder="Ej.: consignación rechazada por el banco" />
    </FormDialog>
  );
}

export function AnularCuotaDialog({ id, descripcion }: { id: string; descripcion: string }) {
  return (
    <FormDialog
      titulo="Anular cuota"
      descripcion={descripcion}
      action={anularCuotaAction}
      extra={{ id }}
      trigger={
        <Button size="sm" variant="ghost" className="text-destructive">
          Anular
        </Button>
      }
      submitLabel="Anular cuota"
      successMessage="Cuota anulada"
      confirm="¿Anular esta cuota? Se registrará un movimiento de reversión."
    >
      <TextAreaField name="motivo" label="Motivo" required placeholder="Ej.: cargo duplicado" />
    </FormDialog>
  );
}

export function CrearCargoDialog({ unidadId, unidades, conceptos }: { unidadId?: string; unidades?: Option[]; conceptos: Option[] }) {
  const en30 = new Date(Date.now() + 15 * 86_400_000);
  return (
    <FormDialog
      titulo="Nuevo cargo"
      descripcion="Crea un cobro individual a la unidad (p. ej. reposición de control, daño, servicio). Si el concepto grava IVA se calcula automáticamente."
      action={crearCargoAction}
      extra={unidadId ? { unidadId } : undefined}
      triggerLabel="Nuevo cargo"
      triggerVariant={unidadId ? "outline" : "default"}
      submitLabel="Crear cargo"
      successMessage="Cargo creado"
      confirm="¿Crear este cargo en la cuenta de la unidad?"
    >
      {!unidadId && unidades && <SearchSelect name="unidadId" label="Unidad" options={unidades} required />}
      <SelectField name="conceptoId" label="Concepto" options={conceptos} required />
      <FormGrid>
        <MoneyField name="valorBase" label="Valor (antes de IVA)" required />
        <TextField name="fechaVencimiento" label="Vence" type="date" defaultValue={isoDate(en30)} required />
      </FormGrid>
      <TextField name="descripcion" label="Descripción" placeholder="Ej.: Reposición de tarjeta de acceso" />
    </FormDialog>
  );
}

export type EstadoCanal = { canal: string; ok: boolean; motivo?: string };

export function GestionDialog({ unidadId, estados, triggerVariant = "outline" }: { unidadId?: string; estados?: EstadoCanal[]; triggerVariant?: "outline" | "default" }) {
  const disponibles = estados ? CANAL_OPTIONS.filter((c) => estados.find((e) => e.canal === c.value)?.ok) : CANAL_OPTIONS;
  return (
    <FormDialog
      titulo="Registrar gestión de cobro"
      descripcion="Ley 2300 de 2023: solo de lunes a viernes de 7:00 a. m. a 7:00 p. m. y sábados de 8:00 a. m. a 3:00 p. m.; nunca domingos ni festivos; máximo un contacto por semana y canal."
      action={registrarGestionAction}
      extra={unidadId ? { unidadId } : undefined}
      triggerLabel="Gestión de cobro"
      triggerVariant={triggerVariant}
      submitLabel="Registrar gestión"
      successMessage="Gestión registrada"
    >
      {estados && (
        <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
          {estados.map((e) => (
            <li key={e.canal} title={e.motivo} className={`rounded-lg border px-2 py-1.5 ${e.ok ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5 text-muted-foreground"}`}>
              <b>{label(e.canal)}</b>: {e.ok ? "disponible" : "bloqueado"}
            </li>
          ))}
        </ul>
      )}
      {estados && disponibles.length === 0 ? (
        <p className="rounded-lg bg-warning/10 p-3 text-sm">{estados[0]?.motivo ?? "No hay canales disponibles en este momento."}</p>
      ) : (
        <SelectField name="canal" label="Canal" options={disponibles} required />
      )}
      <TextField name="resultado" label="Resultado" placeholder="Ej.: Promete pagar el 15; no contestó; dejó mensaje" />
      <TextAreaField name="notas" label="Notas" />
    </FormDialog>
  );
}
