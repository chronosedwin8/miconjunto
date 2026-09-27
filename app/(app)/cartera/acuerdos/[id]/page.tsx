import Link from "next/link";
import { FileDown } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha, toNumber } from "@/lib/format";
import { detalleAcuerdo } from "@/lib/cartera/acuerdos";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { DataList } from "@/components/app/data-list";
import { FormDialog } from "@/components/app/form-dialog";
import { FileField, SelectField, TextAreaField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Medidor } from "@/components/charts/charts";
import { adjuntarAcuerdoAction, estadoAcuerdoAction } from "../../actions";

export const metadata = { title: "Acuerdo de pago" };

export default async function AcuerdoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("cartera.ver_todos");
  const { id } = await params;
  const { acuerdo: a, plan, originales, pagado, pendiente } = await detalleAcuerdo(ctx, id);
  const total = pagado + pendiente;
  return (
    <>
      <Link href="/cartera/acuerdos" className="text-sm text-muted-foreground">
        ← Acuerdos
      </Link>
      <h2 className="mb-1 flex flex-wrap items-center gap-2 text-2xl font-bold">
        Acuerdo {a.unidad.codigo} <StatusBadge value={a.estado} />
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Suscrito el {fecha(a.fechaInicio)} · {a.numeroCuotas} cuotas el día {a.diaPago} de cada mes ·{" "}
        <Link href={`/cartera/unidades/${a.unidadId}`} className="text-primary">
          Estado de cuenta
        </Link>
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo acordado" value={cop(a.saldoInicial)} />
        <StatCard label="Pagado" value={cop(pagado)} tone="success" />
        <StatCard label="Pendiente" value={cop(pendiente)} tone={pendiente > 0 ? "warning" : "success"} />
        <StatCard label="Cuota" value={cop(a.valorCuota)} />
      </div>
      <div className="mb-4 rounded-xl border bg-card p-4">
        <Medidor label="Avance del acuerdo" valor={total > 0 ? (pagado / total) * 100 : 0} tono="good" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="outline" render={<a href={`/api/cartera/acuerdo/${a.id}`} target="_blank" rel="noopener" />}>
          <FileDown /> Documento para firma
        </Button>
        {a.documentoUrl && (
          <Button variant="outline" render={<a href={a.documentoUrl} target="_blank" rel="noopener" />}>
            Ver documento firmado
          </Button>
        )}
        {can(ctx, "cartera.acuerdos") && (
          <>
            <FormDialog titulo="Adjuntar documento firmado" action={adjuntarAcuerdoAction} extra={{ id: a.id }} triggerLabel="Adjuntar firmado" triggerVariant="outline" successMessage="Documento adjuntado">
              <FileField name="documentoUrl" label="Documento firmado" accept="image/*,application/pdf" folder="acuerdos" />
            </FormDialog>
            {a.estado === "VIGENTE" && (
              <FormDialog
                titulo="Cambiar estado del acuerdo"
                descripcion="Anular solo es posible si no tiene pagos: devuelve el saldo a las cuotas originales."
                action={estadoAcuerdoAction}
                extra={{ id: a.id }}
                triggerLabel="Cambiar estado"
                triggerVariant="outline"
                confirm="¿Cambiar el estado del acuerdo?"
                successMessage="Estado actualizado"
              >
                <SelectField name="estado" label="Nuevo estado" options={[{ value: "INCUMPLIDO", label: "Incumplido" }, { value: "ANULADO", label: "Anulado (sin pagos)" }]} required />
                <TextAreaField name="motivo" label="Motivo" />
              </FormDialog>
            )}
          </>
        )}
      </div>
      <Section titulo="Plan de pagos">
        <DataList
          rows={plan}
          rowKey={(c) => c.id}
          columns={[
            { key: "d", header: "Cuota", primary: true, cell: (c) => c.descripcion },
            { key: "v", header: "Vence", cell: (c) => fecha(c.fechaVencimiento) },
            { key: "t", header: "Valor", align: "right", cell: (c) => cop(toNumber(c.valorBase) + toNumber(c.iva)) },
            { key: "s", header: "Saldo", align: "right", cell: (c) => cop(c.saldo) },
            { key: "e", header: "Estado", cell: (c) => <StatusBadge value={c.estado === "PENDIENTE" && c.fechaVencimiento < new Date() ? "VENCIDA" : c.estado} /> },
          ]}
        />
      </Section>
      <Section titulo="Obligaciones incluidas">
        <DataList
          rows={originales}
          rowKey={(c) => c.id}
          columns={[
            { key: "d", header: "Concepto", primary: true, cell: (c) => c.descripcion ?? c.concepto.nombre },
            { key: "p", header: "Periodo", cell: (c) => c.periodo },
            { key: "v", header: "Vencía", cell: (c) => fecha(c.fechaVencimiento) },
          ]}
        />
      </Section>
      {a.observaciones && <p className="whitespace-pre-line text-sm text-muted-foreground">{a.observaciones}</p>}
    </>
  );
}
