/**
 * Capturas de pantalla "como humano" con Playwright (viewport móvil 390×844 por defecto).
 *
 *   npx tsx scripts/shot.ts --user propietario /inicio /cuenta
 *   npx tsx scripts/shot.ts --user administrador --desktop /cartera
 *   npx tsx scripts/shot.ts --anon /login
 *
 * Usuarios: clave del correo demo (administrador, porteria, propietario…) o "superadmin".
 * Las imágenes quedan en ./screenshots-tmp/<usuario>-<ruta>.png y se imprime la ruta de cada una.
 * Además registra errores de consola y respuestas HTTP >= 500.
 */
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const args = process.argv.slice(2);
let user = "administrador";
let desktop = false;
let anon = false;
let full = true;
const paths: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--user") user = args[++i];
  else if (a === "--desktop") desktop = true;
  else if (a === "--anon") anon = true;
  else if (a === "--viewport") full = false;
  // Git Bash convierte "/ruta" en "C:/Program Files/Git/ruta": se deshace aquí.
  else paths.push("/" + a.replace(/^[A-Z]:\/Program Files\/Git\//i, "").replace(/^\/+/, ""));
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext(desktop ? { viewport: { width: 1366, height: 900 } } : { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`[console] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`[http ${r.status()}] ${r.url()}`);
  });

  if (!anon) {
    const email = user === "superadmin" ? "admin@miconjunto.co" : user.includes("@") ? user : `${user}@demo.co`;
    const pass = user === "superadmin" ? "Admin1234*" : "Demo1234*";
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 120000 });
    await page.fill("#email", email);
    await page.fill("#password", pass);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120000 }), page.click("button[type=submit]")]);
  }
  fs.mkdirSync("screenshots-tmp", { recursive: true });
  for (const p of paths.length ? paths : ["/inicio"]) {
    const t = Date.now();
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 180000 }).catch((e) => errors.push(`[goto] ${p}: ${e.message}`));
    await page.waitForTimeout(400);
    const name = `${anon ? "anon" : user}-${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}${desktop ? "-desk" : ""}.png`;
    const file = path.join("screenshots-tmp", name);
    await page.screenshot({ path: file, fullPage: full });
    console.log(`📸 ${file}  (${Date.now() - t} ms)  url=${page.url().replace(BASE, "")}`);
  }
  if (errors.length) {
    console.log("\n⚠️  Errores detectados:");
    for (const e of [...new Set(errors)]) console.log("  " + e);
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
