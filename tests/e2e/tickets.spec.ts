import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * PQRS y daños (spec §5.8 y §13): el residente reporta un daño en 3 pasos (tipo → descripción → radicado),
 * la administración lo resuelve desde el detalle y el residente califica la atención (queda cerrado).
 * Requiere datos demo (`npm run seed`). Viewport 390×844 (playwright.config.ts).
 */
async function login(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.fill("#email", email);
  await page.fill("#password", "Demo1234*");
  await expect(page.locator("#password")).toHaveValue("Demo1234*");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  if (page.url().includes("/seleccionar-conjunto")) {
    await page.locator("form button", { hasText: "Conjunto Residencial Demo" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/inicio"));
  }
  return page;
}

test("el residente reporta un daño en 3 pasos y la administración lo resuelve", async ({ browser }) => {
  test.setTimeout(600_000);
  const marca = `E2E ${Date.now().toString(36)}`;
  const residente = await login(browser, "propietario@demo.co");

  // Paso 1: tipo (un toque)
  await residente.goto("/tickets/nuevo", { waitUntil: "networkidle" });
  await residente.getByText("Daño en zona común", { exact: true }).click();
  // Paso 2: descripción y enviar
  await residente.getByLabel("¿Qué está dañado y dónde?").fill(`${marca}: la luz del pasillo del piso 1 de la Torre 1 no enciende.`);
  await residente.getByRole("button", { name: "Enviar reporte" }).click();
  // Paso 3: radicado
  await expect(residente.getByText("¡Recibimos tu reporte!")).toBeVisible();
  const radicado = (await residente.locator("p.font-mono").first().textContent())?.trim() ?? "";
  expect(radicado).toMatch(/^\d{4}-\d{4,}$/);
  const href = await residente.locator("a", { hasText: "Ver seguimiento" }).getAttribute("href");
  expect(href).toMatch(/^\/tickets\/[a-z0-9]+$/);

  // La administración lo encuentra en el tablero y lo resuelve con una respuesta
  // Asistente administrativa (tickets.*): un solo conjunto, evita la pantalla de selección de conjunto.
  const admin = await login(browser, "asistente@demo.co");
  await admin.goto(`/tickets?q=${radicado}`, { waitUntil: "networkidle" });
  await expect(admin.getByText(radicado).first()).toBeVisible();
  await admin.goto(href!, { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Resolver", exact: true }).click();
  await admin.getByLabel("Respuesta al residente").fill("Se cambió el bombillo del pasillo. Gracias por reportarlo.");
  await admin.getByRole("button", { name: "Marcar como resuelto" }).click();
  await expect(admin.getByText("Se cambió el bombillo del pasillo").first()).toBeVisible();

  // El residente ve la respuesta en la línea de tiempo y califica: el ticket queda cerrado
  await residente.goto(href!, { waitUntil: "networkidle" });
  await expect(residente.getByText("Se cambió el bombillo del pasillo").first()).toBeVisible();
  await residente.getByRole("radio", { name: "5 estrellas" }).click();
  await residente.getByRole("button", { name: "Enviar calificación" }).click();
  await expect(residente.getByText("Cerrado").first()).toBeVisible();
});
