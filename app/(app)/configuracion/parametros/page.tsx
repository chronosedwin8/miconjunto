import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/auth/context";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Section } from "@/components/app/page-header";
import { iaDisponible } from "@/lib/ia/disponible";
import { guardarParametrosAction } from "../actions";

export const metadata = { title: "Parámetros" };

export default async function ParametrosPage() {
  const ctx = await requirePage("configuracion.ver");
  const c = conjuntoConfig(ctx);
  return (
    <div className="space-y-2">
      <Section titulo="Cartera y recaudo">
        <ActionForm action={guardarParametrosAction} successMessage="Parámetros de cartera guardados">
          <FormGrid cols={3}>
            <TextField name="cartera.diaGeneracion" label="Día de generación de cuotas" type="number" defaultValue={c.cartera.diaGeneracion} />
            <TextField name="cartera.diaVencimiento" label="Día de vencimiento" type="number" defaultValue={c.cartera.diaVencimiento} />
            <TextField name="cartera.diaProntoPago" label="Día límite de pronto pago" type="number" defaultValue={c.cartera.diaProntoPago} />
            <TextField name="cartera.porcentajeProntoPago" label="% descuento pronto pago" inputMode="decimal" defaultValue={c.cartera.porcentajeProntoPago} />
            <TextField name="cartera.diasGraciaMora" label="Días de gracia antes de mora" type="number" defaultValue={c.cartera.diasGraciaMora} />
            <SelectField
              name="cartera.calculoCuota"
              label="Cálculo de la cuota"
              options={[
                { value: "COEFICIENTE", label: "Por coeficiente (presupuesto × coef.)" },
                { value: "VALOR_FIJO", label: "Valor fijo por unidad" },
              ]}
              defaultValue={c.cartera.calculoCuota}
              placeholder={false}
            />
          </FormGrid>
          <TextField
            name="cartera.ordenAplicacion"
            label="Orden de aplicación de pagos"
            defaultValue={c.cartera.ordenAplicacion.join(",")}
            hint="Separado por comas. Opciones: INTERES_MORA, MULTA, ANTIGUAS, ACTUALES. Por defecto: intereses → más antiguas → actuales (Ley 675 art. 30)."
          />
          <p className="text-sm text-muted-foreground">
            La tasa de interés de mora vigente ({c.cartera.tasaMoraMensual} % mensual · {c.cartera.tasaMoraEA} % E.A.) se actualiza en <b>Cartera → Tasa de mora</b>.
          </p>
        </ActionForm>
      </Section>

      <Section titulo="Bloqueos por mora y paz y salvo">
        <ActionForm action={guardarParametrosAction} successMessage="Guardado">
          <FormGrid cols={3}>
            <CheckboxField name="bloqueoMora.reservas" label="Bloquear reservas" defaultChecked={c.bloqueoMora.reservas} />
            <CheckboxField name="bloqueoMora.pazYSalvo" label="Bloquear paz y salvo" defaultChecked={c.bloqueoMora.pazYSalvo} />
            <CheckboxField name="bloqueoMora.votacion" label="Bloquear votación a morosos" defaultChecked={c.bloqueoMora.votacion} />
          </FormGrid>
          <FormGrid>
            <TextField name="bloqueoMora.montoMinimo" label="Saldo vencido mínimo para considerar mora ($)" type="number" defaultValue={c.bloqueoMora.montoMinimo} />
            <TextField name="pazYSalvo.vigenciaDias" label="Vigencia del paz y salvo (días)" type="number" defaultValue={c.pazYSalvo.vigenciaDias} />
          </FormGrid>
        </ActionForm>
      </Section>

      <Section titulo="Portería">
        <ActionForm action={guardarParametrosAction} successMessage="Guardado">
          <FormGrid cols={3}>
            <TextField name="porteria.horario" label="Horario de portería" defaultValue={c.porteria.horario} />
            <TextField name="porteria.maxDiasPaquete" label="Días máximos de paquete en portería" type="number" defaultValue={c.porteria.maxDiasPaquete} />
            <TextField name="porteria.minutosRespuestaAutorizacion" label="Minutos para que el residente responda" type="number" defaultValue={c.porteria.minutosRespuestaAutorizacion} />
            <TextField name="porteria.alertaHorasPermanencia" label="Alerta de visitantes con más de (horas)" type="number" defaultValue={c.porteria.alertaHorasPermanencia} />
          </FormGrid>
          <FormGrid>
            <CheckboxField name="porteria.exigirSeguridadSocialContratistas" label="Exigir seguridad social a contratistas de obra" defaultChecked={c.porteria.exigirSeguridadSocialContratistas} />
            <CheckboxField name="porteria.emergenciaATodos" label="El botón de emergencia de portería notifica a todos los residentes" defaultChecked={c.porteria.emergenciaATodos} />
          </FormGrid>
          <TextAreaField name="porteria.checklistTurno" label="Checklist de entrega de turno (uno por línea)" defaultValue={c.porteria.checklistTurno.join("\n")} />
          <FormGrid>
            <TextField name="objetosPerdidos.diasCustodia" label="Objetos encontrados: días en custodia antes de donar o cerrar" type="number" min={7} max={365} defaultValue={c.objetosPerdidos.diasCustodia} />
            <TextField name="objetosPerdidos.diasPerdido" label="Reportes de pérdida: cierre automático tras (días)" type="number" min={15} max={365} defaultValue={c.objetosPerdidos.diasPerdido} />
          </FormGrid>
        </ActionForm>
      </Section>

      <Section titulo="Notificaciones, pagos y facturación">
        <ActionForm action={guardarParametrosAction} successMessage="Guardado">
          <FormGrid cols={3}>
            <CheckboxField name="notificaciones.push" label="Notificaciones push" defaultChecked={c.notificaciones.push} />
            <CheckboxField name="notificaciones.email" label="Correo electrónico" defaultChecked={c.notificaciones.email} />
            <CheckboxField name="notificaciones.whatsapp" label="WhatsApp (requiere credenciales)" defaultChecked={c.notificaciones.whatsapp} />
          </FormGrid>
          <FormGrid cols={3}>
            <SelectField
              name="pagos.pasarela"
              label="Pasarela de pagos"
              options={[
                { value: "WOMPI", label: "Wompi (PSE, tarjetas, Nequi, Bancolombia)" },
                { value: "MERCADOPAGO", label: "Mercado Pago" },
                { value: "SIMULADOR", label: "Simulador (pruebas sin credenciales)" },
              ]}
              defaultValue={c.pagos.pasarela}
              placeholder={false}
            />
            <SelectField
              name="facturacion.proveedor"
              label="Proveedor de factura electrónica"
              options={[
                { value: "FACTUS", label: "Factus" },
                { value: "ALANUBE", label: "Alanube" },
                { value: "SIMULADO", label: "Simulado (pruebas)" },
              ]}
              defaultValue={c.facturacion.proveedor}
              placeholder={false}
            />
            <TextField name="facturacion.numberingRangeId" label="Rango de numeración DIAN (Factus)" type="number" defaultValue={c.facturacion.numberingRangeId ?? ""} />
            <TextField name="facturacion.tarifaIvaDefecto" label="Tarifa de IVA por defecto (%)" type="number" defaultValue={c.facturacion.tarifaIvaDefecto} />
            <TextField name="cobranza.maxContactosSemanaCanal" label="Máx. contactos de cobro por semana y canal" type="number" defaultValue={c.cobranza.maxContactosSemanaCanal} hint="Ley 2300 de 2023: máximo 1" />
          </FormGrid>
          <CheckboxField name="pagos.permitirAbonos" label="Permitir abonos parciales en línea" defaultChecked={c.pagos.permitirAbonos} />
          {process.env.ANTHROPIC_API_KEY ? (
            <CheckboxField name="ia.activo" label="Activar asistente con IA para residentes y administración" defaultChecked={c.ia.activo} />
          ) : (
            <p className="text-xs text-muted-foreground">El asistente con IA se habilita al configurar ANTHROPIC_API_KEY en el servidor. {iaDisponible(ctx) ? "" : "(no disponible)"}</p>
          )}
        </ActionForm>
      </Section>

      <Section titulo="Protección de datos personales (Ley 1581 de 2012)">
        <ActionForm action={guardarParametrosAction} successMessage="Política actualizada">
          <FormGrid>
            <TextField name="datos.responsable" label="Responsable del tratamiento" defaultValue={c.datos.responsable} />
            <TextField name="datos.emailContacto" label="Correo para derechos del titular" defaultValue={c.datos.emailContacto} />
            <TextField name="datos.politicaVersion" label="Versión de la política" defaultValue={c.datos.politicaVersion} hint="Al cambiarla, los usuarios deberán aceptarla de nuevo." />
          </FormGrid>
          <TextAreaField name="datos.finalidad" label="Finalidad del tratamiento" defaultValue={c.datos.finalidad} />
          <TextAreaField name="datos.politicaTexto" label="Texto completo de la política (opcional)" defaultValue={c.datos.politicaTexto} />
        </ActionForm>
      </Section>
    </div>
  );
}
