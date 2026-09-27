import "dotenv/config";
import { prisma, makeRng, type SeedState } from "./util";
import { seedBase } from "./00-base";
import { seedEstructura } from "./10-estructura";

/**
 * Seed de demostración: `npm run seed`.
 * Borra todos los datos (TRUNCATE) y crea el conjunto demo completo. Cada módulo agrega su archivo
 * `NN-modulo.ts` y se registra en la lista MODULOS en orden.
 */
type SeedModule = { nombre: string; run: (s: SeedState) => Promise<void> };

const MODULOS: SeedModule[] = [
  { nombre: "estructura física", run: seedEstructura },
];

async function truncateAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

async function main() {
  const t0 = Date.now();
  console.log("🧹 Limpiando base de datos…");
  await truncateAll();
  const state: SeedState = { conjuntoId: "", users: {}, roles: {}, rng: makeRng(), now: new Date() };
  console.log("🏗️  Base: SuperAdmin, planes, conjunto demo, roles y usuarios…");
  await seedBase(state);
  for (const m of MODULOS) {
    const t = Date.now();
    await m.run(state);
    console.log(`✅ ${m.nombre} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  await prisma.conjunto.update({ where: { id: state.conjuntoId }, data: { estado: "ACTIVO" } });
  console.log(`\n🎉 Seed completo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log("   SuperAdmin: admin@miconjunto.co / Admin1234*");
  console.log("   Demo (clave Demo1234*): administrador@demo.co, porteria@demo.co, consejo@demo.co, propietario@demo.co, residente@demo.co, mantenimiento@demo.co");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
