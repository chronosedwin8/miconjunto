/** Genera los íconos PNG de la PWA a partir de un SVG usando Chromium (Playwright). */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const svg = (maskable: boolean) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${maskable ? 0 : 112}" fill="#0f766e"/>
  <g transform="translate(${maskable ? 106 : 96} ${maskable ? 106 : 96}) scale(${maskable ? 1.17 : 1.25})" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 232V88l88-48 88 48v144"/>
    <path d="M200 232V120l56 28v84"/>
    <path d="M8 232h248"/>
    <path d="M64 104h16M64 144h16M64 184h16M144 104h16M144 144h16M144 184h16"/>
  </g>
</svg>`;

async function main() {
  fs.mkdirSync("public/icons", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, maskable] of [
    ["icon-192.png", 192, false],
    ["icon-512.png", 512, false],
    ["icon-maskable-512.png", 512, true],
    ["apple-touch-icon.png", 180, false],
  ] as const) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(maskable).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: `public/icons/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log("✔", name);
  }
  fs.copyFileSync("public/icons/icon-192.png", "app/icon.png");
  await browser.close();
}
main();
