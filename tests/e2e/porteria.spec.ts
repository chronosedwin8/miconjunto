import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Portería (spec §5.7 y §6.1–6.2), viewport 390×844:
 *  1. El residente autoriza un visitante (código de 6 dígitos) → el portero registra el ingreso con el código.
 *  2. Portería recibe un paquete para T1-101 y lo entrega a una persona autorizada con firma en pantalla.
 *  3. Autorización en tiempo real (dos contextos): el portero notifica al residente, este autoriza desde /visitantes
 *     y la respuesta llega por SSE a la pantalla del portero, que da el ingreso.
 * Requiere datos demo (seed).
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

test.setTimeout(360_000);

/** Abre el selector de unidad (SearchSelect) y elige T1-101; reintenta si la página aún no hidrató. */
async function elegirT1101(page: Page, etiqueta: string) {
  await expect(async () => {
    await page.getByRole("button", { name: etiqueta }).click();
    await page.getByPlaceholder("Escribe para buscar…").fill("T1-101", { timeout: 5_000 });
  }).toPass({ timeout: 120_000 });
  await page.getByRole("button", { name: /^T1-101/ }).click();
}

async function firmar(page: Page) {
  const canvas = page.getByLabel("Área para firmar con el dedo");
  await canvas.scrollIntoViewIfNeeded();
  const b = (await canvas.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 30 + i * 20, b.y + b.height / 2 + (i % 2 ? -25 : 25));
  await page.mouse.up();
}

test("residente autoriza un visitante y el portero registra el ingreso con el código", async ({ browser }) => {
  const nombre = `Visita E2E ${Date.now().toString(36)}`;
  const residente = await login(browser, "propietario@demo.co");
  await residente.goto("/visitantes/nuevo", { waitUntil: "networkidle" });
  // ≤ 3 toques: tipo y "Hoy" ya vienen seleccionados → nombre → generar
  await residente.getByLabel("¿Quién viene?").fill(nombre);
  await residente.getByRole("button", { name: "Generar código de ingreso" }).click();
  await residente.waitForURL(/\/visitantes\/[a-z0-9]+\?nuevo=1/);
  const codigo = (await residente.locator("p.font-mono").first().textContent())?.trim() ?? "";
  expect(codigo).toMatch(/^\d{6}$/);
  await expect(residente.getByRole("link", { name: "Compartir por WhatsApp" })).toHaveAttribute("href", new RegExp(`wa\\.me.*${codigo}`));

  const portero = await login(browser, "porteria@demo.co");
  await portero.goto("/porteria/ingreso", { waitUntil: "domcontentloaded" });
  await portero.getByLabel("Código de autorización").fill(codigo);
  await portero.waitForURL(new RegExp(`codigo=${codigo}`));
  await expect(portero.getByText("Autorización válida")).toBeVisible();
  await expect(portero.getByText(nombre).first()).toBeVisible();
  await portero.getByRole("button", { name: "Registrar ingreso" }).click();
  await portero.waitForURL((u) => u.pathname === "/porteria");
  await expect(portero.getByText(nombre).first()).toBeVisible();

  // El código ya se usó (1 uso): no permite otro ingreso
  await portero.goto(`/porteria/ingreso?codigo=${codigo}`, { waitUntil: "domcontentloaded" });
  await expect(portero.getByText(/ya se usó|no existe/i).first()).toBeVisible();
});

test("portería recibe un paquete y lo entrega solo a una persona autorizada con firma", async ({ browser }) => {
  const guia = `E2E${Date.now().toString().slice(-8)}`;
  const portero = await login(browser, "porteria@demo.co");
  await portero.goto("/porteria/paquetes/recibir", { waitUntil: "domcontentloaded" });
  await elegirT1101(portero, "Unidad");
  await portero.getByRole("button", { name: "TCC" }).click();
  await portero.getByLabel("Número de guía").fill(guia);
  await portero.getByRole("button", { name: "Recibir y notificar" }).click();
  await expect(portero.getByText("la unidad fue notificada")).toBeVisible();

  await portero.goto("/porteria/paquetes/entregar", { waitUntil: "domcontentloaded" });
  await elegirT1101(portero, "Unidad que recoge");
  await portero.waitForURL(/unidadId=/);
  // Solo aparecen personas autorizadas (el menor Tomás y la empleada no)
  await expect(portero.getByText("Laura Gómez Fontalvo")).toBeVisible();
  await expect(portero.getByText(/Tomás/)).toHaveCount(0);
  await expect(portero.getByText(/Rosa Polo/)).toHaveCount(0);
  await portero.getByText("Laura Gómez Fontalvo").click();
  await firmar(portero);
  await portero.getByRole("button", { name: /^Entregar \d+ paquete/ }).click();
  await portero.waitForURL((u) => u.pathname === "/porteria/paquetes");
  await portero.goto(`/porteria/paquetes?q=${guia}`, { waitUntil: "domcontentloaded" });
  await expect(portero.getByText(/recogió Laura Gómez Fontalvo/)).toBeVisible();
});

test("autorización en tiempo real: el residente responde y el portero da el ingreso", async ({ browser }) => {
  const nombre = `Tiempo real ${Date.now().toString(36)}`;
  const residente = await login(browser, "propietario@demo.co");
  await residente.goto("/visitantes", { waitUntil: "domcontentloaded" });

  const portero = await login(browser, "porteria@demo.co");
  await portero.goto("/porteria", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await portero.getByLabel("Buscar en portería").fill("");
    await portero.getByLabel("Buscar en portería").fill("T1-101");
    await portero.getByRole("button", { name: /^T1-101/ }).first().click({ timeout: 8_000 });
  }).toPass({ timeout: 120_000 });
  await portero.waitForURL(/\/porteria\/unidad\//);
  await portero.getByLabel("Nombre del visitante").fill(nombre);
  await portero.getByRole("button", { name: "Notificar al residente de T1-101" }).click();
  await portero.waitForURL((u) => u.pathname === "/porteria");
  await expect(portero.getByText(nombre).first()).toBeVisible();

  // Llega al residente en tiempo real (SSE)
  await expect(residente.getByText(`${nombre} está en portería`).first()).toBeVisible({ timeout: 45_000 });
  await residente.getByRole("button", { name: "Autorizar", exact: true }).first().click();
  await expect(residente.getByText("Autorizado: portería ya lo sabe.")).toBeVisible();

  // La respuesta llega al portero sin recargar
  await expect(portero.getByText("El residente AUTORIZÓ")).toBeVisible({ timeout: 45_000 });
  await portero.getByRole("button", { name: "Dar ingreso" }).click();
  await expect(portero.getByText(`Ingreso de ${nombre} registrado`)).toBeVisible();
});
