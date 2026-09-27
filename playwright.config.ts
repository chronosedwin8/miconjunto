import { defineConfig, devices } from "@playwright/test";

/** Pruebas E2E (MICONJUNTO_SPEC §13): viewport móvil 390×844 contra el servidor de desarrollo. */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-CO",
    timezoneId: "America/Bogota",
  },
  projects: [{ name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
