import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/auth/config";

describe("rutas públicas", () => {
  it("el sitio comercial es público", () => {
    for (const p of ["/", "/precios", "/funcionalidades", "/sitemap.xml", "/robots.txt", "/opengraph-image", "/api/cotizaciones/abc/pdf", "/login"]) expect(isPublicPath(p), p).toBe(true);
  });
  it("los archivos del service worker son públicos", () => {
    expect(isPublicPath("/sw.js")).toBe(true);
    expect(isPublicPath("/swe-worker-f61931bc2770d10b.js")).toBe(true);
  });
  it("la app sigue protegida", () => {
    for (const p of ["/inicio", "/cartera", "/superadmin/cotizaciones", "/preciosx", "/funcionalidades-admin", "/api/buscar"]) expect(isPublicPath(p), p).toBe(false);
  });
});
