import { FileSpreadsheet, MailCheck, MailOpen, MousePointerClick, Wallet } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { ASUNTO_COBRO_DEFECTO, PLANTILLA_COBRO_DEFECTO, campanasCobro } from "@/lib/pagos/campana";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { cop, fechaHora, pct } from "@/lib/format";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { DataList } from "@/components/app/data-list";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { MoneyField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { cancelarCampanaCobroAction, crearCampanaCobroAction } from "./actions";

export const metadata = { title: "Campañas de cobro" };
export const dynamic = "force-dynamic";

const tasa = (n: number, d: number) => (d > 0 ? pct((n / d) * 100, 0) : "—");

export default async function CampanasCobroPage() {
  const ctx = await requirePage("cartera.gestionar_cobro");
  const campanas = await campanasCobro(ctx);
  const ultima = campanas.find((c) => c.estado === "ENVIADA" || c.estado === "ENVIANDO");
  const cfg = conjuntoConfig(ctx);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Campañas de cobro</h2>
          <p className="text-sm text-muted-foreground">
            Correo con el estado de cuenta en PDF y un link de pago único para cada unidad con saldo. Automática el día {cfg.cartera.diaGeneracion} de cada mes
            a las 9:00 a. m.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- descarga de archivo */}
          <Button variant="outline" render={<a href="/api/export/campanas-cobro?formato=xlsx" />}>
            <FileSpreadsheet /> Excel
          </Button>
          <FormDialog
            titulo="Nueva campaña de cobro"
            descripcion="Se envía a los propietarios de las unidades con saldo mayor al mínimo. Fuera del horario de la Ley 2300 queda programada para el siguiente horario permitido."
            action={crearCampanaCobroAction}
            triggerLabel="Nueva campaña"
            submitLabel="Enviar campaña"
            successMessage="Campaña creada"
            confirm="¿Enviar el cobro de administración a todas las unidades con saldo?"
            wide
          >
            <TextField name="asunto" label="Asunto" defaultValue={ASUNTO_COBRO_DEFECTO} required />
            <TextAreaField
              name="plantilla"
              label="Mensaje"
              defaultValue={PLANTILLA_COBRO_DEFECTO}
              rows={9}
              required
              hint="Variables: {{nombre}}, {{unidad}}, {{saldo}}, {{vencido}}, {{link_pago}}, {{conjunto}}, {{mes}}. Separa párrafos con una línea en blanco."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="programadaPara" label="Programar para (opcional)" type="datetime-local" hint="Vacío: se envía ahora." />
              <MoneyField name="montoMinimo" label="Saldo mínimo para enviar" defaultValue={cfg.bloqueoMora.montoMinimo} />
            </div>
          </FormDialog>
        </div>
      </div>

      {ultima && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Correos enviados"
            value={`${ultima.enviados} / ${ultima.total}`}
            hint={`${ultima.unidades ?? "—"} unidades · ${fechaHora(ultima.creada)}`}
            icon={MailCheck}
          />
          <StatCard label="Aperturas" value={tasa(ultima.aperturas, ultima.enviados)} hint={`${ultima.aperturas} correos abiertos`} icon={MailOpen} />
          <StatCard label="Clics al link de pago" value={tasa(ultima.clics, ultima.enviados)} hint={`${ultima.clics} clics`} icon={MousePointerClick} />
          <StatCard label="Pagado desde el link" value={cop(ultima.recaudado)} hint={`${ultima.pagos} pagos en línea`} icon={Wallet} tone="success" />
        </div>
      )}

      <Section titulo="Historial">
        <DataList
          rows={campanas}
          rowKey={(c) => c.id}
          empty={
            <EmptyState
              icon={MailCheck}
              titulo="Aún no hay campañas de cobro"
              descripcion="Envía la primera: cada propietario recibe su estado de cuenta y un link para pagar sin iniciar sesión."
            />
          }
          columns={[
            {
              key: "asunto",
              header: "Campaña",
              primary: true,
              cell: (c) => (
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.asunto}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.automatica ? "Automática" : "Manual"} · {fechaHora(c.estado === "PROGRAMADA" ? c.programadaPara : c.creada)}
                    {c.omitidos > 0 && ` · ${c.omitidos} omitidas por Ley 2300`}
                  </p>
                </div>
              ),
            },
            { key: "estado", header: "Estado", cell: (c) => <StatusBadge value={c.estado} /> },
            { key: "enviados", header: "Enviados", align: "right", cell: (c) => `${c.enviados} / ${c.total}` },
            { key: "aperturas", header: "Aperturas", align: "right", cell: (c) => `${c.aperturas} (${tasa(c.aperturas, c.enviados)})` },
            { key: "clics", header: "Clics", align: "right", cell: (c) => `${c.clics} (${tasa(c.clics, c.enviados)})` },
            { key: "pagos", header: "Pagos", align: "right", cell: (c) => `${c.pagos} · ${cop(c.recaudado)}` },
            {
              key: "acciones",
              header: "",
              cell: (c) =>
                c.estado === "PROGRAMADA" ? (
                  <ActionButton
                    action={cancelarCampanaCobroAction}
                    input={{ id: c.id }}
                    variant="outline"
                    size="sm"
                    confirm="¿Cancelar esta campaña programada?"
                    successMessage="Campaña cancelada"
                  >
                    Cancelar
                  </ActionButton>
                ) : null,
            },
          ]}
        />
      </Section>
    </>
  );
}
