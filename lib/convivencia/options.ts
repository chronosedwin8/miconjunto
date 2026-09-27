import type { Ctx } from "@/lib/auth/context";
import { cop } from "@/lib/format";
import { label } from "@/lib/labels";

/** Personas vinculadas (una opción por persona, agrupada por su unidad principal). */
export async function personaOptions(ctx: Ctx) {
  const vinculos = await ctx.db.vinculoUnidad.findMany({
    where: { estado: "ACTIVO" },
    select: { personaId: true, persona: { select: { nombres: true, apellidos: true } }, unidad: { select: { codigo: true } } },
    orderBy: { unidad: { codigo: "asc" } },
  });
  const vistos = new Map<string, { value: string; label: string; group: string }>();
  for (const v of vinculos) {
    if (!vistos.has(v.personaId)) vistos.set(v.personaId, { value: v.personaId, label: `${v.persona.nombres} ${v.persona.apellidos}`, group: v.unidad.codigo });
  }
  return [...vistos.values()];
}

export async function infraccionOptions(ctx: Ctx) {
  const rows = await ctx.db.catalogoInfraccion.findMany({ where: { activo: true }, orderBy: { codigo: "asc" } });
  return rows.map((i) => ({ value: i.id, label: `${i.codigo} · ${i.nombre} (${cop(i.valorSugerido)})`, group: label(i.gravedad) }));
}
