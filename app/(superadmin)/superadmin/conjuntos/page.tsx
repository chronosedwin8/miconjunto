import Link from "next/link";
import { resumenPlataforma } from "@/lib/superadmin/service";
import { DataList } from "@/components/app/data-list";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { fecha } from "@/lib/format";
import { entrarConjuntoAction } from "../actions";

export const metadata = { title: "Conjuntos" };

export default async function ConjuntosSaPage() {
  const { conjuntos } = await resumenPlataforma();
  return (
    <DataList
      rows={conjuntos}
      rowKey={(c) => c.id}
      rowHref={(c) => `/superadmin/conjuntos/${c.id}`}
      columns={[
        { key: "nombre", header: "Conjunto", primary: true, cell: (c) => c.nombre },
        { key: "ciudad", header: "Ciudad", cell: (c) => c.ciudad ?? "—" },
        { key: "nit", header: "NIT", cell: (c) => c.nit ?? "—" },
        { key: "plan", header: "Plan", cell: (c) => c.plan?.nombre ?? "—" },
        { key: "unidades", header: "Unidades", align: "right", cell: (c) => c._count.unidades },
        { key: "desde", header: "Desde", cell: (c) => fecha(c.createdAt) },
        { key: "estado", header: "Estado", cell: (c) => <StatusBadge value={c.estado} /> },
        {
          key: "acc",
          header: "",
          cell: (c) => (
            <form action={entrarConjuntoAction.bind(null, c.id)}>
              <Button size="sm" variant="outline">
                Entrar (soporte)
              </Button>
            </form>
          ),
        },
      ]}
      empty={<p className="text-sm">Aún no hay conjuntos. <Link href="/superadmin/conjuntos/nuevo">Crea el primero</Link>.</p>}
    />
  );
}
