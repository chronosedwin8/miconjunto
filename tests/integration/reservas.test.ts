import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { crearCargo, registrarPago } from "@/lib/cartera/core";
import { cancelarReserva, checkIn, checkOut, crearReserva, disponibilidad, aprobarReserva } from "@/lib/reservas/service";
import { fechaHoraBogota, fechaLocal, sumarDias } from "@/lib/reservas/reglas";
import { opcionesCola, procesarPendientes } from "@/lib/facturacion/service";
import { toNumber } from "@/lib/format";
import { systemCtx } from "@/lib/auth/system-ctx";
import { makeConjunto, makeUnidades } from "../helpers/db";

const TODO_EL_DIA = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { abre: "06:00", cierra: "23:00" }]));

async function zona(conjuntoId: string, extra: Record<string, unknown> = {}) {
  return prisma.zonaComun.create({
    data: {
      conjuntoId,
      nombre: "Salón social",
      categoria: "SALON",
      capacidad: 50,
      horario: TODO_EL_DIA,
      tarifa: 250000,
      deposito: 100000,
      gravaIva: true,
      tarifaIva: 19,
      generaFactura: true,
      requiereAprobacion: false,
      duracionMinimaMin: 120,
      duracionMaximaMin: 480,
      anticipacionMinimaHoras: 0,
      anticipacionMaximaDias: 90,
      maxReservasMesUnidad: 5,
      bloqueoPorMora: true,
      horasCancelacionReembolso: 12,
      ...extra,
    },
  });
}

