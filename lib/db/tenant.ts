import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * Modelos de negocio con `conjuntoId` obligatorio. Se calcula desde el DMMF de Prisma,
 * así cualquier modelo nuevo con conjuntoId queda protegido automáticamente.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "conjuntoId" && f.isRequired))
    .map((m) => m.name),
);

const SOFT_DELETE_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "deletedAt"))
    .map((m) => m.name),
);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const WHERE_WRITE_OPS = new Set(["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert"]);

type AnyArgs = Record<string, unknown> & { where?: Record<string, unknown>; data?: unknown; create?: unknown };

function scopeWhere(where: Record<string, unknown> | undefined, conjuntoId: string) {
  const w = where ?? {};
  if (w.conjuntoId !== undefined && w.conjuntoId !== conjuntoId) {
    throw new Error("Acceso denegado: intento de consultar otro conjunto");
  }
  return { ...w, conjuntoId };
}

function scopeData(data: unknown, conjuntoId: string): unknown {
  if (Array.isArray(data)) return data.map((d) => scopeData(d, conjuntoId));
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.conjuntoId !== undefined && d.conjuntoId !== conjuntoId) {
      throw new Error("Acceso denegado: intento de escribir en otro conjunto");
    }
    return { ...d, conjuntoId };
  }
  return data;
}

function build(prisma: PrismaClient, conjuntoId: string) {
  return prisma.$extends({
    name: "tenant",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = { ...((args ?? {}) as AnyArgs) };
          if (READ_OPS.has(operation)) {
            a.where = scopeWhere(a.where, conjuntoId);
            if (SOFT_DELETE_MODELS.has(model) && !("deletedAt" in a.where)) {
              a.where.deletedAt = null;
            }
          } else if (WHERE_WRITE_OPS.has(operation)) {
            a.where = scopeWhere(a.where, conjuntoId);
            if (operation === "upsert") a.create = scopeData(a.create, conjuntoId);
            if (a.data && typeof a.data === "object" && "conjuntoId" in (a.data as object)) {
              const d = a.data as Record<string, unknown>;
              if (d.conjuntoId !== conjuntoId) throw new Error("Acceso denegado: no se puede mover de conjunto");
            }
          } else if (
            operation === "create" ||
            operation === "createMany" ||
            operation === "createManyAndReturn"
          ) {
            a.data = scopeData(a.data, conjuntoId);
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof build>;

const cache = new Map<string, { client: TenantClient; base: PrismaClient }>();

/**
 * Cliente Prisma aislado por conjunto: inyecta `conjuntoId` en toda lectura/escritura de
 * modelos de negocio y excluye registros con borrado lógico. Falla si falta el conjunto.
 */
export function withTenant(prisma: PrismaClient, conjuntoId: string | null | undefined): TenantClient {
  if (!conjuntoId) throw new Error("withTenant: se requiere conjuntoId");
  const hit = cache.get(conjuntoId);
  if (hit && hit.base === prisma) return hit.client;
  const client = build(prisma, conjuntoId);
  if (cache.size > 500) cache.clear();
  cache.set(conjuntoId, { client, base: prisma });
  return client;
}
