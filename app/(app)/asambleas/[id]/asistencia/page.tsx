import Link from "next/link";
import QRCode from "qrcode";
import { FileSpreadsheet, MonitorPlay } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarAsistencia, obtenerAsamblea, quorumAsamblea, ventanaAsistencia } from "@/lib/asambleas/service";
import { unidadOptions } from "@/lib/conjunto/options";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { DataList } from "@/components/app/data-list";
import { ActionButton } from "@/components/form/action-form";
import { SearchSelect, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { LiveRefresh } from "@/components/gobierno/live-refresh";
import { QuorumMeter } from "@/components/gobierno/quorum-meter";
import { appUrl } from "@/lib/email";
import { hora, num } from "@/lib/format";
import { label } from "@/lib/labels";
import { registrarAsistenciaManualAction, registrarSalidaAction } from "../../actions";

export const metadata = { title: "Asistencia y quórum" };

export default async function AsistenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["asambleas.asistencia", "asambleas.gestionar"]);
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const [q, lista, unidades] = await Promise.all([quorumAsamblea(ctx, a), listarAsistencia(ctx, id), unidadOptions(ctx)]);
  const url = appUrl(`/asambleas/${id}/asistir?c=${a.codigoAsistencia}`);
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 360 });
  const ventana = ventanaAsistencia(a);
  const registra = can(ctx, ["asambleas.asistencia", "asambleas.gestionar"]) && ventana.ok;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LiveRefresh canales={[`asamblea:${id}`]} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" render={<Link href={`/asambleas/proyector/${id}`} target="_blank" />}>
            <MonitorPlay /> Pantalla para proyector
          </Button>
          <Button variant="outline" render={<a href={`/api/export/asistencia-asamblea?asambleaId=${id}`} />}>
            <FileSpreadsheet /> Exportar
          </Button>
        </div>
      </div>
      <QuorumMeter porcentaje={q.porcentaje} requerido={q.requerido} hayQuorum={q.hayQuorum} unidades={q.unidadesPresentes} totalUnidades={q.totalUnidades} faltante={q.faltante} />

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <div className="rounded-xl border bg-card p-4 text-center">
          <p className="font-semibold">QR de asistencia</p>
          <p className="mb-3 text-xs text-muted-foreground">Proyéctalo en la sala: cada propietario lo escanea con su teléfono y registra su asistencia (y la de los poderes que representa).</p>
          <img src={qr} alt="Código QR para registrar asistencia" className="mx-auto size-56 rounded-lg border bg-white p-2" />
          <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">Código: {a.codigoAsistencia}</p>
        </div>

        <Section
          titulo={`Registro (${lista.filter((x) => !x.salidaEn).length} presentes)`}
          acciones={
            registra ? (
              <FormDialog titulo="Registrar asistencia manual" descripcion="Busca la unidad. Si viene un apoderado, elige «Por poder» (el poder debe estar aprobado)." action={registrarAsistenciaManualAction} extra={{ asambleaId: id }} triggerLabel="Registrar unidad" submitLabel="Registrar" successMessage="Asistencia registrada">
                <SearchSelect name="unidadId" label="Unidad" options={unidades} required />
                <SelectField
                  name="tipo"
                  label="Tipo"
                  placeholder={false}
                  defaultValue="PRESENCIAL"
                  options={[
                    { value: "PRESENCIAL", label: "Presencial" },
                    { value: "VIRTUAL", label: "Virtual" },
                    { value: "PODER", label: "Por poder" },
                  ]}
                />
                <TextField name="personaNombre" label="Nombre de quien asiste (opcional)" />
              </FormDialog>
            ) : null
          }
        >
          {!ventana.ok && <p className="mb-2 text-sm text-muted-foreground">{ventana.motivo}</p>}
          <DataList
            rows={lista}
            rowKey={(r) => r.id}
            empty={<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aún no hay asistentes registrados.</p>}
            columns={[
              { key: "u", header: "Unidad", primary: true, cell: (r) => <span className={r.salidaEn ? "text-muted-foreground line-through" : ""}>{r.unidad.codigo}</span> },
              { key: "n", header: "Asistente", cell: (r) => r.personaNombre ?? "—" },
              { key: "t", header: "Tipo", cell: (r) => label(r.tipo) },
              { key: "c", header: "Coeficiente", align: "right", cell: (r) => `${num(r.coeficiente, 4)} %` },
              { key: "h", header: "Hora", cell: (r) => (r.salidaEn ? `Salió ${hora(r.salidaEn)}` : hora(r.registradaEn)) },
              {
                key: "a",
                header: "",
                cell: (r) =>
                  !r.salidaEn && registra ? (
                    <ActionButton action={registrarSalidaAction} input={{ asambleaId: id, unidadId: r.unidadId }} variant="ghost" size="sm" confirm={`¿Registrar la salida de ${r.unidad.codigo}? Deja de contar para el quórum.`}>
                      Salida
                    </ActionButton>
                  ) : null,
              },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
