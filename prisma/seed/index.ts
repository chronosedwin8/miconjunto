import "dotenv/config";
import { prisma, makeRng, type SeedState } from "./util";
import { seedBase } from "./00-base";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Seed de demostración: `npm run seed`.
 * Borra todos los datos (TRUNCATE) y crea el conjunto demo completo. Cada módulo agrega su archivo
 * `prisma/seed/NN-modulo.ts` exportando una función `seedXxx(state)`; se ejecutan en orden de nombre.
 */
type SeedModule = { nombre: string; run: (s: SeedState) => Promise<void> };

/** Descubre automáticamente prisma/seed/NN-*.ts (excepto 00-base) y los ejecuta en orden. */
async function cargarModulos(): Promise<SeedModule[]> {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => /^\d{2}-.+\.ts$/.test(f) && !f.startsWith("00-")).sort();
  const out: SeedModule[] = [];
  for (const f of files) {
    const mod = (await import(pathToFileURL(path.join(dir, f)).href)) as Record<string, unknown>;
    const run = Object.entries(mod).find(([k, v]) => k.startsWith("seed") && typeof v === "function")?.[1] as SeedModule["run"] | undefined;
    if (run) out.push({ nombre: f.replace(/\.ts$/, ""), run });
  }
  return out;
}

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
  const fallidos: string[] = [];
  for (const m of await cargarModulos()) {
    const t = Date.now();
    try {
      await m.run(state);
      console.log(`✅ ${m.nombre} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    } catch (e) {
      fallidos.push(m.nombre);
      console.error(`❌ ${m.nombre}:`, e);
    }
  }
  if (fallidos.length) console.error(`\n⚠️  Módulos con error: ${fallidos.join(", ")}`);
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
