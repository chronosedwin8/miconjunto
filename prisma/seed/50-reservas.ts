import { systemCtx } from "@/lib/auth/system-ctx";
import { anularCargo, crearCargo, registrarPago } from "@/lib/cartera/core";
import { toNumber } from "@/lib/format";
import { checklistActa, diaSemana, fechaHoraBogota, fechaLocal, festivosColombia, haySolape, hhmm, horarioDia, sumarDias, valoresReserva, type HorarioZona, type Intervalo } from "@/lib/reservas/reglas";
import { bloquearFestivos } from "@/lib/reservas/service";
import { encolarFacturaReserva, opcionesCola, procesarFactura } from "@/lib/facturacion/service";
import { sincronizarTablasReferencia } from "@/lib/facturacion/referencia";
import { prisma, type SeedState } from "./util";

/**
 * Reservas de zonas comunes (demo): 60 reservas sin traslapes (pasadas cumplidas, canceladas y no-show;
 * futuras aprobadas y solicitadas), salón y BBQ con cuota + pago + factura electrónica simulada VALIDADA,
 * bloqueos (mantenimiento de piscina, festivos, evento), reglas extra, calificaciones y actas.
 * Deja a Laura (T1-101) con una reserva futura del salón SOLICITADA pendiente de pago.
 *
 * Se llama 50-… (no 40-…) porque debe correr después de 45-pagos: ese módulo solo crea las cuotas demo de
 * Laura si su saldo está en cero, y aquí se reemplaza su cargo "Alquiler salón (reserva)" suelto por una
 * reserva real enlazada.
 */
export async function seedReservas(s: SeedState) {
  const g = globalThis as unknown as { __mcSubsLoaded?: boolean };
  const antes = g.__mcSubsLoaded;
  g.__mcSubsLoaded = true; // sin suscriptores de eventos en el seed (se enlaza todo explícitamente)
  opcionesCola.segundoPlano = false;
  opcionesCola.enviarCorreo = false;
  try {
    await sembrar(s);
  } finally {
    g.__mcSubsLoaded = antes;
    opcionesCola.segundoPlano = true;
    opcionesCola.enviarCorreo = true;
  }
}

type Zona = Awaited<ReturnType<typeof prisma.zonaComun.findMany>>[number];
type Spec = { zona: string; offset: number; estado: "CUMPLIDA" | "NO_SHOW" | "CANCELADA" | "APROBADA" | "SOLICITADA"; pagada?: boolean; unidad?: string };

const MOTIVOS: Record<string, string[]> = {
  SALON: ["Cumpleaños", "Primera comunión", "Reunión familiar", "Baby shower", "Grado", "Aniversario"],
  BBQ: ["Asado familiar", "Reunión con amigos", "Cumpleaños", "Partido de fútbol"],
  PISCINA: ["Tarde en familia", "Clase de natación", ""],
  GIMNASIO: ["Entrenamiento", ""],
  CANCHA: ["Microfútbol", "Baloncesto", "Partido con vecinos"],
  SALA_JUNTAS: ["Comité de convivencia", "Reunión de copropietarios de la torre 2", "Reunión de trabajo"],
  COWORKING: ["Trabajo remoto", "Reunión virtual", ""],
};
const COMENTARIOS = ["Todo muy limpio, gracias.", "Excelente atención de portería.", "Faltaba una silla, pero bien.", "El sonido no funcionaba bien.", "Muy buen espacio.", ""];

