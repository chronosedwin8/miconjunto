import { FileCheck2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { documentosPorVencer } from "@/lib/proveedores/service";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { DataList } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";

export const metadata = { title: "Documentos de proveedores" };

export default async function DocumentosProveedoresPage() {
  const ctx = await requirePage("proveedores.ver");
  const docs = await documentosPorVencer(ctx, 60);
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">RUT, cámara de comercio, pólizas, seguridad social y certificaciones vencidos o que vencen en los próximos 60 días.</p>
      <DataList
        rows={docs}
        rowKey={(d) => d.id}
        rowHref={(d) => `/proveedores/${d.proveedor.id}`}
        empty={<EmptyState icon={FileCheck2} titulo="Documentos al día" descripcion="Ningún documento de proveedores vence en los próximos 60 días." />}
        columns={[
          { key: "p", header: "Proveedor", primary: true, cell: (d) => d.proveedor.razonSocial },
          { key: "t", header: "Documento", cell: (d) => label(d.tipo) },
          { key: "v", header: "Vence", cell: (d) => fecha(d.vence) },
          { key: "s", header: "Estado", cell: (d) => <StatusBadge value={d.semaforo} /> },
        ]}
      />
    </>
  );
}
