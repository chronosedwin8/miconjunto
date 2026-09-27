/**
 * Worker de jobs con pg-boss (usa la misma BD, sin Redis): `npm run worker`.
 * Programa cada job de jobs/definitions.ts con su cron en zona America/Bogota.
 */
import "dotenv/config";
import PgBoss from "pg-boss";
import { allJobs } from "./registry";
import "./definitions";

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!.replace(/\?schema=.*$/, ""), schema: "pgboss" });
  boss.on("error", (e) => console.error("[jobs] error:", e.message));
  await boss.start();
  for (const job of allJobs()) {
    await boss.createQueue(job.name);
    await boss.schedule(job.name, job.cron, {}, { tz: "America/Bogota" });
    await boss.work(job.name, async () => {
      const t = Date.now();
      try {
        const r = await job.handler();
        console.log(`[jobs] ${job.name} ✓ ${r ?? ""} (${Date.now() - t} ms)`);
      } catch (e) {
        console.error(`[jobs] ${job.name} ✗`, (e as Error).message);
        throw e;
      }
    });
  }
  console.log(`[jobs] worker iniciado con ${allJobs().length} jobs programados`);
  const stop = async () => {
    await boss.stop({ graceful: true, timeout: 10000 });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("[jobs] no se pudo iniciar:", e);
  process.exit(1);
});
