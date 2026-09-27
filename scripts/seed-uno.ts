/**
 * Ejecuta UN módulo de seed sobre los datos existentes (sin TRUNCATE):
 *   npx tsx scripts/seed-uno.ts 60-tickets-convivencia
 * El módulo debe ser idempotente (borrar al inicio sus propias filas del conjunto demo).
 * Úsalo durante el desarrollo en paralelo; `npm run seed` completo lo corre el coordinador.
 */
import "dotenv/config";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prisma, makeRng, type SeedState } from "../prisma/seed/util";
import { DEMO_USERS } from "../prisma/seed/00-base";

async function main() {
  const nombre = process.argv[2]?.replace(/\.ts$/, "");
  if (!nombre) throw new Error("Uso: npx tsx scripts/seed-uno.ts NN-modulo");
  const conjunto = await prisma.conjunto.findUnique({ where: { slug: "conjunto-residencial-demo" } });
  if (!conjunto) throw new Error("No existe el conjunto demo: ejecuta primero `npm run seed` completo.");
  const users: Record<string, string> = {};
  const sa = await prisma.usuario.findUnique({ where: { email: "admin@miconjunto.co" } });
  if (sa) users.superadmin = sa.id;
  for (const u of DEMO_USERS) {
    const x = await prisma.usuario.findUnique({ where: { email: u.email } });
    if (x) users[u.key] = x.id;
  }
  const roles = Object.fromEntries((await prisma.rol.findMany({ where: { conjuntoId: conjunto.id } })).map((r) => [r.clave, r.id]));
  const state: SeedState = { conjuntoId: conjunto.id, users, roles, rng: makeRng(), now: new Date() };
  const mod = (await import(pathToFileURL(path.resolve("prisma/seed", `${nombre}.ts`)).href)) as Record<string, unknown>;
  const run = Object.entries(mod).find(([k, v]) => k.startsWith("seed") && typeof v === "function")?.[1] as ((s: SeedState) => Promise<void>) | undefined;
  if (!run) throw new Error(`El archivo ${nombre}.ts no exporta una función seedXxx`);
  const t = Date.now();
  await run(state);
  console.log(`✅ ${nombre} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
