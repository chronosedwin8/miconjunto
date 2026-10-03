import Link from "next/link";
import { FileDown } from "lucide-react";
import type { EstadoCotizacionComercial } from "@prisma/client";
import { spGet, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { cop, PLAN_LABEL, type PlanComercial } from "@/lib/comercial/precios";
import { listarCotizaciones } from "@/lib/comercial/service";
import { ListToolbar } from "@/components/app/list-toolbar";
import { DataList } from "@/components/app/data-list";
import { StatCard } from "@/components/app/stat-card";
import { FormDialog } from "@/components/app/form-dialog";
import { SelectAction } from "@/components/form/select-action";
import { TextAreaField } from "@/components/form/fields";
import { cn } from "@/lib/utils";
import { actualizarCotizacionAction } from "../actions";

export const metadata = { title: "Cotizaciones comerciales" };

const ESTADOS: { value: EstadoCotizacionComercial; label: string }[] = [
  { value: "NUEVA", label: "Nueva" },
  { value: "CONTACTADA", label: "Contactada" },
  { value: "GANADA", label: "Ganada" },
  { value: "PERDIDA", label: "Perdida" },
];

export default async function CotizacionesSaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const estadoSp = spGet(sp, "estado");
  const estado = ESTADOS.some((e) => e.value === estadoSp) ? (estadoSp as EstadoCotizacionComercial) : null;
  const filas = await listarCotizaciones({ estado, q: spGet(sp, "q") });
  const todas = estado ? await listarCotizaciones({}) : filas;
  const nuevas = todas.filter((c) => c.estado === "NUEVA").length;
  const ganadas = todas.filter((c) => c.estado === "GANADA");
  const abiertas = todas.filter((c) => c.estado === "NUEVA" || c.estado === "CONTACTADA");
  const chip = (v: string | null, label: string) => (
    <Link
      key={label}
      href={v ? `/superadmin/cotizaciones?estado=${v}` : "/superadmin/cotizaciones"}
      aria-current={estado === v ? "page" : undefined}
      className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", estado === v ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
    >
      {label}
    </Link>
  );
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Nuevas sin atender" value={nuevas} tone={nuevas ? "warning" : "default"} />
        <StatCard label="En curso" value={abiertas.length} hint={cop(abiertas.reduce((s, c) => s + Number(c.total), 0))} />
        <StatCard label="Ganadas" value={ganadas.length} tone="success" hint={cop(ganadas.reduce((s, c) => s + Number(c.total), 0))} />
        <StatCard label="Conjuntos cotizados" value={todas.reduce((s, c) => s + c.cantidad, 0)} />
      </div>
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0">
        {chip(null, "Todas")}
        {ESTADOS.map((e) => chip(e.value, e.label))}
      </div>
      <ListToolbar placeholder="Buscar por número, nombre, empresa o correo…" />
      <DataList
        rows={filas}
        rowKey={(c) => c.id}
        empty="Aún no hay cotizaciones desde la página de precios."
        columns={[
          { key: "n", header: "Cotización", primary: true, cell: (c) => `${c.numero} · ${c.nombre}${c.empresa ? ` (${c.empresa})` : ""}` },
          { key: "c", header: "Contacto", cell: (c) => `${c.email} · ${c.telefono}${c.ciudad ? ` · ${c.ciudad}` : ""}` },
          { key: "p", header: "Plan", cell: (c) => `${PLAN_LABEL[c.plan as PlanComercial]} · ${c.cantidad} conjunto(s)` },
          { key: "t", header: "Total anual", cell: (c) => <span className="font-semibold tabular-nums">{cop(Number(c.total))}{Number(c.descuento) > 0 ? " (−10 %)" : ""}</span> },
          { key: "f", header: "Fecha", cell: (c) => fechaHora(c.createdAt) },
          {
            key: "e",
            header: "Estado",
            cell: (c) => <SelectAction action={actualizarCotizacionAction} input={{ id: c.id, notas: c.notas ?? "" }} field="estado" value={c.estado} options={ESTADOS} ariaLabel={`Estado de ${c.numero}`} />,
          },
          {
            key: "a",
            header: "",
            cell: (c) => (
              <div className="flex gap-2">
                <a href={`/api/cotizaciones/${c.token}/pdf`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-sm hover:bg-muted">
                  <FileDown className="size-4" /> PDF
                </a>
                <FormDialog titulo={`Notas · ${c.numero}`} action={actualizarCotizacionAction} triggerLabel="Notas" triggerVariant="outline" triggerSize="sm" extra={{ id: c.id, estado: c.estado }}>
                  {c.mensaje && <p className="rounded-lg bg-muted p-3 text-sm">Mensaje del cliente: {c.mensaje}</p>}
                  <TextAreaField name="notas" label="Notas internas" defaultValue={c.notas ?? ""} />
                </FormDialog>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
