import { systemCtx } from "@/lib/auth/system-ctx";
import { crearCargo, registrarPago, saldoUnidad } from "@/lib/cartera/core";
import { generarCuotasMes, crearCuotaExtraordinaria } from "@/lib/cartera/generacion";
import { liquidarInteresesMora } from "@/lib/cartera/mora";
import { crearAcuerdo, seguimientoAcuerdos } from "@/lib/cartera/acuerdos";
import { solicitarPazYSalvo, emitirPazYSalvoManual, codigoVerificacion } from "@/lib/cartera/paz-y-salvo";
import { emparejarAutomatico } from "@/lib/cartera/conciliacion";
import { horarioCobranzaPermitido, registrarGestion, semanaCalendario } from "@/lib/cartera/cobranza";
import { round, sumarMeses, tasaMaximaMora, tasaMensualDesdeEA } from "@/lib/cartera/calculos";
import { periodoActual, toNumber } from "@/lib/format";
import type { MedioPago } from "@prisma/client";
import { prisma, type SeedState } from "./util";

/**
 * Cartera demo (Fase 3): 6 meses de cuotas generadas con el servicio, pagos (la mayoría a tiempo, varios con pronto
 * pago), ~15 % de unidades en mora de 1 a 5 meses, 2 unidades con más de 120 días (saldo de apertura), intereses de mora
 * liquidados con el historial de tasas, 2 cuotas extraordinarias (una en 3 fracciones), 2 acuerdos de pago (uno vigente
 * y uno incumplido), gestiones de cobro dentro del horario de la Ley 2300, paz y salvos y una conciliación bancaria.
 * Demo: T1-101 (Laura) con el mes actual pendiente y un saldo pequeño del mes anterior; T3-804 y T2-302 al día.
 */
export async function seedCartera(s: SeedState) {
  // Sin suscriptores de eventos durante el seed (webhooks/tiempo real no aplican y algunos dependen de Next).
  const g = globalThis as unknown as { __mcSubsLoaded?: boolean };
  const antes = g.__mcSubsLoaded;
  g.__mcSubsLoaded = true;
  try {
    await limpiar(s);
    await sembrar(s);
  } finally {
    g.__mcSubsLoaded = antes;
  }
}

/**
 * Idempotencia (scripts/seed-uno.ts): borra solo las filas propias de cartera del conjunto demo — cuotas generadas,
 * de intereses, apertura, extraordinarias y acuerdos; pagos registrados por la administración (los demás módulos
 * usan el contexto de sistema) y sus aplicaciones/movimientos; tasas, cuentas, conciliaciones, gestiones, acuerdos y
 * certificados. No toca cuotas de reservas, multas ni pagos en línea de otros módulos.
 */
async function limpiar(s: SeedState) {
  const conjuntoId = s.conjuntoId;
  const cuotas = await prisma.cuota.findMany({
    where: { conjuntoId, OR: [{ origen: { in: ["GENERACION_MENSUAL", "INTERES", "APERTURA"] } }, { cuotaExtraordinariaId: { not: null } }, { acuerdoId: { not: null } }] },
    select: { id: true },
  });
  const cuotaIds = cuotas.map((c) => c.id);
  const pagos = s.users.administrador ? await prisma.pago.findMany({ where: { conjuntoId, registradoPorId: s.users.administrador }, select: { id: true } }) : [];
  const pagoIds = pagos.map((p) => p.id);
  await prisma.aplicacionPago.deleteMany({ where: { conjuntoId, OR: [{ cuotaId: { in: cuotaIds } }, { pagoId: { in: pagoIds } }] } });
  await prisma.movimientoCartera.deleteMany({ where: { conjuntoId, OR: [{ cuotaId: { in: cuotaIds } }, { pagoId: { in: pagoIds } }] } });
  await prisma.lineaExtracto.deleteMany({ where: { conjuntoId } });
  await prisma.conciliacionBancaria.deleteMany({ where: { conjuntoId } });
  await prisma.cuentaBancaria.deleteMany({ where: { conjuntoId } });
  await prisma.pago.deleteMany({ where: { id: { in: pagoIds } } });
  await prisma.cuota.deleteMany({ where: { id: { in: cuotaIds } } });
  await prisma.cuotaExtraordinaria.deleteMany({ where: { conjuntoId } });
  await prisma.acuerdoPago.deleteMany({ where: { conjuntoId } });
  await prisma.gestionCobro.deleteMany({ where: { conjuntoId } });
  await prisma.certificadoPazYSalvo.deleteMany({ where: { conjuntoId } });
  await prisma.tasaMora.deleteMany({ where: { conjuntoId } });
}

