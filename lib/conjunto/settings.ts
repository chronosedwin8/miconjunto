import type { Ctx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { configSchema, parseConfig, type ConjuntoConfig } from "./config";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

function merge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" && base[k] !== null ? merge(base[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out as T;
}

/** Actualiza parcialmente `Conjunto.config` validando con el esquema. */
export async function actualizarConfig(ctx: Ctx, patch: DeepPartial<ConjuntoConfig>) {
  const row = await ctx.db.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } });
  const antes = parseConfig(row.config);
  const despues = configSchema.parse(merge(antes as unknown as Record<string, unknown>, patch as Record<string, unknown>));
  await ctx.db.conjunto.update({ where: { id: ctx.conjuntoId }, data: { config: despues as object } });
  await audit(ctx, "editar_configuracion", "Conjunto", ctx.conjuntoId, antes, despues);
  return despues;
}

export async function actualizarDatosConjunto(
  ctx: Ctx,
  data: {
    nombre: string;
    nit?: string | null;
    digitoVerificacion?: string | null;
    direccion?: string | null;
    municipioCodigo?: string | null;
    ciudad?: string | null;
    departamento?: string | null;
    telefono?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    colorPrimario?: string | null;
    regimenTributario?: string | null;
    responsableIva: boolean;
    tipo: "EDIFICIO" | "CONJUNTO_CASAS" | "MIXTO";
    matriculaInmobiliaria?: string | null;
    personeriaJuridica?: string | null;
    paginaPublica: boolean;
    descripcionPublica?: string | null;
  },
) {
  const antes = await ctx.db.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } });
  const c = await ctx.db.conjunto.update({ where: { id: ctx.conjuntoId }, data });
  await audit(ctx, "editar", "Conjunto", ctx.conjuntoId, antes, c);
  return c;
}
