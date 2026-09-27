import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { crearCargo, registrarPago, saldoUnidad, anularCargo } from "@/lib/cartera/core";
import { toNumber } from "@/lib/format";
import { makeConjunto, makeUnidades } from "../helpers/db";

describe("núcleo de cartera", () => {
  afterAll(() => prisma.$disconnect());

  it("crea cargos, aplica pagos en orden legal con pronto pago y deja saldo a favor", async () => {
    const { ctx } = await makeConjunto("Cartera");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    const hoy = new Date();
    const vencida = new Date(hoy.getTime() - 40 * 86400000);
    const futura = new Date(hoy.getTime() + 10 * 86400000);
    const c1 = await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "ADMINISTRACION", valorBase: 300000, fechaVencimiento: vencida, periodo: "2026-01", origen: "MANUAL" });
    const int = await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "INTERES_MORA", valorBase: 5000, fechaVencimiento: vencida, periodo: "2026-02", origen: "INTERES", cuotaOrigenId: c1.id });
    const c2 = await crearCargo(ctx, {
      unidadId: u.id,
      conceptoTipo: "ADMINISTRACION",
      valorBase: 300000,
      fechaVencimiento: futura,
      fechaProntoPago: futura,
      porcentajeProntoPago: 10,
      periodo: "2026-02",
      origen: "GENERACION_MENSUAL",
    });
    expect(c1.referenciaPago).toMatch(/^\d{14}$/);

    let s = await saldoUnidad(ctx, u.id);
    expect(s.total).toBe(605000);
    expect(s.vencido).toBe(305000);

    // Paga 600.000: interés 5.000 + enero 300.000 + febrero con 10 % de pronto pago (270.000) → sobra 25.000
    const pago = await registrarPago(ctx, { unidadId: u.id, valor: 600000, medio: "TRANSFERENCIA" });
    expect(pago.numeroRecibo).toBeGreaterThan(0);
    const [e1, eInt, e2] = await Promise.all([c1, int, c2].map((c) => prisma.cuota.findUniqueOrThrow({ where: { id: c.id } })));
    expect(eInt.estado).toBe("PAGADA");
    expect(e1.estado).toBe("PAGADA");
    expect(e2.estado).toBe("PAGADA");
    expect(toNumber(e2.descuento)).toBe(30000);
    s = await saldoUnidad(ctx, u.id);
    expect(s.total).toBe(0);
    expect(s.saldoAFavor).toBe(25000);

    // Movimientos: débitos - créditos = saldo neto (−25.000 a favor)
    const movs = await prisma.movimientoCartera.findMany({ where: { unidadId: u.id } });
    const neto = movs.reduce((a, m) => a + (m.tipo === "DEBITO" ? 1 : -1) * toNumber(m.valor), 0);
    expect(neto).toBe(-25000);
  });

  it("no permite anular una cuota con pagos aplicados", async () => {
    const { ctx } = await makeConjunto("Anular");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    const c = await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "OTRO", valorBase: 100000, fechaVencimiento: new Date(), origen: "MANUAL" });
    await registrarPago(ctx, { unidadId: u.id, valor: 50000, medio: "EFECTIVO" });
    await expect(anularCargo(ctx, c.id, "error")).rejects.toThrow(/pagos aplicados/);
  });
});
