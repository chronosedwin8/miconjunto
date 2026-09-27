import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { crearCargo, registrarPago, saldoUnidad } from "@/lib/cartera/core";
import { generarCuotasMes } from "@/lib/cartera/generacion";
import { liquidarInteresesMora } from "@/lib/cartera/mora";
import { crearAcuerdo, detalleAcuerdo, evaluarAcuerdo } from "@/lib/cartera/acuerdos";
import { solicitarPazYSalvo } from "@/lib/cartera/paz-y-salvo";
import { emparejarAutomatico, crearPagoDesdeLinea } from "@/lib/cartera/conciliacion";
import { anularPago } from "@/lib/cartera/operaciones";
import { puedeContactar, registrarGestion } from "@/lib/cartera/cobranza";
import { toNumber } from "@/lib/format";
import { makeConjunto, makeUnidades } from "../helpers/db";

const DIA = 86_400_000;
const bog = (s: string) => new Date(`${s}-05:00`);

/** Suma del libro auxiliar (débitos − créditos) de una unidad. */
async function libro(unidadId: string) {
  const movs = await prisma.movimientoCartera.findMany({ where: { unidadId } });
  return movs.reduce((a, m) => a + (m.tipo === "DEBITO" ? 1 : -1) * toNumber(m.valor), 0);
}

async function configurar(conjuntoId: string, cartera: Record<string, unknown>) {
  const c = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  const cfg = (c.config ?? {}) as Record<string, unknown>;
  await prisma.conjunto.update({ where: { id: conjuntoId }, data: { config: { ...cfg, cartera: { ...((cfg.cartera as object) ?? {}), ...cartera } } as object } });
}

