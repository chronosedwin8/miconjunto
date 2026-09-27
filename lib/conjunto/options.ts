import type { Ctx } from "@/lib/auth/context";

/** Opciones de unidades para selectores (agrupadas por torre). Si `soloPropias`, solo las del usuario. */
export async function unidadOptions(ctx: Ctx, opts?: { soloPropias?: boolean }) {
  const unidades = await ctx.db.unidad.findMany({
    where: opts?.soloPropias ? { id: { in: ctx.unidadIds } } : {},
    select: { id: true, codigo: true, torre: { select: { nombre: true } } },
    orderBy: [{ torreId: "asc" }, { codigo: "asc" }],
  });
  return unidades
    .map((u) => ({ value: u.id, label: u.codigo, group: u.torre?.nombre ?? "Casas" }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label, "es", { numeric: true }));
}

export async function torreOptions(ctx: Ctx) {
  const torres = await ctx.db.torre.findMany({ orderBy: { nombre: "asc" } });
  return torres.map((t) => ({ value: t.id, label: t.nombre }));
}

export async function zonaOptions(ctx: Ctx, soloReservables = false) {
  const zonas = await ctx.db.zonaComun.findMany({ where: soloReservables ? { reservable: true, estado: "ACTIVA" } : {}, orderBy: { nombre: "asc" } });
  return zonas.map((z) => ({ value: z.id, label: z.nombre }));
}
