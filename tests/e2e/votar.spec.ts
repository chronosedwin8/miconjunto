import "dotenv/config";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Votar (spec §5.11 y §13): propietario@demo.co (T1-101) entra, vota en la votación abierta en ≤ 3 toques
 * (abrir → opción → confirmar) y ve su comprobante, que luego verifica. Requiere el seed 80-gobierno.
 * Para poder repetirse, borra antes el voto de T1-101 en la votación demo.
 */
const prisma = new PrismaClient();

test.beforeAll(async () => {
  const v = await prisma.votacion.findFirst({ where: { pregunta: { startsWith: "¿Aprueba pintar las fachadas" }, estado: "ABIERTA", deletedAt: null } });
  const u = await prisma.unidad.findFirst({ where: { codigo: "T1-101", conjunto: { slug: "conjunto-residencial-demo" } } });
  if (v && u) await prisma.voto.deleteMany({ where: { votacionId: v.id, unidadId: u.id } });
});

test.afterAll(() => prisma.$disconnect());

test("el propietario vota en la votación abierta y ve su comprobante", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.fill("#email", "propietario@demo.co");
  await page.fill("#password", "Demo1234*");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  if (page.url().includes("/seleccionar-conjunto")) {
    await page.locator("form button", { hasText: "Conjunto Residencial Demo" }).click();
    await page.waitForURL((u) => u.pathname.startsWith("/inicio"));
  }

  await page.goto("/votaciones", { waitUntil: "networkidle" });
  // Toque 1: abrir la votación pendiente
  await page.getByText("Votar ahora (T1-101)").click();
  await expect(page).toHaveURL(/\/votaciones\/[a-z0-9]+$/, { timeout: 120_000 });
  await expect(page.getByText("Tu voto")).toBeVisible();
  // Toque 2: elegir opción
  await page.getByRole("radio", { name: "Sí, apruebo" }).click();
  // Toque 3: confirmar
  await page.getByRole("button", { name: "Confirmar voto" }).click();

  await expect(page.getByText("¡Voto registrado por T1-101!")).toBeVisible();
  const comprobante = (await page.getByTestId("comprobante").textContent())?.trim() ?? "";
  expect(comprobante).toMatch(/^[a-f0-9]{64}$/);

  // El comprobante queda guardado y se puede verificar
  await page.goto(`/votaciones/comprobante?hash=${comprobante}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Voto registrado y válido")).toBeVisible();
  await expect(page.getByText("Sí, apruebo")).toBeVisible();
});
