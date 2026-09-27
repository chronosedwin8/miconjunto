import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { insensitive, pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { SearchSelect, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { anularPazYSalvoAction, emitirPazYSalvoAction, solicitarPazYSalvoAction } from "../actions";

export const metadata = { title: "Paz y salvo" };

export default async function PazYSalvoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["paz_y_salvo.ver_todos", "paz_y_salvo.emitir"]);
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const q = spGet(sp, "q");
  const estado = spGet(sp, "estado");
  const ahora = new Date();
  const filtroEstado =
    estado === "VENCIDO"
      ? { OR: [{ estado: "VENCIDO" as const }, { estado: "VIGENTE" as const, vigenteHasta: { lt: ahora } }] }
      : estado === "VIGENTE"
        ? { estado: "VIGENTE" as const, vigenteHasta: { gte: ahora } }
        : estado
          ? { estado: estado as never }
          : {};
  const where = { AND: [q ? { OR: [{ codigo: insensitive(q) }, { unidad: { codigo: insensitive(q) } }, { personaNombre: insensitive(q) }] } : {}, filtroEstado] };
  const [rows, total, unidades] = await Promise.all([
    ctx.db.certificadoPazYSalvo.findMany({ where, include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" }, skip, take }),
    ctx.db.certificadoPazYSalvo.count({ where }),
    can(ctx, "paz_y_salvo.emitir") ? unidadOptions(ctx) : Promise.resolve([]),
  ]);
  const vig = conjuntoConfig(ctx).pazYSalvo.vigenciaDias;
  const emitir = can(ctx, "paz_y_salvo.emitir");
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        El residente lo solicita desde su cuenta: si la unidad está al día se emite automáticamente con código QR verificable en <span className="font-mono">/verificar/&lt;código&gt;</span>. Vigencia: {vig} días.
      </p>
      <ListToolbar placeholder="Buscar código, unidad o nombre…" filters={[{ name: "estado", label: "Estado", options: ["VIGENTE", "VENCIDO", "ANULADO"].map((v) => ({ value: v, label: label(v) })) }]}>
        {emitir && (
          <span className="ml-auto flex shrink-0 gap-2">
            <FormDialog titulo="Emitir paz y salvo" descripcion="Se emite solo si la unidad está al día; si no, se informa el saldo." action={solicitarPazYSalvoAction} triggerLabel="Emitir" submitLabel="Verificar y emitir" successMessage="Paz y salvo emitido">
              <SearchSelect name="unidadId" label="Unidad" options={unidades} required />
            </FormDialog>
            <FormDialog
              titulo="Paz y salvo manual"
              descripcion="Emisión por la administración con observaciones (queda auditada). Úsala solo con justificación si la unidad tiene saldo."
              action={emitirPazYSalvoAction}
              triggerLabel="Manual"
              triggerVariant="outline"
              submitLabel="Emitir"
              successMessage="Paz y salvo emitido"
              confirm="¿Emitir el paz y salvo manualmente?"
            >
              <SearchSelect name="unidadId" label="Unidad" options={unidades} required />
              <TextField name="personaNombre" label="A nombre de" placeholder="Por defecto, el propietario principal" />
              <TextField name="vigenciaDias" label="Vigencia (días)" type="number" min={1} max={365} defaultValue={vig} />
              <TextAreaField name="observaciones" label="Observaciones" required />
            </FormDialog>
          </span>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(c) => c.id}
        empty={<EmptyState titulo="Aún no hay certificados" />}
        columns={[
          { key: "c", header: "Código", primary: true, cell: (c) => <span className="font-mono">{c.codigo}</span> },
          { key: "u", header: "Unidad", cell: (c) => <Link href={`/cartera/unidades/${c.unidadId}`} className="text-primary">{c.unidad.codigo}</Link> },
          { key: "n", header: "A nombre de", hideOnMobile: true, cell: (c) => c.personaNombre ?? "—" },
          { key: "f", header: "Emitido", cell: (c) => fecha(c.fecha) },
          { key: "v", header: "Vence", cell: (c) => fecha(c.vigenteHasta) },
          { key: "t", header: "Tipo", hideOnMobile: true, cell: (c) => (c.automatico ? "Automático" : "Manual") },
          { key: "e", header: "Estado", cell: (c) => <StatusBadge value={c.estado === "VIGENTE" && c.vigenteHasta < ahora ? "VENCIDO" : c.estado} /> },
          {
            key: "x",
            header: "",
            cell: (c) => (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" render={<a href={`/api/cartera/paz-y-salvo/${c.id}`} target="_blank" rel="noopener" />}>
                  PDF
                </Button>
                {emitir && c.estado === "VIGENTE" && (
                  <FormDialog
                    titulo={`Anular ${c.codigo}`}
                    action={anularPazYSalvoAction}
                    extra={{ id: c.id }}
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        Anular
                      </Button>
                    }
                    submitLabel="Anular"
                    confirm="¿Anular el certificado? La verificación pública lo mostrará como anulado."
                    successMessage="Certificado anulado"
                  >
                    <TextAreaField name="motivo" label="Motivo" required />
                  </FormDialog>
                )}
              </span>
            ),
          },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/cartera/paz-y-salvo" />
    </>
  );
}
