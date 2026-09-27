import type { Prisma } from "@prisma/client";
import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { fechaHora } from "@/lib/format";
import { insensitive, pageParams, spFlat, spGet, type SP } from "@/lib/pagination";
import { PageHeader } from "@/components/app/page-header";
import { ListToolbar } from "@/components/app/list-toolbar";
import { Pager } from "@/components/app/data-list";
import { EmptyState } from "@/components/app/empty-state";

export const metadata = { title: "Auditoría" };

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("auditoria.ver");
  const sp = await searchParams;
  const { page, pageSize, skip, take } = pageParams(sp, 40);
  const q = spGet(sp, "q");
  const where: Prisma.AuditoriaWhereInput = {
    conjuntoId: ctx.conjuntoId,
    ...(q ? { OR: [{ usuarioNombre: insensitive(q) }, { accion: insensitive(q) }, { entidad: insensitive(q) }, { entidadId: q }] } : {}),
    ...(spGet(sp, "entidad") ? { entidad: spGet(sp, "entidad") } : {}),
  };
  const [rows, total, entidades] = await Promise.all([
    prisma.auditoria.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.auditoria.count({ where }),
    prisma.auditoria.groupBy({ by: ["entidad"], where: { conjuntoId: ctx.conjuntoId }, _count: true, orderBy: { entidad: "asc" } }),
  ]);
  return (
    <>
      <PageHeader titulo="Auditoría" descripcion="Registro inmutable de operaciones sensibles: quién, qué, cuándo y desde dónde." />
      <ListToolbar placeholder="Buscar usuario, acción o id…" filters={[{ name: "entidad", label: "Entidad", options: entidades.map((e) => ({ value: e.entidad, label: `${e.entidad} (${e._count})` })) }]} />
      {rows.length === 0 && <EmptyState titulo="Sin registros" />}
      <ul className="space-y-2">
        {rows.map((a) => (
          <li key={a.id} className="rounded-xl border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <b>{a.usuarioNombre ?? "Sistema"}</b> · {a.accion.replace(/_/g, " ")} · <span className="text-muted-foreground">{a.entidad}</span>
                {a.impersonadoPorId && <span className="ml-1 rounded bg-amber-500/20 px-1 text-xs">soporte</span>}
              </p>
              <span className="text-xs text-muted-foreground">
                {fechaHora(a.createdAt)} {a.ip && `· ${a.ip}`}
              </span>
            </div>
            {(a.antes || a.despues) && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-primary">Ver cambios</summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {a.antes ? <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(a.antes, null, 1)}</pre> : <div />}
                  {a.despues ? <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(a.despues, null, 1)}</pre> : null}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
      <Pager page={page} pageSize={pageSize} total={total} searchParams={spFlat(sp)} basePath="/auditoria" />
    </>
  );
}