type Perfil = { tipo: "puntual" | "tardio" | "moroso" | "cronico" | "laura" | "acuerdoA" | "acuerdoB"; pronto: boolean; k: number };

const at = (periodo: string, dia: number, hora = 10, min = 0) => new Date(`${periodo}-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}:00-05:00`);

async function sembrar(s: SeedState) {
  const { rng, now } = s;
  const ctx = await systemCtx(s.conjuntoId, { userId: s.users.administrador, nombre: "Administración" });
  const sys = await systemCtx(s.conjuntoId);
  const actual = periodoActual(now);
  const P = (m: number) => sumarMeses(actual, -m); // periodo hace m meses

  // ── Historial de tasas de mora (IBC certificado por la Superfinanciera, mora = 1,5 × IBC) ──
  await prisma.tasaMora.deleteMany({ where: { conjuntoId: s.conjuntoId } });
  const ibcs = [16.87, 16.72, 16.64, 16.51, 16.4, 16.48, 16.33];
  for (let m = 6; m >= 0; m--) {
    const ibc = ibcs[6 - m];
    const ea = tasaMaximaMora(ibc);
    await prisma.tasaMora.create({
      data: {
        conjuntoId: s.conjuntoId,
        vigenteDesde: at(P(m), 1, 0),
        tasaEfectivaAnual: Number(ea.toFixed(4)),
        tasaMensual: Number(tasaMensualDesdeEA(ea).toFixed(4)),
        fuente: `Superintendencia Financiera · IBC ${ibc.toFixed(2).replace(".", ",")} % E.A.`,
        createdAt: at(P(m), 1, 9),
      },
    });
  }
  const ultima = tasaMaximaMora(ibcs[6]);
  const conj = await prisma.conjunto.findUniqueOrThrow({ where: { id: s.conjuntoId } });
  const cfgRaw = (conj.config ?? {}) as Record<string, unknown>;
  await prisma.conjunto.update({
    where: { id: s.conjuntoId },
    data: { config: { ...cfgRaw, cartera: { ...((cfgRaw.cartera as object) ?? {}), diaGeneracion: 1, tasaMoraEA: Number(ultima.toFixed(4)), tasaMoraMensual: Number(tasaMensualDesdeEA(ultima).toFixed(4)), tasaMoraVigenteDesde: at(actual, 1, 0).toISOString() } } as object },
  });
  ctx.conjunto.config = (await prisma.conjunto.findUniqueOrThrow({ where: { id: s.conjuntoId } })).config;
  sys.conjunto.config = ctx.conjunto.config;

  // ── Cuenta bancaria de recaudo ──
  const cuenta = await prisma.cuentaBancaria.create({
    data: { conjuntoId: s.conjuntoId, banco: "Bancolombia", tipo: "AHORROS", numero: "12345678901", titular: "Conjunto Residencial Demo P.H.", convenio: "84521" },
  });
  await prisma.cuentaBancaria.create({ data: { conjuntoId: s.conjuntoId, banco: "Banco de Bogotá", tipo: "CORRIENTE", numero: "009876543", titular: "Conjunto Residencial Demo P.H." } });

  // ── Perfiles de pago ──
  const unidades = await prisma.unidad.findMany({ where: { conjuntoId: s.conjuntoId, deletedAt: null }, orderBy: { codigo: "asc" } });
  const perfiles = new Map<string, Perfil>();
  const fijos: Record<string, Perfil> = {
    "T1-101": { tipo: "laura", pronto: true, k: 0 },
    "T3-804": { tipo: "puntual", pronto: true, k: 0 },
    "T2-302": { tipo: "puntual", pronto: true, k: 0 },
  };
  const libres = rng.shuffle(unidades.filter((u) => !fijos[u.codigo]).map((u) => u.id));
  const asignar = (n: number, p: () => Perfil) => libres.splice(0, n).forEach((id) => perfiles.set(id, p()));
  asignar(2, () => ({ tipo: "cronico", pronto: false, k: 6 }));
  asignar(1, () => ({ tipo: "acuerdoA", pronto: false, k: 4 }));
  asignar(1, () => ({ tipo: "acuerdoB", pronto: false, k: 5 }));
  const ks = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5];
  asignar(ks.length, () => ({ tipo: "moroso", pronto: false, k: ks.shift()! }));
  asignar(10, () => ({ tipo: "tardio", pronto: false, k: 0 }));
  for (const id of libres) perfiles.set(id, { tipo: "puntual", pronto: rng.chance(0.45), k: 0 });
  for (const u of unidades) if (fijos[u.codigo]) perfiles.set(u.id, fijos[u.codigo]);
  const porId = new Map(unidades.map((u) => [u.id, u]));

  // Saldos de apertura (antes de los 6 meses) para las unidades crónicas.
  for (const [id, p] of perfiles) {
    if (p.tipo !== "cronico") continue;
    const u = porId.get(id)!;
    await crearCargo(ctx, {
      unidadId: id,
      conceptoTipo: "ADMINISTRACION",
      valorBase: round(toNumber(u.cuotaAdministracion) * rng.int(2, 3)),
      periodo: P(6),
      fechaEmision: at(P(6), 1, 0),
      fechaVencimiento: at(P(6), 10, 0),
      origen: "APERTURA",
      descripcion: "Saldo de apertura (cartera anterior a MiConjunto)",
    });
  }

  const medios: MedioPago[] = ["TRANSFERENCIA", "TRANSFERENCIA", "PSE", "CONSIGNACION", "EFECTIVO", "NEQUI", "PSE"];
  const pagosTransfer: { id: string; valor: number; fecha: Date; referencia: string }[] = [];

  /** Paga todas las cuotas exigibles hasta el periodo dado (con descuento de pronto pago si aplica). */
  const pagarAlDia = async (unidadId: string, periodo: string, fecha: Date, opts?: { pronto?: boolean; menos?: number; medio?: MedioPago }) => {
    if (fecha > now) return;
    const sal = await saldoUnidad(ctx, unidadId, fecha);
    const exigibles = sal.cuotas.filter((c) => c.periodo <= periodo || c.fechaVencimiento <= fecha);
    if (!exigibles.length) return;
    let valor = exigibles.reduce((a, c) => a + c.saldo, 0);
    if (opts?.pronto) {
      const adm = exigibles.find((c) => c.tipo === "ADMINISTRACION" && c.periodo === periodo && c.fechaProntoPago && fecha <= c.fechaProntoPago && c.saldo === c.valorTotal);
      if (adm) valor -= round((adm.valorBase * adm.porcentajeProntoPago) / 100);
    }
    valor = round(valor - (opts?.menos ?? 0));
    if (valor <= 0) return;
    const medio = opts?.medio ?? rng.pick(medios);
    const online = medio === "PSE" || medio === "NEQUI";
    const p = await registrarPago(ctx, {
      unidadId,
      valor,
      fecha,
      medio,
      pasarela: online ? "SIMULADOR" : "NINGUNA",
      referenciaExterna: online ? `SIM-${rng.int(100000, 999999)}` : medio === "TRANSFERENCIA" ? `TRF${rng.int(10000000, 99999999)}` : null,
      cuotasSeleccionadas: exigibles.map((c) => c.id),
      observaciones: online ? "Pago en línea" : null,
    });
    if (medio === "TRANSFERENCIA" || medio === "CONSIGNACION") pagosTransfer.push({ id: p.id, valor, fecha, referencia: p.referencia });
  };

  // ── Simulación mes a mes ──
  for (let m = 5; m >= 0; m--) {
    const per = P(m);
    await generarCuotasMes(sys, per);

    // Cuotas extraordinarias aprobadas en asamblea.
    if (m === 3) {
      await crearCuotaExtraordinaria(
        sys,
        { nombre: "Impermeabilización de cubiertas", motivo: "Aprobada en la asamblea ordinaria para reparar filtraciones de las torres 1 a 3.", valorTotal: 34_800_000, distribucion: "POR_COEFICIENTE", numeroCuotas: 3, primerPeriodo: per, diaVencimiento: 10 },
        at(per, 1, 8),
      );
    }
    if (m === 1) {
      await crearCuotaExtraordinaria(
        sys,
        { nombre: "Cambio de bombas de agua", motivo: "Reposición de las motobombas del tanque principal (asamblea extraordinaria).", valorTotal: 116 * 120_000, distribucion: "IGUAL_POR_UNIDAD", numeroCuotas: 1, primerPeriodo: per, diaVencimiento: 10 },
        at(per, 1, 8),
      );
    }

    // Pagos puntuales (del 1 al 10; con pronto pago hasta el 5).
    for (const [id, p] of perfiles) {
      const puntualEsteMes = p.tipo === "puntual" || (p.tipo === "laura" && m >= 2) || ((p.tipo === "moroso" || p.tipo === "acuerdoA" || p.tipo === "acuerdoB") && m >= p.k);
      if (!puntualEsteMes) continue;
      const pronto = p.pronto && (p.tipo !== "moroso" || rng.chance(0.3));
      const dia = pronto ? rng.int(1, 5) : rng.int(3, 10);
      await pagarAlDia(id, per, at(per, dia, rng.int(8, 19), rng.int(0, 59)), { pronto, medio: p.tipo === "laura" ? "PSE" : undefined });
    }
    // Laura: el mes anterior pagó casi todo (queda un saldo pequeño); el mes actual está pendiente.
    if (m === 1) {
      for (const [id, p] of perfiles) if (p.tipo === "laura") await pagarAlDia(id, per, at(per, 8, 20, 15), { menos: 42_500, medio: "PSE" });
    }

    // Liquidación de intereses a mitad de mes (antes de que paguen los tardíos).
    if (at(per, 13, 1) <= now) await liquidarInteresesMora(sys, at(per, 13, 1));

    // Tardíos: pagan después del vencimiento, con intereses.
    for (const [id, p] of perfiles) {
      if (p.tipo === "tardio") await pagarAlDia(id, per, at(per, rng.int(14, 26), rng.int(8, 18)));
      // Morosos: algunos abonos parciales esporádicos.
      if ((p.tipo === "moroso" || p.tipo === "cronico") && m < p.k && rng.chance(0.2)) {
        const f = at(per, rng.int(15, 25), 11);
        if (f <= now) await registrarPago(ctx, { unidadId: id, valor: rng.pick([100_000, 150_000, 200_000]), fecha: f, medio: "CONSIGNACION", observaciones: "Abono parcial" });
      }
    }

    // Acuerdos de pago.
    if (m === 3) {
      for (const [id, p] of perfiles) if (p.tipo === "acuerdoB") await crearAcuerdo(ctx, { unidadId: id, numeroCuotas: 4, diaPago: 15, observaciones: "Acuerdo firmado en la administración." }, at(per, 20, 11));
    }
    if (m === 2) {
      // El acuerdo B paga solo la primera cuota (junto con la cuota del mes) y luego incumple.
      for (const [id, p] of perfiles) if (p.tipo === "acuerdoB") await pagarAlDia(id, per, at(per, 14, 12), { medio: "CONSIGNACION" });
    }
    if (m === 1) {
      for (const [id, p] of perfiles) if (p.tipo === "acuerdoA") await crearAcuerdo(ctx, { unidadId: id, numeroCuotas: 6, diaPago: 15, observaciones: "Propietario solicitó acuerdo tras la carta de cobro." }, at(per, 20, 11));
    }
    if (m === 0) {
      for (const [id, p] of perfiles) if (p.tipo === "acuerdoA") await pagarAlDia(id, per, at(per, 14, 12), { medio: "TRANSFERENCIA" });
    }

    // Liquidación de fin de mes.
    const finMes = at(per, 28, 1);
    await liquidarInteresesMora(sys, finMes <= now ? finMes : now);
  }
  await seguimientoAcuerdos(sys, now);

  // ── Gestiones de cobro (Ley 2300: días y horas hábiles, una por semana y canal) ──
  const canales = ["LLAMADA", "CORREO", "WHATSAPP", "CARTA", "VISITA"] as const;
  const resultados = ["Promete pagar la próxima semana", "No contestó", "Solicita acuerdo de pago", "Dejó mensaje con la empleada", "Informa que está sin empleo", "Envió soporte de abono"];
  const semanaActual = semanaCalendario(now);
  for (const [id, p] of perfiles) {
    if (!["moroso", "cronico", "acuerdoA", "acuerdoB"].includes(p.tipo) || p.k < 2) continue;
    const n = p.tipo === "cronico" ? 5 : rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const dias = 7 * (i + 1) + rng.int(0, 4);
      let f = new Date(now.getTime() - dias * 86_400_000);
      f = new Date(`${f.toISOString().slice(0, 10)}T${String(rng.int(9, 17)).padStart(2, "0")}:15:00-05:00`);
      if (!horarioCobranzaPermitido(f).ok || f >= semanaActual.desde) continue;
      await registrarGestion(ctx, { unidadId: id, canal: canales[i % canales.length], resultado: rng.pick(resultados) }, f).catch(() => undefined);
    }
  }
  // Una gestión esta semana (para mostrar el bloqueo por frecuencia).
  const cronico = [...perfiles].find(([, p]) => p.tipo === "cronico")?.[0];
  if (cronico) {
    let f = new Date(Math.max(semanaActual.desde.getTime() + 10 * 3_600_000, now.getTime() - 26 * 3_600_000));
    for (let i = 0; i < 12 && (!horarioCobranzaPermitido(f).ok || f > now); i++) f = new Date(f.getTime() + 3_600_000);
    if (horarioCobranzaPermitido(f).ok && f <= now) await registrarGestion(ctx, { unidadId: cronico, canal: "LLAMADA", resultado: "No contestó; se dejó mensaje de voz" }, f).catch(() => undefined);
  }

  // ── Paz y salvos ──
  const alDia = [...perfiles].filter(([, p]) => p.tipo === "puntual").map(([id]) => id);
  for (const id of [...alDia.slice(0, 6), ...unidades.filter((u) => u.codigo === "T3-804").map((u) => u.id)]) await solicitarPazYSalvo(ctx, id);
  const conPaz = alDia[7];
  if (conPaz) {
    await prisma.certificadoPazYSalvo.create({
      data: { conjuntoId: s.conjuntoId, unidadId: conPaz, personaNombre: "Propietario", fecha: new Date(now.getTime() - 75 * 86_400_000), vigenteHasta: new Date(now.getTime() - 45 * 86_400_000), codigo: codigoVerificacion(), estado: "VENCIDO", automatico: true },
    });
  }
  const acuerdoA = [...perfiles].find(([, p]) => p.tipo === "acuerdoA")?.[0];
  if (acuerdoA) await emitirPazYSalvoManual(ctx, { unidadId: acuerdoA, observaciones: "Emitido para trámite de crédito hipotecario: la unidad tiene un acuerdo de pago vigente y al día." }).catch(() => undefined);

  // ── Conciliación bancaria del mes anterior ──
  const perAnt = P(1);
  const delMes = pagosTransfer.filter((p) => p.fecha >= at(perAnt, 1, 0) && p.fecha < at(actual, 1, 0)).slice(0, 14);
  if (delMes.length) {
    const conc = await prisma.conciliacionBancaria.create({ data: { conjuntoId: s.conjuntoId, cuentaId: cuenta.id, archivoNombre: `extracto-bancolombia-${perAnt}.csv`, periodo: perAnt, creadoPorId: s.users.contador ?? s.users.administrador } });
    const lineas: { fecha: Date; descripcion: string; referencia: string | null; valor: number }[] = delMes.map((p, i) => ({
      fecha: new Date(p.fecha.getTime() + (i % 2) * 86_400_000),
      descripcion: i % 3 === 0 ? `ABONO TRANSFERENCIA ${p.referencia}` : "CONSIGNACION NACIONAL",
      referencia: i % 3 === 0 ? null : p.referencia,
      valor: p.valor,
    }));
    // Consignación con la referencia de pago de una cuota (sin pago registrado): queda sugerida.
    const morosoRef = [...perfiles].find(([, p]) => p.tipo === "moroso" && p.k >= 2)?.[0];
    if (morosoRef) {
      const c = await prisma.cuota.findFirst({ where: { unidadId: morosoRef, estado: "PENDIENTE", concepto: { tipo: "ADMINISTRACION" } }, orderBy: { fechaVencimiento: "asc" } });
      if (c) lineas.push({ fecha: at(perAnt, 22, 12), descripcion: "CONSIGNACION CORRESPONSAL", referencia: c.referenciaPago, valor: toNumber(c.saldo) });
    }
    lineas.push({ fecha: at(perAnt, 25, 12), descripcion: "ABONO ACH SIN REFERENCIA", referencia: null, valor: 187_300 });
    lineas.push({ fecha: at(perAnt, 28, 12), descripcion: "RENDIMIENTOS FINANCIEROS", referencia: null, valor: 12_845 });
    await prisma.lineaExtracto.createMany({ data: lineas.map((l) => ({ conjuntoId: s.conjuntoId, conciliacionId: conc.id, ...l })) });
    await prisma.conciliacionBancaria.update({ where: { id: conc.id }, data: { totalLineas: lineas.length } });
    await emparejarAutomatico(ctx, conc.id);
  }
}
