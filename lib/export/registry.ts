import type { Ctx } from "@/lib/auth/context";
import type { PermKey } from "@/lib/permisos/catalog";
import type { ExportColumn } from "./xlsx";

export type Exporter = {
  perm: PermKey | PermKey[];
  titulo: string;
  columns: ExportColumn[];
  /** Filas ya aplanadas (valores simples). `sp` son los parámetros de la lista (q, filtros). */
  rows: (ctx: Ctx, sp: Record<string, string | undefined>) => Promise<Record<string, unknown>[]>;
};

const g = globalThis as unknown as { __mcExporters?: Map<string, Exporter> };
const registry: Map<string, Exporter> = (g.__mcExporters ??= new Map<string, Exporter>());

export function registerExporter(name: string, e: Exporter) {
  registry.set(name, e);
}

export function getExporter(name: string) {
  return registry.get(name);
}

export function listExporters() {
  return [...registry.keys()];
}
