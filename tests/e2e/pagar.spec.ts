import { expect, test } from "@playwright/test";

/**
 * Pagar una cuota en línea con la pasarela simulada (PAYMENTS_SIMULATOR=true):
 * login propietario → Mi cuenta → Pagar → checkout simulado → Aprobar → pago aprobado.
 * Requiere datos demo (`npm run seed`): la unidad T1-101 de propietario@demo.co tiene saldo.
 */
test("el propietario paga su cuenta con el simulador y ve el pago aprobado", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  // En desarrollo la primera compilación puede recargar la página: se llena y se verifica antes de enviar.
  await page.waitForTimeout(1500);
  await page.fill("#email", "propietario@demo.co");
  await page.fill("#password", "Demo1234*");
  await expect(page.locator("#email")).toHaveValue("propietario@demo.co");
  await expect(page.locator("#password")).toHaveValue("Demo1234*");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/seleccionar-conjunto")) {
    await page.locator("form button", { hasText: "Conjunto Residencial Demo" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/inicio"));
  }

  await page.goto("/cuenta", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Pagar \$/ }).click();
  await page.waitForURL(/\/cuenta\/pagar/);
  await page.getByRole("radio", { name: /Nequi/ }).click();
  await page.getByRole("button", { name: "Pagar", exact: true }).click();

  await page.waitForURL(/\/pagar\/simulador\//);
  await expect(page.getByText("Pasarela de")).toBeVisible();
  await page.getByRole("button", { name: "Aprobar" }).click();

  await page.waitForURL(/\/cuenta\/pagos\//);
  await expect(page.getByText("¡Pago aprobado!")).toBeVisible();
  await expect(page.getByRole("button", { name: /Descargar recibo/ })).toBeVisible();
});