/** Idempotencia (`npx tsx scripts/seed-uno.ts 50-reservas`): borra las filas propias del módulo en el conjunto. */
async function limpiar(conjuntoId: string) {
  const reservas = await prisma.reserva.findMany({ where: { conjuntoId }, select: { id: true, cuotaId: true, pagoId: true } });
  if (!reservas.length && !(await prisma.bloqueoZona.count({ where: { conjuntoId } }))) return;
  const ids = reservas.map((r) => r.id);
  const principales = reservas.map((r) => r.cuotaId).filter(Boolean) as string[];
  const hijas = await prisma.cuota.findMany({ where: { conjuntoId, cuotaOrigenId: { in: principales }, origen: "RESERVA" }, select: { id: true } });
  const cuotaIds = [...principales, ...hijas.map((c) => c.id)];
  const pagos = await prisma.pago.findMany({ where: { conjuntoId, OR: [{ reservaId: { in: ids } }, { id: { in: reservas.map((r) => r.pagoId).filter(Boolean) as string[] } }] }, select: { id: true } });
  const pagoIds = pagos.map((p) => p.id);
  const facturas = await prisma.facturaElectronica.findMany({ where: { conjuntoId, reservaId: { in: ids } }, select: { id: true } });
  await prisma.adjunto.deleteMany({ where: { conjuntoId, OR: [{ entidad: "FacturaElectronica", entidadId: { in: facturas.map((f) => f.id) } }, { entidad: "Pago", entidadId: { in: pagoIds } }] } });
  await prisma.facturaElectronica.deleteMany({ where: { id: { in: facturas.map((f) => f.id) } } });
  await prisma.aplicacionPago.deleteMany({ where: { OR: [{ pagoId: { in: pagoIds } }, { cuotaId: { in: cuotaIds } }] } });
  await prisma.movimientoCartera.deleteMany({ where: { conjuntoId, OR: [{ pagoId: { in: pagoIds } }, { cuotaId: { in: cuotaIds } }] } });
  await prisma.pago.deleteMany({ where: { id: { in: pagoIds } } });
  await prisma.reserva.deleteMany({ where: { id: { in: ids } } });
  await prisma.cuota.deleteMany({ where: { id: { in: cuotaIds } } });
  await prisma.bloqueoZona.deleteMany({ where: { conjuntoId } });
  await prisma.reglaReserva.deleteMany({ where: { conjuntoId } });
}