describe("reservas con cobro, pago y factura electrónica (simulador)", () => {
  beforeAll(() => {
    opcionesCola.segundoPlano = false;
  });
  afterAll(async () => {
    opcionesCola.segundoPlano = true;
    await prisma.$disconnect();
  });

  it("reserva con tarifa → cuota + depósito → pago.aprobado → APROBADA + factura PENDIENTE → VALIDADA; cancelación con nota crédito", async () => {
    const { ctx } = await makeConjunto("Reservas");
    const [u] = await makeUnidades(ctx.conjuntoId, 1);
    const z = await zona(ctx.conjuntoId);
    const manana = sumarDias(fechaLocal(new Date()), 2);
    const inicio = fechaHoraBogota(manana, "14:00");
    const fin = fechaHoraBogota(manana, "18:00");

    const r = await crearReserva(ctx, { zonaId: z.id, unidadId: u.id, inicio, fin, asistentes: 30, motivo: "Cumpleaños" });
    expect(r.reserva.estado).toBe("SOLICITADA");
    expect(r.requierePago).toBe(true);
    expect(r.cuotaIds).toHaveLength(2);
    expect(r.enlacePago).toContain(`/cuenta/pagar?cuotas=${r.cuotaIds.join(",")}&unidad=${u.id}`);
    const [alquiler, deposito] = await Promise.all(r.cuotaIds.map((id) => prisma.cuota.findUniqueOrThrow({ where: { id }, include: { concepto: true } })));
    expect(alquiler.concepto.tipo).toBe("ALQUILER_ZONA");
    expect(toNumber(alquiler.valorBase)).toBe(250000);
    expect(toNumber(alquiler.iva)).toBe(47500);
    expect(alquiler.origen).toBe("RESERVA");
    expect(deposito.concepto.tipo).toBe("OTRO");
    expect(toNumber(deposito.valorBase)).toBe(100000);
    expect(deposito.cuotaOrigenId).toBe(alquiler.id);

    // Traslape: otra unidad no puede tomar la misma franja
    const [u2] = await makeUnidades(ctx.conjuntoId, 1);
    await expect(crearReserva(ctx, { zonaId: z.id, unidadId: u2.id, inicio: fechaHoraBogota(manana, "17:00"), fin: fechaHoraBogota(manana, "20:00"), asistentes: 5 })).rejects.toThrow(/ocupado/);

    // La disponibilidad muestra la reserva ajena solo como ocupada para un residente
    const residente = { ...(await systemCtx(ctx.conjuntoId)), esSuperAdmin: false, permisos: new Set(["reservas.ver", "reservas.crear"]), unidadIds: [u2.id], userId: "otro" };
    const disp = await disponibilidad(residente, z.id, manana, manana);
    expect(disp.dias[0].ocupados).toEqual([{ inicio: inicio.toISOString(), fin: fin.toISOString(), propia: false }]);

    // Pago aprobado de ambas cuotas → evento pago.aprobado
    await registrarPago(ctx, { unidadId: u.id, valor: 397500, medio: "PSE", cuotasSeleccionadas: r.cuotaIds });
    const pagada = await prisma.reserva.findUniqueOrThrow({ where: { id: r.reserva.id } });
    expect(pagada.pagada).toBe(true);
    expect(pagada.estado).toBe("APROBADA");
    expect(pagada.pagoId).toBeTruthy();
    let factura = await prisma.facturaElectronica.findUniqueOrThrow({ where: { referenceCode: `RES-${r.reserva.id}` } });
    expect(factura.estado).toBe("PENDIENTE");
    expect(toNumber(factura.subtotal)).toBe(250000);
    expect(toNumber(factura.iva)).toBe(47500);
    expect(toNumber(factura.total)).toBe(297500); // el depósito no se factura

    const res = await procesarPendientes({ conjuntoId: ctx.conjuntoId });
    expect(res.validadas).toBe(1);
    factura = await prisma.facturaElectronica.findUniqueOrThrow({ where: { id: factura.id } });
    expect(factura.estado).toBe("VALIDADA");
    expect(factura.proveedor).toBe("SIMULADO");
    expect(factura.numero).toMatch(/^SETP-990000\d{3}$/);
    expect(factura.cufe).toMatch(/^[0-9a-f]{96}$/);
    expect(factura.pdfUrl).toMatch(/^\/api\/files\//);
    expect(factura.xmlUrl).toMatch(/\.xml$/);
    const enviado = (factura.payload as { enviado: { items: { price: string; taxes: { rate: string }[] }[]; payment_details: { payment_method_code: string }[] } }).enviado;
    expect(enviado.items[0].price).toBe("250000.00");
    expect(enviado.payment_details[0].payment_method_code).toBe("47");
    expect(await prisma.adjunto.count({ where: { entidad: "Pago", entidadId: pagada.pagoId! } })).toBe(2);

    // Cancelación con más de 12 h de anticipación → reembolso + nota crédito
    const c = await cancelarReserva(ctx, r.reserva.id, "Cambio de planes");
    expect(c.politica.tipo).toBe("REEMBOLSO");
    expect(c.politica.reembolsoAlquiler).toBe(297500);
    expect(c.politica.reembolsoDeposito).toBe(100000);
    const nc = await prisma.facturaElectronica.findUniqueOrThrow({ where: { referenceCode: `NC-RES-${r.reserva.id}` } });
    expect(nc.tipo).toBe("NOTA_CREDITO");
    await procesarPendientes({ conjuntoId: ctx.conjuntoId });
    expect((await prisma.facturaElectronica.findUniqueOrThrow({ where: { id: nc.id } })).estado).toBe("VALIDADA");
    expect((await prisma.facturaElectronica.findUniqueOrThrow({ where: { id: factura.id } })).estado).toBe("ANULADA");
  });

  it("bloqueo por mora, aprobación previa y acta con daño que crea ticket", async () => {
    const { ctx } = await makeConjunto("Mora");
    const [moroso, alDia] = await makeUnidades(ctx.conjuntoId, 2);
    const z = await zona(ctx.conjuntoId);
    await crearCargo(ctx, { unidadId: moroso.id, conceptoTipo: "ADMINISTRACION", valorBase: 300000, fechaVencimiento: new Date(Date.now() - 40 * 86400000), origen: "MANUAL" });
    const dia = sumarDias(fechaLocal(new Date()), 3);
    await expect(crearReserva(ctx, { zonaId: z.id, unidadId: moroso.id, inicio: fechaHoraBogota(dia, "10:00"), fin: fechaHoraBogota(dia, "12:00"), asistentes: 4 })).rejects.toThrow(/saldo vencido/);

    // Zona gratuita que requiere aprobación: queda SOLICITADA y la aprobación la deja APROBADA
    const sala = await zona(ctx.conjuntoId, { nombre: "Sala de juntas", categoria: "SALA_JUNTAS", tarifa: 0, deposito: 0, gravaIva: false, generaFactura: false, requiereAprobacion: true, bloqueoPorMora: false });
    const r = await crearReserva(ctx, { zonaId: sala.id, unidadId: moroso.id, inicio: fechaHoraBogota(dia, "10:00"), fin: fechaHoraBogota(dia, "12:00"), asistentes: 4 });
    expect(r.reserva.estado).toBe("SOLICITADA");
    expect(r.requierePago).toBe(false);
    expect((await aprobarReserva(ctx, r.reserva.id)).estado).toBe("APROBADA");

    // Zona gratuita sin aprobación: APROBADA de inmediato; check-in/out con daño → ticket DAÑO_ZONA_COMUN
    const gym = await zona(ctx.conjuntoId, { nombre: "Gimnasio", categoria: "GIMNASIO", tarifa: 0, deposito: 0, gravaIva: false, generaFactura: false, bloqueoPorMora: false, anticipacionMinimaHoras: 0 });
    const ahora = new Date();
    const hoy = fechaLocal(ahora);
    const inicio = new Date(Math.ceil(ahora.getTime() / 3600000) * 3600000);
    const libre = fechaLocal(inicio) === hoy && inicio.getTime() + 2 * 3600000 <= fechaHoraBogota(hoy, "23:00").getTime();
    if (libre) {
      const g = await crearReserva(ctx, { zonaId: gym.id, unidadId: alDia.id, inicio, fin: new Date(inicio.getTime() + 2 * 3600000), asistentes: 1 });
      expect(g.reserva.estado).toBe("APROBADA");
      await checkIn(ctx, g.reserva.id, { items: ["Aseo"], checklist: ["Aseo"], observaciones: "Todo bien" });
      const out = await checkOut(ctx, g.reserva.id, { items: ["Aseo"], checklist: [], danos: true, descripcionDano: "Espejo roto", proponerMulta: true, valorMulta: 150000, fotos: [] });
      const t = await prisma.ticket.findUniqueOrThrow({ where: { id: out.ticketId! } });
      expect(t.tipo).toBe("DANO_ZONA_COMUN");
      expect(t.zonaId).toBe(gym.id);
      expect(out.multaId).toBeTruthy();
      expect(out.reserva.estado).toBe("CUMPLIDA");
    }
  });
});