describe("cartera — administración", () => {
  afterAll(() => prisma.$disconnect());

  it("genera las cuotas del mes una sola vez (idempotente) y cruza saldos a favor", async () => {
    const { conjunto } = await makeConjunto("Generar");
    await configurar(conjunto.id, { calculoCuota: "VALOR_FIJO", diaVencimiento: 10, diaProntoPago: 5, porcentajeProntoPago: 5 });
    const { systemCtx } = await import("@/lib/auth/system-ctx");
    const ctx = await systemCtx(conjunto.id);
    const [u1, u2, u3] = await makeUnidades(conjunto.id, 3, 300_000);
    // u1 tiene un anticipo de 100.000
    await registrarPago(ctx, { unidadId: u1.id, valor: 100_000, medio: "EFECTIVO" });

    const r1 = await generarCuotasMes(ctx, "2026-10");
    expect(r1.creadas).toBe(3);
    expect(r1.total).toBe(900_000);
    const r2 = await generarCuotasMes(ctx, "2026-10");
    expect(r2.creadas).toBe(0);
    const cuotas = await prisma.cuota.findMany({ where: { conjuntoId: conjunto.id, periodo: "2026-10" } });
    expect(cuotas).toHaveLength(3);
    const c1 = cuotas.find((c) => c.unidadId === u1.id)!;
    expect(c1.fechaVencimiento.toISOString()).toBe("2026-10-10T05:00:00.000Z");
    expect(toNumber(c1.porcentajeProntoPago)).toBe(5);
    expect(c1.referenciaPago).toMatch(/^\d{14}$/);
    // El anticipo se aplicó
    expect(toNumber(c1.saldo)).toBe(200_000);
    expect(c1.estado).toBe("PARCIAL");
    expect((await saldoUnidad(ctx, u1.id)).saldoAFavor).toBe(0);
    // Si se anula una cuota, se puede volver a generar para esa unidad
    await prisma.cuota.update({ where: { id: cuotas.find((c) => c.unidadId === u2.id)!.id }, data: { estado: "ANULADA", saldo: 0 } });
    expect((await generarCuotasMes(ctx, "2026-10")).creadas).toBe(1);
    expect(await libro(u3.id)).toBe(300_000);
  });

  it("liquida mora diaria sin anatocismo, acumulando en una sola cuota de intereses por mes", async () => {
    const { ctx } = await makeConjunto("Mora");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    await prisma.tasaMora.deleteMany({ where: { conjuntoId: ctx.conjuntoId } });
    await prisma.tasaMora.create({ data: { conjuntoId: ctx.conjuntoId, vigenteDesde: bog("2026-01-01T00:00"), tasaEfectivaAnual: 26.82, tasaMensual: 2, fuente: "prueba" } });
    const c = await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "ADMINISTRACION", valorBase: 300_000, fechaVencimiento: bog("2026-09-10T00:00"), periodo: "2026-09", origen: "GENERACION_MENSUAL" });

    // 5 días de mora: 300.000 × 2 % × 5 / 30 = 1.000
    let r = await liquidarInteresesMora(ctx, bog("2026-09-15T01:00"));
    expect(r.interes).toBe(1000);
    // Mismo día: idempotente
    r = await liquidarInteresesMora(ctx, bog("2026-09-15T13:00"));
    expect(r.interes).toBe(0);
    // 10 días más: 2.000 (la cuota de interés NO causa interés)
    r = await liquidarInteresesMora(ctx, bog("2026-09-25T01:00"));
    expect(r.interes).toBe(2000);
    const intereses = await prisma.cuota.findMany({ where: { unidadId: u.id, concepto: { tipo: "INTERES_MORA" } } });
    expect(intereses).toHaveLength(1);
    expect(toNumber(intereses[0].saldo)).toBe(3000);
    expect(intereses[0].periodo).toBe("2026-09");
    const cuota = await prisma.cuota.findUniqueOrThrow({ where: { id: c.id } });
    expect(toNumber(cuota.interes)).toBe(3000);
    expect(cuota.interesCausadoHasta?.toISOString()).toBe(bog("2026-09-25T00:00").toISOString());

    // Nuevo mes → nueva cuota de intereses; la base sigue siendo solo el capital (300.000)
    r = await liquidarInteresesMora(ctx, bog("2026-10-10T01:00"));
    expect(r.interes).toBe(3000); // 15 días × 200
    expect(await prisma.cuota.count({ where: { unidadId: u.id, concepto: { tipo: "INTERES_MORA" } } })).toBe(2);
    expect(await libro(u.id)).toBe(306_000);

    // Pago parcial: primero intereses (orden legal), luego capital; la mora se calcula sobre el capital restante
    await registrarPago(ctx, { unidadId: u.id, valor: 156_000, medio: "EFECTIVO", fecha: bog("2026-10-10T10:00") });
    const cap = await prisma.cuota.findUniqueOrThrow({ where: { id: c.id } });
    expect(toNumber(cap.saldo)).toBe(150_000);
    r = await liquidarInteresesMora(ctx, bog("2026-10-20T01:00"));
    expect(r.interes).toBe(1000); // 150.000 × 2 % × 10 / 30
  });

  it("acuerdo de pago: traslada el vencido a N cuotas, cuadra el libro y se cumple al pagar", async () => {
    const { ctx } = await makeConjunto("Acuerdo");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    const hoy = new Date();
    for (let i = 3; i >= 1; i--) {
      await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "ADMINISTRACION", valorBase: 300_000, fechaVencimiento: new Date(hoy.getTime() - i * 30 * DIA), periodo: `2026-0${i}`, origen: "GENERACION_MENSUAL" });
    }
    await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "INTERES_MORA", valorBase: 25_000, fechaVencimiento: new Date(hoy.getTime() - 5 * DIA), origen: "INTERES" });
    const antes = await libro(u.id);
    const a = await crearAcuerdo(ctx, { unidadId: u.id, numeroCuotas: 4, diaPago: 15 });
    expect(toNumber(a.saldoInicial)).toBe(925_000);
    const d = await detalleAcuerdo(ctx, a.id);
    expect(d.originales).toHaveLength(4);
    expect(d.plan).toHaveLength(4);
    expect(d.plan.reduce((s, c) => s + toNumber(c.valorBase), 0)).toBe(925_000);
    expect(d.originales.every((o) => o.estado === "EN_ACUERDO" && toNumber(o.saldo) === 0)).toBe(true);
    expect(await libro(u.id)).toBe(antes);
    const s = await saldoUnidad(ctx, u.id);
    expect(s.total).toBe(925_000);
    expect(s.vencido).toBe(0); // todo quedó por vencer en el plan
    await expect(crearAcuerdo(ctx, { unidadId: u.id, numeroCuotas: 2, diaPago: 10 })).rejects.toThrow(/vigente/);
    await registrarPago(ctx, { unidadId: u.id, valor: 925_000, medio: "TRANSFERENCIA" });
    expect(await evaluarAcuerdo(ctx, a.id)).toBe("CUMPLIDO");
  });

  it("paz y salvo: solo se emite automáticamente si la unidad está al día", async () => {
    const { ctx } = await makeConjunto("PazSalvo");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "ADMINISTRACION", valorBase: 300_000, fechaVencimiento: new Date(Date.now() - 20 * DIA), origen: "MANUAL" });
    const r1 = await solicitarPazYSalvo(ctx, u.id);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.saldo.vencido).toBe(300_000);
    await registrarPago(ctx, { unidadId: u.id, valor: 300_000, medio: "EFECTIVO" });
    const r2 = await solicitarPazYSalvo(ctx, u.id);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.certificado.codigo).toMatch(/^PYS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(r2.certificado.vigenteHasta.getTime()).toBeGreaterThan(Date.now() + 29 * DIA);
      // Una segunda solicitud devuelve el mismo certificado vigente
      const r3 = await solicitarPazYSalvo(ctx, u.id);
      expect(r3.ok && r3.certificado.id).toBe(r2.certificado.id);
    }
  });

  it("conciliación: empareja por referencia de pago y crea pagos desde líneas no identificadas", async () => {
    const { ctx } = await makeConjunto("Concilia");
    const [u1, u2] = await makeUnidades(ctx.conjuntoId, 2);
    const c1 = await crearCargo(ctx, { unidadId: u1.id, conceptoTipo: "ADMINISTRACION", valorBase: 300_000, fechaVencimiento: new Date(Date.now() + 5 * DIA), origen: "MANUAL" });
    const c2 = await crearCargo(ctx, { unidadId: u2.id, conceptoTipo: "ADMINISTRACION", valorBase: 280_000, fechaVencimiento: new Date(Date.now() + 5 * DIA), origen: "MANUAL" });
    // u1 ya reportó su transferencia (pago registrado, sin conciliar)
    const p1 = await registrarPago(ctx, { unidadId: u1.id, valor: 300_000, medio: "TRANSFERENCIA", fecha: new Date(Date.now() - DIA) });
    const conc = await prisma.conciliacionBancaria.create({ data: { conjuntoId: ctx.conjuntoId, archivoNombre: "extracto.csv" } });
    const hoy = new Date();
    await prisma.lineaExtracto.createMany({
      data: [
        { conjuntoId: ctx.conjuntoId, conciliacionId: conc.id, fecha: hoy, descripcion: `CONSIGNACION REF ${c1.referenciaPago}`, valor: 300_000 },
        { conjuntoId: ctx.conjuntoId, conciliacionId: conc.id, fecha: hoy, descripcion: "CONSIG NAL", referencia: c2.referenciaPago, valor: 280_000 },
        { conjuntoId: ctx.conjuntoId, conciliacionId: conc.id, fecha: hoy, descripcion: "ABONO SIN REFERENCIA", valor: 77_777 },
      ],
    });
    const r = await emparejarAutomatico(ctx, conc.id);
    expect(r.emparejadas).toBe(1);
    expect(r.sugeridas).toBe(1);
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: p1.id } })).conciliado).toBe(true);
    const sugerida = await prisma.lineaExtracto.findFirstOrThrow({ where: { conciliacionId: conc.id, unidadSugeridaId: u2.id, estado: "PENDIENTE" } });
    const pago = await crearPagoDesdeLinea(ctx, { lineaId: sugerida.id, unidadId: u2.id });
    expect(pago.numeroRecibo).toBeGreaterThan(0);
    expect((await prisma.cuota.findUniqueOrThrow({ where: { id: c2.id } })).estado).toBe("PAGADA");
    expect(await prisma.lineaExtracto.count({ where: { conciliacionId: conc.id, estado: "PENDIENTE" } })).toBe(1);
  });

  it("anular un pago revierte aplicaciones, descuento de pronto pago y libro auxiliar", async () => {
    const { ctx } = await makeConjunto("AnularPago");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    const futura = new Date(Date.now() + 10 * DIA);
    const c = await crearCargo(ctx, { unidadId: u.id, conceptoTipo: "ADMINISTRACION", valorBase: 400_000, fechaVencimiento: futura, fechaProntoPago: futura, porcentajeProntoPago: 5, origen: "GENERACION_MENSUAL" });
    const p = await registrarPago(ctx, { unidadId: u.id, valor: 380_000, medio: "EFECTIVO" });
    expect((await prisma.cuota.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe("PAGADA");
    expect(await libro(u.id)).toBe(0);
    await anularPago(ctx, p.id, "Billete falso detectado");
    const cc = await prisma.cuota.findUniqueOrThrow({ where: { id: c.id } });
    expect(cc.estado).toBe("PENDIENTE");
    expect(toNumber(cc.saldo)).toBe(400_000);
    expect(toNumber(cc.descuento)).toBe(0);
    expect(await libro(u.id)).toBe(400_000);
    expect((await saldoUnidad(ctx, u.id)).saldoAFavor).toBe(0);
  });

  it("gestiones de cobro: bloquea fuera de horario y más de un contacto por semana y canal", async () => {
    const { ctx } = await makeConjunto("Ley2300");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    const domingo = bog("2026-10-04T10:00");
    expect((await puedeContactar(u.id, "LLAMADA", domingo)).ok).toBe(false);
    await expect(registrarGestion(ctx, { unidadId: u.id, canal: "LLAMADA" }, domingo)).rejects.toThrow(/domingos/);
    const lunes = bog("2026-10-05T10:00");
    await registrarGestion(ctx, { unidadId: u.id, canal: "LLAMADA", resultado: "Promete pagar" }, lunes);
    const r = await puedeContactar(u.id, "LLAMADA", bog("2026-10-08T10:00"));
    expect(r.ok).toBe(false);
    expect(r.contactosSemana).toBe(1);
    // Otro canal sí se permite; y la semana siguiente también
    expect((await puedeContactar(u.id, "CORREO", bog("2026-10-08T10:00"))).ok).toBe(true);
    expect((await puedeContactar(u.id, "LLAMADA", bog("2026-10-13T10:00"))).ok).toBe(true);
  });
});
