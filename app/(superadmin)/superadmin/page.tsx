import Link from "next/link";
import { resumenPlataforma } from "@/lib/superadmin/service";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { cop } from "@/lib/format";
import { toNumber } from "@/lib/format";

export const metadata = { title: "SuperAdmin" };

export default async function SuperAdminHome() {
  const r = await resumenPlataforma();
  const mrr = r.conjuntos.reduce((a, c) => a + (c.plan ? toNumber(c.plan.precioMensual) + toNumber(c.plan.precioUnidad) * c._count.unidades : 0), 0);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Conjuntos" value={r.conjuntos.length} hint={r.porEstado.map((e) => `${e._count} ${e.estado.toLowerCase()}`).join(" · ")} />
        <StatCard label="Unidades administradas" value={r.unidades} />
        <StatCard label="Usuarios" value={r.usuarios} />
        <StatCard label="Ingreso mensual estimado" value={cop(mrr)} tone="primary" />
      </div>
      <h2 className="mb-2 font-semibold">Uso por conjunto</h2>
      <ul className="divide-y rounded-xl border bg-card text-sm">
        {r.conjuntos.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <Link href={`/superadmin/conjuntos/${c.id}`} className="font-medium text-primary">
              {c.nombre}
            </Link>
            <span className="text-muted-foreground">
              {c._count.unidades} unidades{c.plan ? ` / ${c.plan.maxUnidades}` : ""} · {c._count.membresias} usuarios · {c.plan?.nombre ?? "Sin plan"}
            </span>
            <StatusBadge value={c.estado} />
          </li>
        ))}
      </ul>
    </>
  );
}
