import { expect, test, type Page } from "@playwright/test";

/**
 * Reservar y pagar el salón con factura (spec §13): login propietario → Reservar → Salón social →
 * franja libre → confirmar → Pagar ahora → pasarela simulada (Aprobar) → la reserva queda pagada y
 * muestra la factura electrónica (simulada) con PDF.
 * Requiere datos demo (`npm run seed`) y PAYMENTS_SIMULATOR=true. Viewport 390×844 (playwright.config.ts).
 */
async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.fill("#email", "propietario@demo.co");
  await page.fill("#password", "Demo1234*");
  await expect(page.locator("#password")).toHaveValue("Demo1234*");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  if (page.url().includes("/seleccionar-conjunto")) {
    await page.locator("form button", { hasText: "Conjunto Residencial Demo" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/inicio"));
  }
}

/** Paga todo el saldo de la cuenta con el simulador (la mora bloquea la reserva del salón). */
async function pagarSaldo(page: Page) {
  await page.goto("/cuenta", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Pagar \$/ }).click();
  await page.waitForURL(/\/cuenta\/pagar/);
  await page.getByRole("radio", { name: /Nequi/ }).click();
  await page.getByRole("button", { name: "Pagar", exact: true }).click();
  await page.waitForURL(/\/pagar\/simulador\//);
  await page.getByRole("button", { name: "Aprobar" }).click();
  await page.waitForURL(/\/cuenta\/pagos\//);
}

const iso = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);

test("el propietario reserva el salón, paga con el simulador y ve la factura", async ({ page }) => {
  test.setTimeout(600_000);
  await login(page);
  await page.goto("/reservas", { waitUntil: "networkidle" });
  await page.locator('a[href^="/reservas/"]:not([href*="detalle"]):not([href$="/mis"])', { hasText: "Salón social" }).first().click();
  await page.waitForURL(/\/reservas\/[a-z0-9]+(\?.*)?$/);
  const zonaUrl = page.url().split("?")[0];

  // Recorre días (25–59 adelante) hasta lograr la reserva; si la unidad está en mora, paga primero.
  let apartada = false;
  for (let d = 25; d <= 59 && !apartada; d++) {
    await page.goto(`${zonaUrl}?fecha=${iso(new Date(Date.now() + d * 86_400_000))}`, { waitUntil: "networkidle" });
    const libre = page.getByRole("button", { name: /^Reservar desde las/ }).first();
    if (!(await libre.isVisible().catch(() => false))) continue;
    await libre.click();
    await page.getByRole("button", { name: /^Reservar · \$/ }).click();
    const alerta = page.getByRole("dialog").getByRole("alert");
    const r = await Promise.race([
      alerta.waitFor({ timeout: 30_000 }).then(async () => ((await alerta.textContent()) ?? "").includes("saldo vencido") ? "mora" : "regla"),
      page.locator("a", { hasText: "Pagar ahora" }).waitFor({ timeout: 30_000 }).then(() => "ok"),
    ]).catch(() => "regla");
    if (r === "ok") apartada = true;
    else if (r === "mora") {
      await pagarSaldo(page);
      d--;
    }
  }
  expect(apartada).toBe(true);
  const pagar = page.locator("a", { hasText: "Pagar ahora" });
  await expect(pagar).toBeVisible();
  await pagar.click();

  await page.waitForURL(/\/cuenta\/pagar/);
  await page.getByRole("radio", { name: /Nequi/ }).click();
  await page.getByRole("button", { name: "Pagar", exact: true }).click();
  await page.waitForURL(/\/pagar\/simulador\//);
  await page.getByRole("button", { name: "Aprobar" }).click();
  await page.waitForURL(/\/cuenta\/pagos\//);
  await expect(page.getByText("¡Pago aprobado!")).toBeVisible();

  // La reserva queda pagada y con factura electrónica (la cola la emite en segundo plano)
  await expect(async () => {
    await page.goto("/reservas/mis", { waitUntil: "networkidle" });
  }).toPass({ timeout: 90_000 });
  await page.getByRole("link", { name: /Salón social/ }).last().click();
  await page.waitForURL(/\/reservas\/detalle\//);
  await expect(page.getByText("Pagada").first()).toBeVisible();
  await expect(async () => {
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(/Factura electrónica/).first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator("a", { hasText: "PDF" }).first()).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
});
