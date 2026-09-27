import Link from "next/link";
import { FileSignature } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { listarContratos } from "@/lib/proveedores/service";
import { proveedorOptions } from "@/lib/mantenimiento/service";
import { cop, fecha } from "@/lib/format";
import { options } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { DataList } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ContratoFields } from "../contrato-fields";
import { guardarContratoAction } from "../actions";

export const metadata = { title: "Contratos" };

export default async function ContratosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("proveedores.ver");
  const sp = await searchParams;
  const estado = spGet(sp, "estado");
  const rows = (await listarContratos(ctx, { q: spGet(sp, "q") })).filter((c) => !estado || c.estadoCalculado === estado);
  const proveedores = can(ctx, "proveedores.crear") ? await proveedorOptions(ctx) : [];
  return (
    <>
      <ListToolbar placeholder="Buscar por objeto o proveedor…" exportRecurso="contratos" filters={[{ name: "estado", label: "Estado", options: options(["VIGENTE", "POR_VENCER", "VENCIDO", "TERMINADO"]) }]}>
        {can(ctx, "proveedores.crear") && (
          <FormDialog titulo="Nuevo contrato" action={guardarContratoAction} triggerLabel="Nuevo contrato" triggerSize="sm" successMessage="Contrato guardado">
            <ContratoFields proveedores={proveedores} />
          </FormDialog>
        )}
      </ListToolbar>
      <DataList
        rows={rows}
        rowKey={(c) => c.id}
        rowHref={(c) => `/proveedores/${c.proveedorId}`}
        empty={<EmptyState icon={FileSignature} titulo="Sin contratos" descripcion="Registra los contratos de vigilancia, aseo, ascensores y demás servicios para recibir alertas antes de su vencimiento." />}
        columns={[
          {
            key: "obj",
            header: "Contrato",
            primary: true,
            cell: (c) => (
              <span className="block">
                {c.objeto}
                <span className="block text-xs font-normal text-muted-foreground">{c.proveedor.razonSocial}</span>
              </span>
            ),
          },
          { key: "valor", header: "Valor", align: "right", cell: (c) => cop(c.valor) },
          { key: "vig", header: "Vigencia", cell: (c) => `${fecha(c.inicio)} – ${fecha(c.fin)}` },
          {
            key: "dias",
            header: "Vence",
            cell: (c) =>
              c.estadoCalculado === "TERMINADO" ? "—" : <span className={cn(c.diasRestantes < 0 && "font-semibold text-destructive")}>{c.diasRestantes < 0 ? `hace ${-c.diasRestantes} días` : `en ${c.diasRestantes} días`}</span>,
          },
          { key: "renov", header: "Renovación", hideOnMobile: true, cell: (c) => (c.renovacionAutomatica ? "Automática" : "Manual") },
          { key: "estado", header: "Estado", cell: (c) => <StatusBadge value={c.estadoCalculado} /> },
        ]}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        El estado se recalcula a diario (07:00) y se avisa a la administración con los días de alerta de cada contrato. <Link href="/mantenimiento/vencimientos?tipo=CONTRATO" className="text-primary">Ver vencimientos</Link>
      </p>
    </>
  );
}
