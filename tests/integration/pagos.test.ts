import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { crearCargo, saldoUnidad } from "@/lib/cartera/core";
import { iniciarPagoEnLinea } from "@/lib/pagos/service";
import { crearLinkPago, datosLinkPago, iniciarPagoPublico } from "@/lib/pagos/publico";
import { crearCampanaCobro, ejecutarCampanaCobro } from "@/lib/pagos/campana";
import { registrarApertura, registrarClic } from "@/lib/pagos/tracking";
import { simuladorFirmar } from "@/lib/pagos/firmas";
import { POST as webhookSimulador } from "@/app/api/webhooks/simulador/route";
import { toNumber } from "@/lib/format";
import type { Ctx } from "@/lib/auth/context";
import { makeConjunto, makeUnidades } from "../helpers/db";

function webhook(body: object, firma?: string) {
  const raw = JSON.stringify(body);
  return webhookSimulador(
    new Request("http://localhost:3000/api/webhooks/simulador", {
      method: "POST",
      headers: { "content-type": "application/json", "x-simulador-firma": firma ?? simuladorFirmar(raw), "x-forwarded-for": "10.0.0.1" },
      body: raw,
    }),
  );
}

async function escenario() {
  const { ctx } = await makeConjunto("Pagos");
  const [u] = await makeUnidades(ctx.conjuntoId, 1);
  const hoy = new Date();
  const futura = new Date(hoy.getTime() + 10 * 86400000);
  const cuota = await crearCargo(ctx, {
    unidadId: u.id,
    conceptoTipo: "ADMINISTRACION",
    valorBase: 300000,
    fechaVencimiento: futura,
    fechaProntoPago: futura,
    porcentajeProntoPago: 10,
    periodo: "2026-09",
    origen: "GENERACION_MENSUAL",
  });
  return { ctx, u, cuota };
}

