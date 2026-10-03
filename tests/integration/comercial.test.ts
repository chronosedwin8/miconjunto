import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cotizacionPorToken, crearCotizacionComercial } from "@/lib/comercial/service";

const base = { nombre: "Ana Prueba", email: `ventas-${Date.now()}@ejemplo.co`, telefono: "3001234567", conjuntos: [] };

describe("cotización comercial", () => {
  it("guarda la cotización con el precio calculado en el servidor y consecutivo", async () => {
    const a = await crearCotizacionComercial({ ...base, cantidad: 5, conjuntos: [{ nombre: "Los Robles", ciudad: "Barranquilla", unidades: 120 }] });
    const b = await crearCotizacionComercial({ ...base, cantidad: 1 });
    expect(a.total).toBe(18_000_000); // 5 × 4.000.000 − 10 %
    expect(b.total).toBe(5_000_000);
    const ra = await prisma.cotizacionComercial.findUniqueOrThrow({ where: { numero: a.numero } });
    expect(ra).toMatchObject({ plan: "MULTI", cantidad: 5, estado: "NUEVA" });
    expect(Number(ra.descuento)).toBe(2_000_000);
    expect(ra.conjuntos).toEqual([{ nombre: "Los Robles", ciudad: "Barranquilla", unidades: 120 }]);
    const n = (s: string) => Number(s.split("-").pop());
    expect(n(b.numero)).toBe(n(a.numero) + 1);
    // Se notifica al cliente por correo
    expect(await prisma.correoSaliente.count({ where: { para: base.email } })).toBeGreaterThanOrEqual(2);
  });

  it("solo se encuentra por el token aleatorio, no por el número", async () => {
    const a = await crearCotizacionComercial({ ...base, cantidad: 2 });
    expect((await cotizacionPorToken(a.token))?.numero).toBe(a.numero);
    expect(await cotizacionPorToken(a.numero)).toBeNull();
    expect(await cotizacionPorToken("corto")).toBeNull();
  });

  it("rechaza cantidades no válidas", async () => {
    await expect(crearCotizacionComercial({ ...base, cantidad: 0 })).rejects.toThrow();
    await expect(crearCotizacionComercial({ ...base, cantidad: 2.5 })).rejects.toThrow();
  });
});
