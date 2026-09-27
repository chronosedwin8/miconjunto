import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import type { PermKey } from "@/lib/permisos/catalog";
import { spGet, type SP } from "@/lib/pagination";
import { vePlanes } from "@/lib/mantenimiento/service";
import { tipoVencimientoLabel, vencimientos, type TipoVencimiento } from "@/lib/mantenimiento/vencimientos";
import { fecha } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { StatCard } from "@/components/app/stat-card";

export const metadata = { title: "Vencimientos" };

/** Permiso de lectura requerido para ver cada tipo de vencimiento. */
const VER: Record<TipoVencimiento, PermKey> = {
  GARANTIA: "activos.ver",
  DOCUMENTO_PROVEEDOR: "proveedores.ver",
  CONTRATO: "proveedores.ver",
  EPS: "empleados.ver",
  ARL: "empleados.ver",
  LEGAL: "mantenimiento.ver",
};

const TIPOS: TipoVencimiento[] = ["LEGAL", "CONTRATO", "DOCUMENTO_PROVEEDOR", "GARANTIA", "EPS", "ARL"];

export default async function VencimientosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("mantenimiento.ver");
  if (!vePlanes(ctx)) redirect("/mantenimiento");
  const sp = await searchParams;
  const tipo = spGet(sp, "tipo") as TipoVencimiento | undefined;
  const todos = (await vencimientos(ctx, { ventanaDias: 60 })).filter((v) => can(ctx, VER[v.tipo]));
  const lista = tipo ? todos.filter((v) => v.tipo === tipo) : todos;
  const vencidos = todos.filter((v) => v.semaforo === "VENCIDO").length;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard label="Vencidos" value={vencidos} tone={vencidos ? "danger" : "default"} />
        <StatCard label="Por vencer (60 días)" value={todos.length - vencidos} tone={todos.length - vencidos ? "warning" : "default"} />
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <Chip href="/mantenimiento/vencimientos" activo={!tipo} t={`Todos (${todos.length})`} />
        {TIPOS.filter((t) => todos.some((v) => v.tipo === t)).map((t) => (
          <Chip key={t} href={`/mantenimiento/vencimientos?tipo=${t}`} activo={tipo === t} t={`${tipoVencimientoLabel(t)} (${todos.filter((v) => v.tipo === t).length})`} />
        ))}
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={CalendarX2} titulo="Todo al día" descripcion="No hay garantías, contratos, pólizas, documentos, EPS/ARL ni certificaciones legales vencidos o por vencer en los próximos 60 días." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 [&>li]:min-w-0">
          {lista.map((v) => (
            <li key={`${v.tipo}-${v.id}`}>
              <Link href={v.enlace} className={cn("flex items-center justify-between gap-3 rounded-xl border bg-card p-3 hover:bg-muted/50", v.semaforo === "VENCIDO" && "border-destructive/40")}>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tipoVencimientoLabel(v.tipo)}</p>
                  <p className="font-medium leading-snug">{v.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">{v.detalle}</p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusBadge value={v.semaforo} />
                  <p className={cn("mt-1 text-xs", v.dias < 0 ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    {v.dias < 0 ? `hace ${-v.dias} d` : v.dias === 0 ? "hoy" : `en ${v.dias} d`} · {fecha(v.fecha)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Chip({ href, activo, t }: { href: string; activo: boolean; t: string }) {
  return (
    <Link href={href} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", activo ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
      {t}
    </Link>
  );
}