describe("pagos en línea con el simulador (flujo completo)", () => {
  afterAll(() => prisma.$disconnect());

  it("iniciar pago → webhook firmado → pago aprobado aplicado a la cuota → saldo 0; repetido no duplica", async () => {
    const { ctx, u, cuota } = await escenario();
    const r = await iniciarPagoEnLinea(ctx, { unidadId: u.id, medio: "PSE" });
    expect(r.pasarela).toBe("SIMULADOR");
    expect(r.valor).toBe(270000); // 10 % de pronto pago
    expect(r.url).toContain(`/pagar/simulador/${r.referencia}?t=`);
    let pago = await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } });
    expect(pago.estado).toBe("PENDIENTE");
    expect(pago.cuotasSeleccionadas).toEqual([cuota.id]);

    // Reintento idempotente: misma selección → misma referencia
    const r2 = await iniciarPagoEnLinea(ctx, { unidadId: u.id, medio: "NEQUI" });
    expect(r2.referencia).toBe(r.referencia);
    expect(r2.reutilizado).toBe(true);

    const evento = { referencia: r.referencia, estado: "APROBADO", medio: "NEQUI", valor: 270000, id: "SIM-1" };
    const res = await webhook(evento);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { resultado: string }).resultado).toBe("APROBADO");

    pago = await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } });
    expect(pago.estado).toBe("APROBADO");
    expect(pago.medio).toBe("NEQUI");
    expect(pago.referenciaExterna).toBe("SIM-1");
    expect(pago.numeroRecibo).toBeGreaterThan(0);
    const c = await prisma.cuota.findUniqueOrThrow({ where: { id: cuota.id } });
    expect(c.estado).toBe("PAGADA");
    expect(toNumber(c.descuento)).toBe(30000);
    const s = await saldoUnidad(ctx, u.id);
    expect(s.total).toBe(0);
    expect(s.saldoAFavor).toBe(0);

    // Webhook repetido: no duplica aplicaciones, movimientos ni recibo
    const [apps, movs] = await Promise.all([
      prisma.aplicacionPago.count({ where: { pagoId: pago.id } }),
      prisma.movimientoCartera.count({ where: { unidadId: u.id } }),
    ]);
    const res2 = await webhook(evento);
    expect(((await res2.json()) as { resultado: string }).resultado).toBe("DUPLICADO");
    expect(await prisma.aplicacionPago.count({ where: { pagoId: pago.id } })).toBe(apps);
    expect(await prisma.movimientoCartera.count({ where: { unidadId: u.id } })).toBe(movs);
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: pago.id } })).numeroRecibo).toBe(pago.numeroRecibo);
    // Se notificó (centro de notificaciones no requiere usuario; el correo al pagador sí si hay correo)
  });

  it("rechaza firmas inválidas, montos que no coinciden y pagos de otra pasarela", async () => {
    const { ctx, u } = await escenario();
    const r = await iniciarPagoEnLinea(ctx, { unidadId: u.id });
    const evento = { referencia: r.referencia, estado: "APROBADO", medio: "PSE", valor: r.valor, id: "SIM-2" };

    const mala = await webhook(evento, simuladorFirmar(JSON.stringify({ ...evento, valor: 1 })));
    expect(mala.status).toBe(401);
    const sinFirma = await webhook(evento, "t=1,v1=00");
    expect(sinFirma.status).toBe(401);
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } })).estado).toBe("PENDIENTE");

    const monto = await webhook({ ...evento, valor: 1000 });
    expect(((await monto.json()) as { resultado: string }).resultado).toBe("MONTO_INVALIDO");
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } })).estado).toBe("PENDIENTE");

    await prisma.pago.update({ where: { id: r.pagoId }, data: { pasarela: "WOMPI" } });
    const otra = await webhook(evento);
    expect(((await otra.json()) as { resultado: string }).resultado).toBe("IGNORADO");
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } })).estado).toBe("PENDIENTE");
  });

  it("un pago rechazado queda RECHAZADO sin tocar la cartera", async () => {
    const { ctx, u, cuota } = await escenario();
    const r = await iniciarPagoEnLinea(ctx, { unidadId: u.id, cuotaIds: [cuota.id] });
    const res = await webhook({ referencia: r.referencia, estado: "RECHAZADO", medio: "TARJETA", valor: r.valor, id: "SIM-3" });
    expect(((await res.json()) as { resultado: string }).resultado).toBe("RECHAZADO");
    expect((await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } })).estado).toBe("RECHAZADO");
    expect((await prisma.cuota.findUniqueOrThrow({ where: { id: cuota.id } })).estado).toBe("PENDIENTE");
  });

  it("no deja pagar la cuenta de una unidad ajena", async () => {
    const { ctx, u } = await escenario();
    const ajeno = {
      ...ctx,
      userId: "usuario-ajeno",
      esSuperAdmin: false,
      permisos: new Set(["pagos.pagar", "cartera.ver"]),
      personaIds: [],
      unidadIds: [],
      rolBase: "PROPIETARIO",
    } as Ctx;
    await expect(iniciarPagoEnLinea(ajeno, { unidadId: u.id })).rejects.toThrow(/permiso/);
  });

  it("link público: muestra el saldo y crea el pago sin sesión", async () => {
    const { ctx, u } = await escenario();
    const link = await crearLinkPago(ctx.conjuntoId, u.id, 1);
    expect(link.url).toContain(`/pagar/${link.token}`);
    const datos = await datosLinkPago(link.token);
    expect(datos?.unidad.id).toBe(u.id);
    expect(datos?.saldo.total).toBe(300000);
    expect(await datosLinkPago("token-que-no-existe-xxxxxxxxxxxx")).toBeNull();
    const r = await iniciarPagoPublico(link.token, { medio: "PSE", pagadorEmail: "pagador@correo.co", pagadorNombre: "Pagador" });
    const pago = await prisma.pago.findUniqueOrThrow({ where: { id: r.pagoId } });
    expect(pago.pagadorEmail).toBe("pagador@correo.co");
    expect((pago.datosPasarela as { returnPath: string }).returnPath).toMatch(new RegExp(`^/pagar/estado/${r.referencia}\\?f=[0-9a-f]{24}$`));
  });

  it("campaña de cobro: correo con link de pago, PDF adjunto y métricas de apertura/clic", async () => {
    const { ctx, u } = await escenario();
    const persona = await prisma.persona.create({
      data: { conjuntoId: ctx.conjuntoId, numeroDocumento: String(Date.now()), nombres: "Marta", apellidos: "Díaz", email: `marta${Date.now()}@correo.co` },
    });
    await prisma.vinculoUnidad.create({ data: { conjuntoId: ctx.conjuntoId, personaId: persona.id, unidadId: u.id, tipo: "PROPIETARIO", principal: true } });
    const c = await crearCampanaCobro(ctx, { montoMinimo: 0, ejecucion: "esperar" });
    // Fuera del horario de la Ley 2300 queda programada: se fuerza el envío para la prueba.
    if (c.estado === "PROGRAMADA") {
      await prisma.campanaCorreo.update({ where: { id: c.id }, data: { estado: "ENVIANDO" } });
      await ejecutarCampanaCobro(c.id);
    }
    const campana = await prisma.campanaCorreo.findUniqueOrThrow({ where: { id: c.id }, include: { correos: true } });
    expect(campana.estado).toBe("ENVIADA");
    expect(campana.tipo).toBe("COBRO_ADMINISTRACION");
    expect(campana.correos).toHaveLength(1);
    const correo = campana.correos[0];
    expect(correo.para).toBe(persona.email);
    expect(correo.html).toContain("/api/track/open/");
    expect(correo.html).toContain(encodeURIComponent("/pagar/"));
    expect((correo.adjuntos as { filename: string }[])[0].filename).toMatch(/estado-cuenta/);

    await registrarApertura(correo.trackingId);
    await registrarApertura(correo.trackingId);
    const destino = decodeURIComponent(correo.html.match(/\?u=([^"]+)"/)![1]);
    expect(await registrarClic(correo.trackingId, destino)).toBe(destino);
    expect(await registrarClic(correo.trackingId, "https://sitio-malicioso.example/robo")).not.toContain("malicioso");
    const m = await prisma.campanaCorreo.findUniqueOrThrow({ where: { id: c.id } });
    expect(m.aperturas).toBe(1);
    expect(m.clics).toBe(1);
  });
});
