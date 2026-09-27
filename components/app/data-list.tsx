import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Se muestra como título de la tarjeta en móvil. */
  primary?: boolean;
  /** Oculto en la tarjeta móvil. */
  hideOnMobile?: boolean;
  align?: "left" | "right" | "center";
};

/**
 * Lista responsiva: tabla en escritorio y tarjetas tocables en el teléfono.
 * Server Component (las celdas se renderizan en el servidor).
 */
export function DataList<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  empty?: React.ReactNode;
  className?: string;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState titulo="No hay registros" descripcion="Cuando existan, aparecerán aquí." />}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <div className={className}>
      {/* Móvil: tarjetas */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const content = (
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 font-medium">{primary.cell(row)}</div>
                {href && <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              </div>
              {rest.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {rest.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] text-muted-foreground">{c.header}</dt>
                      <dd className="truncate">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className="block active:opacity-80">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
      {/* Escritorio: tabla */}
      <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("px-3 py-2.5 font-medium", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr key={rowKey(row)} className="border-t hover:bg-muted/40">
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-3 py-2.5 align-middle", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.className)}>
                      {href && i === 0 ? (
                        <Link href={href} className="font-medium text-primary hover:underline">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pager({ page, pageSize, total, searchParams, basePath }: { page: number; pageSize: number; total: number; searchParams: Record<string, string | undefined>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total} registro(s)</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (v && k !== "page") sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-2 text-sm" aria-label="Paginación">
      <span className="text-muted-foreground">
        {total} registros · página {page} de {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="inline-flex h-10 items-center gap-1 rounded-lg border px-3 hover:bg-muted">
            <ChevronLeft className="size-4" /> Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className="inline-flex h-10 items-center gap-1 rounded-lg border px-3 hover:bg-muted">
            Siguiente <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
