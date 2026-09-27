import { prisma } from "@/lib/db";
import { crearConjunto, syncPermisos } from "@/lib/conjunto/provision";
import { systemCtx } from "@/lib/auth/system-ctx";

/** Crea un conjunto aislado para una prueba de integración (BD miconjunto_test). */
export async function makeConjunto(nombre = "Prueba") {
  await syncPermisos(prisma);
  const { conjunto, roles } = await crearConjunto(prisma, { nombre: `${nombre} ${Math.random().toString(36).slice(2, 8)}`, ciudad: "Barranquilla" });
  await prisma.conjunto.update({ where: { id: conjunto.id }, data: { estado: "ACTIVO" } });
  const ctx = await systemCtx(conjunto.id);
  return { conjunto, roles, ctx };
}

export async function makeUnidades(conjuntoId: string, n: number, cuota = 300000) {
  const torre = await prisma.torre.create({ data: { conjuntoId, nombre: `T${Math.random().toString(36).slice(2, 6)}`, pisos: 5 } });
  const coef = Math.round((100 / n) * 1e6) / 1e6;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(
      await prisma.unidad.create({
        data: { conjuntoId, torreId: torre.id, codigo: `${torre.nombre}-${101 + i}`, piso: 1, coeficiente: coef, cuotaAdministracion: cuota },
      }),
    );
  }
  return out;
}

export { prisma };
