import { systemCtx } from "@/lib/auth/system-ctx";
import { crearCargo, registrarPago, saldoUnidad } from "@/lib/cartera/core";
import { periodoActual } from "@/lib/format";
import { prisma, type SeedState } from "./util";

/**
 * Pagos en línea (demo): garantiza que Laura (T1-101) tenga cuotas por pagar con descuento de pronto pago,
 * agrega pagos en línea históricos (simulador) a algunas unidades y una campaña de cobro con métricas.
 * Si el seed de Cartera ya creó cuotas, no las duplica.
 */
export async function seedPagos(s: SeedState) {
  // En el seed no se cargan los suscriptores de eventos (webhooks salientes, tiempo real, PDF de otros módulos):
  // algunos dependen de paquetes que tsx no resuelve fuera de Next.
  const g = globalThis as unknown as { __mcSubsLoaded?: boolean };
  const antes = g.__mcSubsLoaded;
  g.__mcSubsLoaded = true;
  try {
    await sembrar(s);
  } finally {
    g.__mcSubsLoaded = antes;
  }
}

async function sembrar(s: SeedState) {
  const ctx = await systemCtx(s.conjuntoId);
  const t1101 = await prisma.unidad.findFirst({ where: { conjuntoId: s.conjuntoId, codigo: "T1-101" } });
  if (!t1101) return;
  const valor = Number(t1101.cuotaAdministracion) || 320000;
  const hoy = s.now;
  const periodo = periodoActual(hoy);
  const [y, m] = periodo.split("-").map(Number);
  const dia = (d: number, mesOffset = 0) => new Date(Date.UTC(y, m - 1 + mesOffset, d, 5, 0, 0));

  const saldo = await saldoUnidad(ctx, t1101.id);
  const demoT1101 = await prisma.pago.count({ where: { unidadId: t1101.id, referenciaExterna: "SIM-DEMO-0001" } });
  if (saldo.total <= 0 && !demoT1101) {
    // Mes anterior pagado en línea, mes actual pendiente con pronto pago vigente (si aún no pasó el día 5, se corre al 28).
    const anterior = await crearCargo(ctx, {
      unidadId: t1101.id,
      conceptoTipo: "ADMINISTRACION",
      valorBase: valor,
      periodo: periodoActual(dia(15, -1)),
      fechaEmision: dia(1, -1),
      fechaVencimiento: dia(10, -1),
      origen: "GENERACION_MENSUAL",
    });
    await registrarPago(ctx, {
      unidadId: t1101.id,
      valor,
      fecha: dia(8, -1),
      medio: "PSE",
      pasarela: "SIMULADOR",
      referenciaExterna: "SIM-DEMO-0001",
      cuotasSeleccionadas: [anterior.id],
      observaciones: "Pago en línea",
    });
    const pronto = new Date(Math.max(dia(5).getTime(), hoy.getTime() + 5 * 86_400_000));
    await crearCargo(ctx, {
      unidadId: t1101.id,
      conceptoTipo: "ADMINISTRACION",
      valorBase: valor,
      periodo,
      fechaEmision: dia(1),
      fechaVencimiento: new Date(Math.max(dia(10).getTime(), pronto.getTime() + 5 * 86_400_000)),
      fechaProntoPago: pronto,
      porcentajeProntoPago: 5,
      origen: "GENERACION_MENSUAL",
    });
    await crearCargo(ctx, {
      unidadId: t1101.id,
      conceptoTipo: "ALQUILER_ZONA",
      valorBase: 150000,
      iva: 28500,
      descripcion: "Alquiler salón social (reserva)",
      fechaVencimiento: new Date(hoy.getTime() + 3 * 86_400_000),
      origen: "RESERVA",
    }).catch(() => undefined); // si no existe el concepto de alquiler, se omite
  }

  // Idempotente: si el historial demo ya existe, no se repite.
  const yaSembrado = await prisma.pago.count({ where: { conjuntoId: s.conjuntoId, referenciaExterna: { startsWith: "SIM-DEMO-1" } } });

  // Historial: pagos en línea aprobados y uno rechazado en otras unidades con saldo.
  const otras = await prisma.unidad.findMany({
    where: { conjuntoId: s.conjuntoId, id: { not: t1101.id }, deletedAt: null, cuotas: { some: { estado: { in: ["PENDIENTE", "PARCIAL"] }, deletedAt: null } } },
    orderBy: { codigo: "asc" },
    take: 4,
  });
  const medios = ["PSE", "NEQUI", "TARJETA", "BANCOLOMBIA_QR"] as const;
  for (const [i, u] of yaSembrado ? [] : otras.entries()) {
    const sal = await saldoUnidad(ctx, u.id);
    const cuota = sal.cuotas[0];
    if (!cuota) continue;
    if (i === 3) {
      await registrarPago(ctx, { unidadId: u.id, valor: cuota.saldo, medio: "TARJETA", pasarela: "SIMULADOR", estado: "PENDIENTE", cuotasSeleccionadas: [cuota.id], observaciones: "Pago en línea" });
      const p = await prisma.pago.findFirst({ where: { unidadId: u.id, estado: "PENDIENTE" }, orderBy: { createdAt: "desc" } });
      if (p) await prisma.pago.update({ where: { id: p.id }, data: { estado: "RECHAZADO", referenciaExterna: "SIM-DEMO-RECH" } });
      continue;
    }
    await registrarPago(ctx, {
      unidadId: u.id,
      valor: cuota.saldo,
      medio: medios[i],
      pasarela: "SIMULADOR",
      referenciaExterna: `SIM-DEMO-${1000 + i}`,
      cuotasSeleccionadas: [cuota.id],
      observaciones: i === 1 ? "Pago en línea · origen: link público" : "Pago en línea",
    });
  }

  // Campaña de cobro del mes pasado con métricas (ilustrativas para el tablero), una sola vez.
  const campanaDemo = await prisma.campanaCorreo.count({ where: { conjuntoId: s.conjuntoId, tipo: "COBRO_ADMINISTRACION", plantilla: { startsWith: "Hola {{nombre}}:\n\nEl saldo de" } } });
  if (campanaDemo) return;
  await prisma.campanaCorreo.create({
    data: {
      conjuntoId: s.conjuntoId,
      asunto: "Cuota de administración {{mes}} · {{unidad}}",
      plantilla: "Hola {{nombre}}:\n\nEl saldo de {{unidad}} es {{saldo}}. Paga aquí: {{link_pago}}",
      tipo: "COBRO_ADMINISTRACION",
      estado: "ENVIADA",
      programadaPara: dia(1, -1),
      createdAt: dia(1, -1),
      definicionSegmento: { montoMinimo: 1000, periodo: periodoActual(dia(15, -1)), automatica: true, unidades: 71, omitidosFrecuencia: 2 },
      totalDestinatarios: 84,
      enviados: 84,
      aperturas: 57,
      clics: 31,
    },
  });
}