async function sembrar(s: SeedState) {
  const { conjuntoId, rng, now } = s;
  await limpiar(conjuntoId);
  await sincronizarTablasReferencia(prisma);
  const ctx = await systemCtx(conjuntoId, { userId: s.users.administrador, nombre: "Administración" });
  const zonasArr = await prisma.zonaComun.findMany({ where: { conjuntoId, reservable: true, deletedAt: null } });
  const zona = (cat: string) => zonasArr.find((z) => z.categoria === cat);
  const salon = zona("SALON");
  if (!salon) return;

  // Unidades con persona responsable (para facturar a nombre de alguien real)
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId, estado: "ACTIVO", deletedAt: null, tipo: { in: ["PROPIETARIO", "ARRENDATARIO"] } },
    include: { unidad: { select: { id: true, codigo: true } }, persona: { select: { id: true, usuarioId: true } } },
    orderBy: { principal: "desc" },
  });
  const porUnidad = new Map<string, { unidadId: string; codigo: string; personaId: string; usuarioId: string | null }>();
  for (const v of vinculos) if (!porUnidad.has(v.unidad.codigo)) porUnidad.set(v.unidad.codigo, { unidadId: v.unidad.id, codigo: v.unidad.codigo, personaId: v.persona.id, usuarioId: v.persona.usuarioId });
  const codigos = [...porUnidad.keys()];
  const quien = (pref?: string) => porUnidad.get(pref ?? "") ?? porUnidad.get(rng.chance(0.2) ? "T1-101" : rng.chance(0.12) ? "T2-302" : rng.pick(codigos))!;
  if (!codigos.length) return;

  // Reglas extra
  const bbq = zona("BBQ");
  const sala = zona("SALA_JUNTAS");
  if (bbq) await prisma.reglaReserva.create({ data: { conjuntoId, zonaId: bbq.id, tipo: "UN_TURNO_POR_DIA", valor: {}, descripcion: "Un turno por día por unidad" } });
  if (sala) await prisma.reglaReserva.create({ data: { conjuntoId, zonaId: sala.id, tipo: "DIAS_PERMITIDOS", valor: { dias: [1, 2, 3, 4, 5, 6] }, descripcion: "De lunes a sábado" } });

  // Bloqueos: mantenimiento de piscina, festivos del salón y un evento del conjunto en la cancha
  const hoy = fechaLocal(now);
  const ocupacion = new Map<string, Intervalo[]>();
  const ocupar = (zonaId: string, i: Intervalo) => ocupacion.set(zonaId, [...(ocupacion.get(zonaId) ?? []), i]);
  const piscina = zona("PISCINA");
  if (piscina) {
    const martes = sumarDias(hoy, ((2 - diaSemana(hoy) + 7) % 7) + 7);
    const b = { inicio: fechaHoraBogota(martes), fin: fechaHoraBogota(sumarDias(martes, 2)) };
    await prisma.bloqueoZona.create({ data: { conjuntoId, zonaId: piscina.id, ...b, motivo: "Mantenimiento preventivo y tratamiento del agua", tipo: "MANTENIMIENTO" } });
    ocupar(piscina.id, b);
  }
  const anio = Number(hoy.slice(0, 4));
  const proximos = [...festivosColombia(anio), ...festivosColombia(anio + 1)].filter((f) => f.fecha > hoy).slice(0, 3);
  await bloquearFestivos(ctx, [salon.id], anio, proximos);
  for (const f of proximos) ocupar(salon.id, { inicio: fechaHoraBogota(f.fecha), fin: fechaHoraBogota(sumarDias(f.fecha, 1)) });
  const cancha = zona("CANCHA");
  if (cancha) {
    const sab = sumarDias(hoy, ((6 - diaSemana(hoy) + 7) % 7) + 14);
    const b = { inicio: fechaHoraBogota(sab, "08:00"), fin: fechaHoraBogota(sab, "14:00") };
    await prisma.bloqueoZona.create({ data: { conjuntoId, zonaId: cancha.id, ...b, motivo: "Torneo de microfútbol del conjunto", tipo: "EVENTO" } });
    ocupar(cancha.id, b);
  }

  // Cargo suelto de alquiler creado por 45-pagos para Laura: se reemplaza por una reserva real enlazada.
  const laura = porUnidad.get("T1-101");
  if (laura) {
    const sueltos = await prisma.cuota.findMany({ where: { conjuntoId, unidadId: laura.unidadId, origen: "RESERVA", estado: "PENDIENTE", deletedAt: null } });
    for (const c of sueltos) {
      const enlazada = await prisma.reserva.findFirst({ where: { cuotaId: c.id } });
      if (!enlazada) await anularCargo(ctx, c.id, "Reemplazado por la reserva del salón").catch(() => undefined);
    }
  }

  // Busca una franja libre de la zona cerca del día pedido
  const franja = (z: Zona, offset: number) => {
    for (let intento = 0; intento < 40; intento++) {
      const f = sumarDias(hoy, offset + (intento % 2 ? 1 : -1) * Math.floor(intento / 2) * (offset < 0 ? 1 : 1));
      if ((offset < 0 && f >= hoy) || (offset > 0 && f <= hoy)) continue;
      const h = horarioDia(z.horario as HorarioZona, diaSemana(f));
      if (!h) continue;
      const dur = z.duracionMinimaMin + (rng.chance(0.4) && z.duracionMinimaMin + 60 <= z.duracionMaximaMin ? 60 : 0);
      const ultima = h.cierra - dur;
      if (ultima < h.abre) continue;
      const iniMin = h.abre + 60 * rng.int(0, Math.floor((ultima - h.abre) / 60));
      const inicio = fechaHoraBogota(f, hhmm(iniMin));
      const fin = new Date(inicio.getTime() + dur * 60_000);
      if ((ocupacion.get(z.id) ?? []).some((o) => haySolape(o, { inicio, fin }))) continue;
      ocupar(z.id, { inicio, fin });
      return { inicio, fin };
    }
    return null;
  };

  const medios = ["PSE", "NEQUI", "TARJETA", "TRANSFERENCIA", "BANCOLOMBIA_QR"] as const;
  let creadas = 0;
  let facturas = 0;

  const crear = async (z: Zona, sp: Spec, fijo?: { inicio: Date; fin: Date }) => {
    const slot = fijo ?? franja(z, sp.offset);
    if (!slot) return null;
    const u = quien(sp.unidad);
    const v = valoresReserva({ tarifa: toNumber(z.tarifa), gravaIva: z.gravaIva, tarifaIva: toNumber(z.tarifaIva), deposito: toNumber(z.deposito) });
    const pasada = slot.fin < now;
    const creadaEn = new Date(Math.min(now.getTime() - 3600_000, slot.inicio.getTime() - rng.int(3, 15) * 86_400_000));
    const asistentes = Math.max(1, Math.min(z.capacidad ?? 10, rng.int(1, Math.max(2, Math.round((z.capacidad ?? 10) * 0.6)))));
    const motivo = rng.pick(MOTIVOS[z.categoria] ?? [""]) || null;
    const r = await prisma.reserva.create({
      data: {
        conjuntoId,
        zonaId: z.id,
        unidadId: u.unidadId,
        personaId: u.personaId,
        usuarioId: u.usuarioId,
        inicio: slot.inicio,
        fin: slot.fin,
        asistentes,
        motivo,
        estado: sp.estado,
        valor: v.base,
        iva: v.iva,
        deposito: v.deposito,
        pagada: v.totalAPagar === 0,
        aprobadaPorId: sp.estado === "SOLICITADA" ? null : z.requiereAprobacion ? s.users.administrador : "automatica",
        createdAt: creadaEn,
      },
    });
    creadas++;
    // Cobro (salón y BBQ)
    if (v.totalAPagar > 0) {
      const cuando = `${slot.inicio.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })} ${slot.inicio.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false })}`;
      const cuotaIds: string[] = [];
      let principal: string | null = null;
      if (v.base > 0) {
        const c = await crearCargo(ctx, { unidadId: u.unidadId, conceptoTipo: "ALQUILER_ZONA", valorBase: v.base, iva: v.iva, descripcion: `Alquiler ${z.nombre} — ${cuando}`, fechaEmision: creadaEn, fechaVencimiento: slot.inicio, origen: "RESERVA" });
        principal = c.id;
        cuotaIds.push(c.id);
      }
      if (v.deposito > 0) {
        const d = await crearCargo(ctx, { unidadId: u.unidadId, conceptoTipo: "OTRO", valorBase: v.deposito, descripcion: `Depósito ${z.nombre} — ${cuando} (reembolsable)`, fechaEmision: creadaEn, fechaVencimiento: slot.inicio, origen: "RESERVA", cuotaOrigenId: principal });
        principal ??= d.id;
        cuotaIds.push(d.id);
      }
      await prisma.reserva.update({ where: { id: r.id }, data: { cuotaId: principal } });
      const pagar = sp.pagada ?? ["CUMPLIDA", "NO_SHOW", "APROBADA"].includes(sp.estado);
      if (sp.estado === "CANCELADA" && !pagar) {
        for (const id of cuotaIds) await anularCargo(ctx, id, "Reserva cancelada por el residente");
      } else if (pagar) {
        const fechaPago = new Date(Math.min(now.getTime() - 1800_000, creadaEn.getTime() + rng.int(1, 36) * 3600_000));
        const pago = await registrarPago(ctx, { unidadId: u.unidadId, valor: v.totalAPagar, fecha: fechaPago, medio: rng.pick(medios), pasarela: "SIMULADOR", referenciaExterna: `SIM-RES-${r.id.slice(-6).toUpperCase()}`, cuotasSeleccionadas: cuotaIds, reservaId: r.id, observaciones: `Pago reserva ${z.nombre}` });
        await prisma.reserva.update({ where: { id: r.id }, data: { pagada: true, pagoId: pago.id } });
        if (z.generaFactura && v.base > 0) {
          const f = await encolarFacturaReserva(conjuntoId, r.id, pago.id);
          if (f) {
            const ok = await procesarFactura(f.id);
            if (ok?.estado === "VALIDADA") {
              await prisma.facturaElectronica.update({ where: { id: f.id }, data: { validadaEn: new Date(fechaPago.getTime() + 5 * 60_000), createdAt: fechaPago } });
              facturas++;
            }
          }
        }
      }
    }
    // Actas, calificación y cancelaciones
    if (sp.estado === "CUMPLIDA" && pasada) {
      const items = checklistActa(z.categoria);
      const porteria = s.users.porteria ?? null;
      const conActa = v.totalAPagar > 0 || rng.chance(0.3);
      const danos = conActa && rng.chance(0.12);
      await prisma.reserva.update({
        where: { id: r.id },
        data: {
          ...(conActa
            ? {
                checkInEn: new Date(slot.inicio.getTime() - 15 * 60_000),
                checkInPorId: porteria,
                checkOutEn: new Date(slot.fin.getTime() + 20 * 60_000),
                checkOutPorId: porteria,
                actaEntrega: { fecha: new Date(slot.inicio.getTime() - 15 * 60_000).toISOString(), porId: porteria, porNombre: "Portería", checklist: Object.fromEntries(items.map((i) => [i, true])), observaciones: "Zona entregada en buen estado.", fotos: [] },
                actaRecepcion: {
                  fecha: new Date(slot.fin.getTime() + 20 * 60_000).toISOString(),
                  porId: porteria,
                  porNombre: "Portería",
                  checklist: Object.fromEntries(items.map((i, k) => [i, !(danos && k === 2)])),
                  observaciones: danos ? "Se encontró un daño menor." : "Recibida sin novedades.",
                  fotos: [],
                  danos,
                  descripcionDano: danos ? "Silla plástica rota" : null,
                  ticketId: null,
                  multaId: null,
                },
              }
            : {}),
          ...(rng.chance(0.7) ? { calificacion: rng.pick([5, 5, 5, 4, 4, 3]), comentarioCalificacion: rng.pick(COMENTARIOS) || null } : {}),
        },
      });
    }
    if (sp.estado === "CANCELADA") {
      await prisma.reserva.update({ where: { id: r.id }, data: { canceladaEn: new Date(slot.inicio.getTime() - rng.int(2, 6) * 86_400_000), motivoCancelacion: rng.pick(["Cancelada por el residente. Cambio de planes.", "Cancelada por el residente. Viaje imprevisto.", "Cancelada por el residente. Clima."]) } });
    }
    return r;
  };

  // 1) Demo: reserva futura del salón de Laura SOLICITADA y pendiente de pago (sábado ≥ 5 días)
  if (laura) {
    let sab = sumarDias(hoy, ((6 - diaSemana(hoy) + 7) % 7) || 7);
    while (sab < sumarDias(hoy, 5) || proximos.some((f) => f.fecha === sab)) sab = sumarDias(sab, 7);
    const slot = { inicio: fechaHoraBogota(sab, "18:00"), fin: fechaHoraBogota(sab, "23:00") };
    ocupar(salon.id, slot);
    await crear(salon, { zona: "SALON", offset: 0, estado: "SOLICITADA", pagada: false, unidad: "T1-101" }, slot);
  }

  // 2) Plan de 59 reservas más (35 pasadas + 24 futuras)
  const plan: Spec[] = [];
  const add = (zonaCat: string, n: number, desde: number, hasta: number, estados: Spec["estado"][]) => {
    for (let i = 0; i < n; i++) plan.push({ zona: zonaCat, offset: rng.int(desde, hasta), estado: estados[i % estados.length] });
  };
  add("SALON", 6, -60, -2, ["CUMPLIDA", "CUMPLIDA", "NO_SHOW", "CUMPLIDA", "CANCELADA", "CUMPLIDA"]);
  add("BBQ", 7, -60, -2, ["CUMPLIDA", "CUMPLIDA", "CANCELADA", "CUMPLIDA", "NO_SHOW", "CUMPLIDA", "CUMPLIDA"]);
  add("PISCINA", 6, -45, -1, ["CUMPLIDA", "CUMPLIDA", "CUMPLIDA", "CANCELADA", "CUMPLIDA", "CUMPLIDA"]);
  add("GIMNASIO", 5, -30, -1, ["CUMPLIDA"]);
  add("CANCHA", 5, -40, -1, ["CUMPLIDA", "NO_SHOW", "CUMPLIDA", "CANCELADA", "CUMPLIDA"]);
  add("SALA_JUNTAS", 3, -40, -1, ["CUMPLIDA"]);
  add("COWORKING", 3, -20, -1, ["CUMPLIDA"]);
  add("SALON", 3, 4, 40, ["APROBADA", "APROBADA", "SOLICITADA"]);
  add("BBQ", 5, 2, 35, ["APROBADA", "APROBADA", "SOLICITADA", "APROBADA", "APROBADA"]);
  add("PISCINA", 4, 1, 20, ["APROBADA"]);
  add("GIMNASIO", 3, 1, 10, ["APROBADA"]);
  add("CANCHA", 3, 1, 25, ["APROBADA"]);
  add("SALA_JUNTAS", 3, 2, 20, ["SOLICITADA", "APROBADA", "SOLICITADA"]);
  add("COWORKING", 2, 1, 12, ["APROBADA"]);
  for (const sp of plan) {
    const z = zona(sp.zona);
    if (!z) continue;
    // Salón SOLICITADA futura: pagada y a la espera de aprobación (para la bandeja del administrador)
    if (sp.zona === "SALON" && sp.estado === "SOLICITADA") sp.pagada = true;
    await crear(z, sp);
  }
  // Una reserva de hoy aprobada para la pantalla de portería (si el gimnasio abre)
  const gym = zona("GIMNASIO");
  if (gym) {
    const h = horarioDia(gym.horario as HorarioZona, diaSemana(hoy));
    const ahoraMin = Math.ceil((now.getTime() - fechaHoraBogota(hoy).getTime()) / 3600_000) * 60;
    if (h && ahoraMin + gym.duracionMinimaMin <= h.cierra) {
      const inicio = fechaHoraBogota(hoy, hhmm(Math.max(h.abre, ahoraMin)));
      const fin = new Date(inicio.getTime() + gym.duracionMinimaMin * 60_000);
      if (!(ocupacion.get(gym.id) ?? []).some((o) => haySolape(o, { inicio, fin }))) {
        ocupar(gym.id, { inicio, fin });
        await crear(gym, { zona: "GIMNASIO", offset: 0, estado: "APROBADA" }, { inicio, fin });
      }
    }
  }
  console.log(`   ${creadas} reservas, ${facturas} facturas electrónicas simuladas`);
}
