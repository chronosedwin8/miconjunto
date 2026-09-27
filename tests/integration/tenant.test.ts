import { afterAll, describe, expect, it } from "vitest";
import { prisma, withTenant } from "@/lib/db";
import { makeConjunto, makeUnidades } from "../helpers/db";

describe("aislamiento multi-tenant (withTenant)", () => {
  afterAll(() => prisma.$disconnect());

  it("un conjunto nunca lee ni modifica datos de otro aunque manipule IDs", async () => {
    const a = await makeConjunto("A");
    const b = await makeConjunto("B");
    const [ua] = await makeUnidades(a.conjunto.id, 1);
    const [ub] = await makeUnidades(b.conjunto.id, 1);
    const dbA = withTenant(prisma, a.conjunto.id);

    // lecturas por id ajeno
    expect(await dbA.unidad.findUnique({ where: { id: ub.id } })).toBeNull();
    expect(await dbA.unidad.findFirst({ where: { id: ub.id } })).toBeNull();
    expect((await dbA.unidad.findMany()).map((u) => u.id)).toEqual([ua.id]);
    expect(await dbA.unidad.count({ where: { id: ub.id } })).toBe(0);

    // escrituras sobre id ajeno fallan o no afectan
    await expect(dbA.unidad.update({ where: { id: ub.id }, data: { notasEstructura: "hack" } })).rejects.toThrow();
    const r = await dbA.unidad.updateMany({ where: { id: ub.id }, data: { notasEstructura: "hack" } });
    expect(r.count).toBe(0);

    // intentar consultar o crear explícitamente en otro conjunto lanza error
    await expect(dbA.unidad.findMany({ where: { conjuntoId: b.conjunto.id } })).rejects.toThrow(/otro conjunto/);
    await expect(
      dbA.torre.create({ data: { conjuntoId: b.conjunto.id, nombre: "Intrusa" } }),
    ).rejects.toThrow(/otro conjunto/);

    // la creación inyecta el conjunto automáticamente
    const t = await dbA.torre.create({ data: { nombre: "Nueva" } as never });
    expect(t.conjuntoId).toBe(a.conjunto.id);
  });

  it("excluye registros con borrado lógico", async () => {
    const a = await makeConjunto("C");
    const [u1, u2] = await makeUnidades(a.conjunto.id, 2);
    const db = withTenant(prisma, a.conjunto.id);
    await db.unidad.update({ where: { id: u2.id }, data: { deletedAt: new Date() } });
    const ids = (await db.unidad.findMany()).map((u) => u.id);
    expect(ids).toEqual([u1.id]);
  });

  it("exige conjuntoId", () => {
    expect(() => withTenant(prisma, "")).toThrow();
  });
});
