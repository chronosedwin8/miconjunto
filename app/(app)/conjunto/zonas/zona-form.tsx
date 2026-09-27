import type { ZonaComun } from "@prisma/client";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FileField, FormGrid, MoneyField, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { options } from "@/lib/labels";
import { toNumber } from "@/lib/format";
import { guardarZonaAction } from "../actions";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const CATEGORIAS = ["SALON", "PISCINA", "GIMNASIO", "BBQ", "CANCHA", "JUEGOS", "TERRAZA", "SALA_JUNTAS", "COWORKING", "OTRA"] as const;

export function ZonaForm({ zona }: { zona?: ZonaComun | null }) {
  const horario = (zona?.horario ?? {}) as Record<string, { abre: string; cierra: string } | null>;
  return (
    <ActionForm
      action={guardarZonaAction}
      extra={zona ? { id: zona.id } : undefined}
      successMessage={zona ? "Zona actualizada" : "Zona creada"}
      redirectTo={zona ? undefined : "/conjunto/zonas"}
      draftKey={zona ? undefined : "nueva-zona"}
    >
      <FormGrid cols={3}>
        <TextField name="nombre" label="Nombre" defaultValue={zona?.nombre} required />
        <SelectField name="categoria" label="Categoría" options={options(CATEGORIAS)} defaultValue={zona?.categoria ?? "OTRA"} placeholder={false} />
        <TextField name="tipo" label="Tipo (texto libre)" defaultValue={zona?.tipo ?? ""} placeholder="Salón de eventos" />
        <TextField name="capacidad" label="Capacidad (personas)" type="number" defaultValue={zona?.capacidad ?? ""} />
        <SelectField name="estado" label="Estado" options={options(["ACTIVA", "MANTENIMIENTO", "INACTIVA"])} defaultValue={zona?.estado ?? "ACTIVA"} placeholder={false} />
      </FormGrid>
      <TextAreaField name="descripcion" label="Descripción" defaultValue={zona?.descripcion ?? ""} />
      <FileField name="fotos" label="Fotos" multiple folder="publico" defaultValue={zona?.fotos ?? []} />

      <fieldset className="space-y-2 rounded-xl border p-3">
        <legend className="px-1 text-sm font-semibold">Horario de operación</legend>
        {DIAS.map((d, i) => {
          const h = horario[String(i)];
          return (
            <div key={d} className="grid grid-cols-[6rem_1fr_1fr_auto] items-center gap-2 text-sm">
              <span>{d}</span>
              <input type="time" name={`horario.${i}.abre`} defaultValue={h?.abre ?? "08:00"} aria-label={`${d} abre`} className="h-10 rounded-lg border bg-background px-2" />
              <input type="time" name={`horario.${i}.cierra`} defaultValue={h?.cierra ?? "20:00"} aria-label={`${d} cierra`} className="h-10 rounded-lg border bg-background px-2" />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" name={`horario.${i}.cerrado`} value="true" defaultChecked={!!zona && !h} className="size-4" /> Cerrado
              </label>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border p-3">
        <legend className="px-1 text-sm font-semibold">Reservas</legend>
        <FormGrid cols={2}>
          <CheckboxField name="reservable" label="Se puede reservar" defaultChecked={zona?.reservable ?? true} />
          <CheckboxField name="requiereAprobacion" label="Requiere aprobación de la administración" defaultChecked={zona?.requiereAprobacion} />
          <CheckboxField name="bloqueoPorMora" label="Bloquear reservas a unidades en mora" defaultChecked={zona?.bloqueoPorMora ?? true} />
        </FormGrid>
        <FormGrid cols={3}>
          <TextField name="duracionMinimaMin" label="Duración mínima (min)" type="number" defaultValue={zona?.duracionMinimaMin ?? 60} />
          <TextField name="duracionMaximaMin" label="Duración máxima (min)" type="number" defaultValue={zona?.duracionMaximaMin ?? 240} />
          <TextField name="maxReservasMesUnidad" label="Máx. reservas por unidad al mes" type="number" defaultValue={zona?.maxReservasMesUnidad ?? 4} />
          <TextField name="anticipacionMinimaHoras" label="Anticipación mínima (horas)" type="number" defaultValue={zona?.anticipacionMinimaHoras ?? 24} />
          <TextField name="anticipacionMaximaDias" label="Anticipación máxima (días)" type="number" defaultValue={zona?.anticipacionMaximaDias ?? 60} />
          <TextField name="horasCancelacionReembolso" label="Horas para cancelar con reembolso" type="number" defaultValue={zona?.horasCancelacionReembolso ?? 48} />
        </FormGrid>
        <TextAreaField name="reglasUso" label="Reglas de uso" defaultValue={zona?.reglasUso ?? ""} />
        <TextAreaField name="politicaCancelacion" label="Política de cancelación" defaultValue={zona?.politicaCancelacion ?? ""} />
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border p-3">
        <legend className="px-1 text-sm font-semibold">Tarifa, IVA y facturación</legend>
        <p className="text-xs text-muted-foreground">
          Con tarifa 0 el uso está incluido en la cuota de administración: no se cobra IVA ni se emite factura electrónica. Si la copropiedad cobra el alquiler por separado, es un
          servicio gravado (DIAN).
        </p>
        <FormGrid cols={3}>
          <MoneyField name="tarifa" label="Tarifa por reserva" defaultValue={zona ? toNumber(zona.tarifa) : 0} />
          <MoneyField name="deposito" label="Depósito / garantía" defaultValue={zona ? toNumber(zona.deposito) : 0} />
          <TextField name="tarifaIva" label="Tarifa IVA (%)" inputMode="decimal" defaultValue={zona ? toNumber(zona.tarifaIva) : 19} />
        </FormGrid>
        <FormGrid cols={2}>
          <CheckboxField name="gravaIva" label="Grava IVA" defaultChecked={zona?.gravaIva} />
          <CheckboxField name="generaFactura" label="Genera factura electrónica" defaultChecked={zona?.generaFactura} />
        </FormGrid>
      </fieldset>
    </ActionForm>
  );
}
