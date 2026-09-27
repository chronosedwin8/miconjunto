import Link from "next/link";
import { Clock, ShieldCheck, ShieldAlert } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { pageParams, spFlat, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { unidadOptions } from "@/lib/conjunto/options";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { filtroGestiones } from "@/lib/cartera/filtros";
import { horarioCobranzaPermitido, siguienteHorarioPermitido } from "@/lib/cartera/cobranza";
import { label } from "@/lib/labels";
import { DataList, Pager } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { EmptyState } from "@/components/app/empty-state";
import { FormDialog } from "@/components/app/form-dialog";
import { SearchSelect, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { CANAL_OPTIONS } from "../componentes";
import { registrarGestionAction } from "../actions";

export const metadata = { title: "Gestiones de cobro" };

export default async function GestionesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("cartera.ver_todos");
  const sp = await searchParams;
  const flat = spFlat(sp);
  const { page, pageSize, skip, take } = pageParams(sp, 30);
  const where = filtroGestiones(flat);
  const [rows, total, unidades] = await Promise.all([
    ctx.db.gestionCobro.findMany({ where, include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" }, skip, take }),
    ctx.db.gestionCobro.count({ where }),
    can(ctx, "cartera.gestionar_cobro") ? unidadOptions(ctx) : Promise.resolve([]),
  ]);
  const usuarios = await ctx.db.usuario.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.usuarioId).filter((x): x is string => !!x))] } }, select: { id: true, nombre: true } });
  const un = new Map(usuarios.map((u) => [u.id, u.nombre]));
  const h = horarioCobranzaPermitido(new Date());
  const max = conjuntoConfig(ctx).cobranza.maxContactosSemanaCanal;
  return (
    <>
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-3 text-sm ${h.ok ? "border-success/30 bg-success/5" : "border-warning/40 bg-warning/10"}`}>
        {h.ok ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" /> : <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" />}
        <div>
          <p className="font-medium">{h.ok ? "Horario de cobranza permitido en este momento." : h.motivo}</p>
          <p className="text-muted-foreground">
            Ley 2300 de 2023: lunes a viernes 7:00 a. m.–7:00 p. m., sábados 8:00 a. m.–3:00 p. m., nunca domingos ni festivos. Máximo {max} contacto(s) por semana y canal por unidad. El sistema bloquea las gestiones y
            envíos que no cumplan y registra cada una.
          </p>
          {!h.ok && (
            <p className="mt-1 flex items-center gap-1 text-muted-foreground">
              <Clock className="size-4" /> Próximo horario permitido: {fechaHora(siguienteHorarioPermitido(new Date()))}
            </p>
          )}
        </div>
      </div>
      <ListToolbar placeholder="Buscar unidad o resultado…" exportRecurso="cartera-gestiones" filters={[{ name: "canal", label: "Canal", options: CANAL_OPTIONS }]}>
        {can(ctx, "cartera.gestionar_cobro") && (
          <span className="ml-auto shrink-0">
            <FormDialog
              titulo="Registrar gestión de cobro"
              descripcion="Se valida el horario legal y la frecuencia semanal por canal antes de registrar."
              action={registrarGestionAction}
              triggerLabel="Nueva gestión"
              submitLabel="Registrar"
              successMessage="Gestión registrada"
            >
              <SearchSelect name="unidadId" label="Unidad" options={unidades} required />
              <SelectField name="canal" label="Canal" options={CANAL_OPTIONS} required />
              <TextField name="resultado" label="Resultado" placeholder="Ej.: Promete pagar el viernes" />
              <TextAreaField name="notas" label="Notas" />
            </FormDialog>
          </span>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(g) => g.id}
        empty={<EmptyState titulo="Aún no hay gestiones de cobro" descripcion="Registra llamadas, correos, visitas o cartas a las unidades en mora." />}
        columns={[
          { key: "f", header: "Fecha", primary: true, cell: (g) => fechaHora(g.fecha) },
          { key: "u", header: "Unidad", cell: (g) => <Link href={`/cartera/unidades/${g.unidadId}`} className="text-primary">{g.unidad.codigo}</Link> },
          { key: "c", header: "Canal", cell: (g) => label(g.canal) },
          { key: "r", header: "Resultado", cell: (g) => g.resultado ?? "—" },
          { key: "n", header: "Notas", hideOnMobile: true, cell: (g) => g.notas ?? "" },
          { key: "p", header: "Registró", hideOnMobile: true, cell: (g) => (g.usuarioId ? (un.get(g.usuarioId) ?? "—") : "Sistema (automático)") },
        ]}
      />
      <Pager page={page} pageSize={pageSize} total={total} searchParams={flat} basePath="/cartera/gestiones" />
    </>
  );
}
