import type { Ctx } from "@/lib/auth/context";
import type { ConjuntoPdf } from "@/lib/pdf/kit";
import { nombreCompleto } from "@/lib/format";

/** Datos del conjunto para encabezados de PDF y correos. */
export async function conjuntoParaPdf(ctx: Pick<Ctx, "db" | "conjuntoId">): Promise<ConjuntoPdf & { color: string; logoUrl: string | null }> {
  const c = await ctx.db.conjunto.findUnique({ where: { id: ctx.conjuntoId } });
  return {
    nombre: c?.nombre ?? "",
    nit: c?.nit ? `${c.nit}${c.digitoVerificacion ? `-${c.digitoVerificacion}` : ""}` : null,
    direccion: c?.direccion,
    ciudad: c?.ciudad,
    telefono: c?.telefono,
    email: c?.email,
    color: c?.colorPrimario ?? "#0f766e",
    logoUrl: c?.logoUrl ?? null,
  };
}

export type Titular = { personaId: string; nombre: string; documento: string; tipoDocumento: string; email: string | null; telefono: string | null; usuarioId: string | null; principal: boolean };

/** Propietarios/copropietarios activos de una unidad (el principal primero). */
export async function titularesUnidad(ctx: Pick<Ctx, "db">, unidadId: string): Promise<Titular[]> {
  const v = await ctx.db.vinculoUnidad.findMany({
    where: { unidadId, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] }, persona: { deletedAt: null } },
    include: { persona: { include: { usuario: { select: { email: true } } } } },
    orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
  });
  return v.map((x) => ({
    personaId: x.personaId,
    nombre: nombreCompleto(x.persona),
    documento: x.persona.numeroDocumento,
    tipoDocumento: x.persona.tipoDocumento,
    email: x.persona.email ?? x.persona.usuario?.email ?? null,
    telefono: x.persona.telefono ?? null,
    usuarioId: x.persona.usuarioId,
    principal: x.principal,
  }));
}

/** Mapa unidadId → titular principal (para listas y exportaciones). */
export async function titularesPrincipales(ctx: Pick<Ctx, "db">, unidadIds?: string[]) {
  const v = await ctx.db.vinculoUnidad.findMany({
    where: { estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] }, persona: { deletedAt: null }, ...(unidadIds ? { unidadId: { in: unidadIds } } : {}) },
    select: { unidadId: true, principal: true, persona: { select: { nombres: true, apellidos: true, numeroDocumento: true, tipoDocumento: true } } },
    orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
  });
  const out = new Map<string, { nombre: string; documento: string; tipoDocumento: string }>();
  for (const x of v) if (!out.has(x.unidadId)) out.set(x.unidadId, { nombre: nombreCompleto(x.persona), documento: x.persona.numeroDocumento, tipoDocumento: x.persona.tipoDocumento });
  return out;
}
