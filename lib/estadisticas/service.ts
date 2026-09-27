import { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { edad, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { rangoMora, RANGO_LABEL, RANGOS_MORA } from "@/lib/cartera/calculos";

/**
 * Estadísticas (§5.15). Filtros: rango de fechas, torre y comparación con el periodo anterior.
 * Las series temporales se agrupan en hora de Bogotá con SQL; el resto con agregaciones de Prisma.
 */
export type Filtro = { desde: Date; hasta: Date; torreId?: string | null };

const TZ = "America/Bogota";
const n = (v: unknown) => toNumber(v as number);
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1((a / b) * 100) : 0);

export function periodoAnterior(f: Filtro): Filtro {
  const d = f.hasta.getTime() - f.desde.getTime();
  return { ...f, desde: new Date(f.desde.getTime() - d), hasta: new Date(f.desde.getTime() - 1) };
}

function unidadWhere(f: Filtro) {
  return f.torreId ? { unidad: { torreId: f.torreId === "casas" ? null : f.torreId } } : {};
}
function torreSql(f: Filtro, alias = "u") {
  if (!f.torreId) return Prisma.empty;
  return f.torreId === "casas" ? Prisma.sql` AND ${Prisma.raw(alias)}."torreId" IS NULL` : Prisma.sql` AND ${Prisma.raw(alias)}."torreId" = ${f.torreId}`;
}
const mesLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][Number(mm) - 1]} ${y.slice(2)}`;
};

// ───────────────────────── CARTERA ─────────────────────────
export async function statsCartera(ctx: Ctx, f: Filtro, verNombres: boolean) {
  const cid = ctx.conjuntoId;
  const [facturado, recaudado, porMedio, pendientes, descuentos, intereses, campanas, totalUnidades] = await Promise.all([
    prisma.$queryRaw<{ mes: string; valor: number }[]>`
      SELECT c.periodo AS mes, SUM(c."valorBase" + c.iva)::float AS valor FROM "Cuota" c JOIN "Unidad" u ON u.id = c."unidadId"
      WHERE c."conjuntoId" = ${cid} AND c."deletedAt" IS NULL AND c.estado <> 'ANULADA' AND c."fechaEmision" BETWEEN ${f.desde} AND ${f.hasta} ${torreSql(f)}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ mes: string; valor: number }[]>`
      SELECT to_char(p.fecha AT TIME ZONE ${TZ}, 'YYYY-MM') AS mes, SUM(p.valor)::float AS valor FROM "Pago" p JOIN "Unidad" u ON u.id = p."unidadId"
      WHERE p."conjuntoId" = ${cid} AND p."deletedAt" IS NULL AND p.estado = 'APROBADO' AND p.fecha BETWEEN ${f.desde} AND ${f.hasta} ${torreSql(f)}
      GROUP BY 1 ORDER BY 1`,
    ctx.db.pago.groupBy({ by: ["medio"], where: { estado: "APROBADO", fecha: { gte: f.desde, lte: f.hasta }, ...unidadWhere(f) }, _sum: { valor: true }, _count: true }),
    ctx.db.cuota.findMany({ where: { estado: { in: ["PENDIENTE", "PARCIAL", "EN_ACUERDO"] }, ...unidadWhere(f) }, select: { unidadId: true, saldo: true, fechaVencimiento: true } }),
    ctx.db.cuota.aggregate({ where: { fechaEmision: { gte: f.desde, lte: f.hasta }, descuento: { gt: 0 }, ...unidadWhere(f) }, _sum: { descuento: true }, _count: true }),
    ctx.db.cuota.aggregate({ where: { concepto: { tipo: "INTERES_MORA" }, fechaEmision: { gte: f.desde, lte: f.hasta }, ...unidadWhere(f) }, _sum: { valorBase: true } }),
    ctx.db.campanaCorreo.findMany({ where: { tipo: "COBRO_ADMINISTRACION", createdAt: { gte: f.desde, lte: f.hasta } }, select: { asunto: true, enviados: true, aperturas: true, clics: true, createdAt: true } }),
    ctx.db.unidad.count({ where: f.torreId ? { torreId: f.torreId === "casas" ? null : f.torreId } : {} }),
  ]);
  const hoy = new Date();
  const aging = Object.fromEntries(RANGOS_MORA.map((k) => [k, 0])) as Record<(typeof RANGOS_MORA)[number], number>;
  const porUnidad = new Map<string, number>();
  let saldoTotal = 0;
  let vencido = 0;
  for (const c of pendientes) {
    const s = n(c.saldo);
    const dias = Math.floor((hoy.getTime() - c.fechaVencimiento.getTime()) / 86400000);
    aging[rangoMora(dias)] += s;
    saldoTotal += s;
    if (dias > 0) {
      vencido += s;
      porUnidad.set(c.unidadId, (porUnidad.get(c.unidadId) ?? 0) + s);
    }
  }
  const morosas = [...porUnidad.entries()].filter(([, v]) => v > 1000);
  const top = morosas.sort((a, b) => b[1] - a[1]).slice(0, 10);
  const unidades = verNombres ? await ctx.db.unidad.findMany({ where: { id: { in: top.map((t) => t[0]) } }, select: { id: true, codigo: true } }) : [];
  const meses = [...new Set([...facturado.map((x) => x.mes), ...recaudado.map((x) => x.mes)])].sort();
  const serie = meses.map((m) => ({
    mes: mesLabel(m),
    facturado: Math.round(facturado.find((x) => x.mes === m)?.valor ?? 0),
    recaudado: Math.round(recaudado.find((x) => x.mes === m)?.valor ?? 0),
  }));
  const totalFact = serie.reduce((a, s) => a + s.facturado, 0);
  const totalRec = serie.reduce((a, s) => a + s.recaudado, 0);
  // Proyección del próximo mes: cuotas por vencer + tasa histórica de recuperación de lo vencido.
  const porVencer = saldoTotal - vencido;
  const tasaRecuperacion = totalFact > 0 ? Math.min(1, totalRec / totalFact) : 0.85;
  return {
    kpis: {
      facturado: totalFact,
      recaudado: totalRec,
      efectividad: pct(totalRec, totalFact),
      saldoTotal: Math.round(saldoTotal),
      vencido: Math.round(vencido),
      pctMoraUnidades: pct(morosas.length, totalUnidades),
      unidadesMorosas: morosas.length,
      prontoPago: n(descuentos._sum.descuento),
      prontoPagoCuotas: descuentos._count,
      interesesGenerados: n(intereses._sum.valorBase),
      proyeccion: Math.round(porVencer * tasaRecuperacion + vencido * 0.15),
    },
    serie,
    aging: RANGOS_MORA.map((k) => ({ rango: RANGO_LABEL[k], saldo: Math.round(aging[k]) })),
    porMedio: porMedio.map((p) => ({ medio: label(p.medio), valor: n(p._sum.valor), pagos: p._count })).sort((a, b) => b.valor - a.valor),
    topMorosos: verNombres ? top.map(([id, v]) => ({ unidad: unidades.find((u) => u.id === id)?.codigo ?? "—", saldo: Math.round(v) })) : [],
    campanas: campanas.map((c) => ({ campana: c.asunto.slice(0, 30), enviados: c.enviados, aperturas: pct(c.aperturas, c.enviados), clics: pct(c.clics, c.enviados) })),
  };
}

// ───────────────────────── RESERVAS ─────────────────────────
export async function statsReservas(ctx: Ctx, f: Filtro) {
  const rango = { inicio: { gte: f.desde, lte: f.hasta }, ...unidadWhere(f) };
  const [reservas, zonas, horas] = await Promise.all([
    ctx.db.reserva.findMany({ where: rango, select: { zonaId: true, inicio: true, fin: true, estado: true, valor: true, iva: true, calificacion: true, pagada: true } }),
    ctx.db.zonaComun.findMany({ where: { reservable: true }, select: { id: true, nombre: true, horario: true } }),
    prisma.$queryRaw<{ h: number; total: number }[]>`
      SELECT EXTRACT(HOUR FROM r.inicio AT TIME ZONE ${TZ})::int AS h, COUNT(*)::int AS total FROM "Reserva" r JOIN "Unidad" u ON u.id = r."unidadId"
      WHERE r."conjuntoId" = ${ctx.conjuntoId} AND r."deletedAt" IS NULL AND r.estado IN ('APROBADA','CUMPLIDA') AND r.inicio BETWEEN ${f.desde} AND ${f.hasta} ${torreSql(f)}
      GROUP BY 1 ORDER BY 1`,
  ]);
  const dias = Math.max(1, (f.hasta.getTime() - f.desde.getTime()) / 86400000);
  const validas = reservas.filter((r) => ["APROBADA", "CUMPLIDA", "NO_SHOW"].includes(r.estado));
  const ocupacion = zonas.map((z) => {
    const hs = validas.filter((r) => r.zonaId === z.id).reduce((a, r) => a + (r.fin.getTime() - r.inicio.getTime()) / 3600000, 0);
    const horario = z.horario as Record<string, { abre: string; cierra: string } | null>;
    const hDia = Object.values(horario).reduce((a, h) => (h ? a + (Number(h.cierra.slice(0, 2)) - Number(h.abre.slice(0, 2))) : a), 0) / 7 || 12;
    return { zona: z.nombre, ocupacion: r1(Math.min(100, (hs / (hDia * dias)) * 100)), reservas: validas.filter((r) => r.zonaId === z.id).length };
  });
  const pagadas = reservas.filter((r) => r.pagada);
  const calif = reservas.filter((r) => r.calificacion);
  return {
    kpis: {
      total: reservas.length,
      ingresos: pagadas.reduce((a, r) => a + n(r.valor), 0),
      iva: pagadas.reduce((a, r) => a + n(r.iva), 0),
      cancelaciones: reservas.filter((r) => r.estado === "CANCELADA").length,
      noShows: reservas.filter((r) => r.estado === "NO_SHOW").length,
      calificacion: calif.length ? r1(calif.reduce((a, r) => a + (r.calificacion ?? 0), 0) / calif.length) : 0,
    },
    ocupacion: ocupacion.sort((a, b) => b.ocupacion - a.ocupacion),
    horasPico: Array.from({ length: 18 }, (_, i) => i + 5).map((h) => ({ hora: `${h}:00`, reservas: horas.find((x) => x.h === h)?.total ?? 0 })),
  };
}

// ───────────────────────── PORTERÍA Y PAQUETERÍA ─────────────────────────
export async function statsPorteria(ctx: Ctx, f: Filtro) {
  const cid = ctx.conjuntoId;
  const [porDia, porHora, porTipo, permanencia, novedades, solicitudes, turnos, vehiculos, domicilios] = await Promise.all([
    prisma.$queryRaw<{ dia: string; ingresos: number; salidas: number }[]>`
      SELECT to_char(r.hora AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS dia, COUNT(*) FILTER (WHERE r.tipo = 'INGRESO')::int AS ingresos, COUNT(*) FILTER (WHERE r.tipo = 'SALIDA')::int AS salidas
      FROM "RegistroAcceso" r WHERE r."conjuntoId" = ${cid} AND r.hora BETWEEN ${f.desde} AND ${f.hasta} GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ h: number; total: number }[]>`
      SELECT EXTRACT(HOUR FROM r.hora AT TIME ZONE ${TZ})::int AS h, COUNT(*)::int AS total FROM "RegistroAcceso" r
      WHERE r."conjuntoId" = ${cid} AND r.tipo = 'INGRESO' AND r.hora BETWEEN ${f.desde} AND ${f.hasta} GROUP BY 1 ORDER BY 1`,
    ctx.db.registroAcceso.groupBy({ by: ["sujeto"], where: { tipo: "INGRESO", hora: { gte: f.desde, lte: f.hasta } }, _count: true }),
    prisma.$queryRaw<{ minutos: number | null }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM (s.hora - i.hora)) / 60)::float AS minutos FROM "RegistroAcceso" s JOIN "RegistroAcceso" i ON i.id = s."ingresoId"
      WHERE s."conjuntoId" = ${cid} AND s.tipo = 'SALIDA' AND s.hora BETWEEN ${f.desde} AND ${f.hasta}`,
    ctx.db.novedad.groupBy({ by: ["tipo"], where: { createdAt: { gte: f.desde, lte: f.hasta } }, _count: true }),
    prisma.$queryRaw<{ seg: number | null; total: number }[]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("respondidaEn" - "createdAt")))::float AS seg, COUNT(*)::int AS total FROM "SolicitudIngreso"
      WHERE "conjuntoId" = ${cid} AND "respondidaEn" IS NOT NULL AND "createdAt" BETWEEN ${f.desde} AND ${f.hasta}`,
    ctx.db.turnoPorteria.count({ where: { apertura: { gte: f.desde, lte: f.hasta } } }),
    ctx.db.registroAcceso.count({ where: { tipo: "INGRESO", placa: { not: null }, sujeto: { in: ["VISITANTE", "PROVEEDOR", "VEHICULO"] }, hora: { gte: f.desde, lte: f.hasta } } }),
    ctx.db.registroAcceso.count({ where: { tipo: "INGRESO", sujeto: "DOMICILIARIO", hora: { gte: f.desde, lte: f.hasta } } }),
  ]);
  const [paqDia, paqTrans, paqEntregados, paqPendientes] = await Promise.all([
    prisma.$queryRaw<{ dia: string; total: number }[]>`
      SELECT to_char(p."llegadaEn" AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS dia, COUNT(*)::int AS total FROM "Paquete" p JOIN "Unidad" u ON u.id = p."unidadId"
      WHERE p."conjuntoId" = ${cid} AND p."deletedAt" IS NULL AND p."llegadaEn" BETWEEN ${f.desde} AND ${f.hasta} ${torreSql(f)} GROUP BY 1 ORDER BY 1`,
    ctx.db.paquete.groupBy({ by: ["transportadora"], where: { llegadaEn: { gte: f.desde, lte: f.hasta }, ...unidadWhere(f) }, _count: true, orderBy: { _count: { transportadora: "desc" } }, take: 8 }),
    ctx.db.paquete.findMany({ where: { estado: "ENTREGADO", llegadaEn: { gte: f.desde, lte: f.hasta }, ...unidadWhere(f) }, select: { llegadaEn: true, entregadoEn: true } }),
    ctx.db.paquete.count({ where: { estado: "EN_PORTERIA", ...unidadWhere(f) } }),
  ]);
  const horasPaquete = paqEntregados.filter((p) => p.entregadoEn).map((p) => (p.entregadoEn!.getTime() - p.llegadaEn.getTime()) / 3600000);
  const dd = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return {
    kpis: {
      ingresos: porDia.reduce((a, d) => a + d.ingresos, 0),
      permanenciaMin: Math.round(permanencia[0]?.minutos ?? 0),
      respuestaSeg: Math.round(solicitudes[0]?.seg ?? 0),
      solicitudes: solicitudes[0]?.total ?? 0,
      turnos,
      vehiculosVisitantes: vehiculos,
      domicilios,
    },
    porDia: porDia.map((d) => ({ dia: dd(d.dia), ingresos: d.ingresos, salidas: d.salidas })),
    porHora: Array.from({ length: 24 }, (_, h) => ({ hora: `${h}h`, ingresos: porHora.find((x) => x.h === h)?.total ?? 0 })),
    porTipo: porTipo.map((t) => ({ tipo: label(t.sujeto), ingresos: t._count })).sort((a, b) => b.ingresos - a.ingresos),
    novedades: novedades.map((x) => ({ tipo: label(x.tipo), total: x._count })).sort((a, b) => b.total - a.total),
    paquetes: {
      porDia: paqDia.map((d) => ({ dia: dd(d.dia), paquetes: d.total })),
      porTransportadora: paqTrans.map((t) => ({ transportadora: t.transportadora ?? "Sin dato", paquetes: t._count })),
      horasPromedio: horasPaquete.length ? r1(horasPaquete.reduce((a, b) => a + b, 0) / horasPaquete.length) : 0,
      sinReclamar: paqPendientes,
      total: paqDia.reduce((a, d) => a + d.total, 0),
    },
  };
}

// ───────────────────────── PQRS ─────────────────────────
export async function statsTickets(ctx: Ctx, f: Filtro) {
  const tickets = await ctx.db.ticket.findMany({
    where: { createdAt: { gte: f.desde, lte: f.hasta }, ...(f.torreId ? { unidad: { torreId: f.torreId === "casas" ? null : f.torreId } } : {}) },
    select: { tipo: true, estado: true, createdAt: true, resueltoEn: true, fechaLimite: true, calificacion: true, reabiertoVeces: true, activo: { select: { nombre: true } }, zona: { select: { nombre: true } } },
  });
  const resueltos = tickets.filter((t) => t.resueltoEn);
  const horas = resueltos.map((t) => (t.resueltoEn!.getTime() - t.createdAt.getTime()) / 3600000);
  const enSla = resueltos.filter((t) => t.resueltoEn! <= t.fechaLimite).length;
  const calif = tickets.filter((t) => t.calificacion);
  const porTipo = new Map<string, number>();
  const porLugar = new Map<string, number>();
  for (const t of tickets) {
    porTipo.set(label(t.tipo), (porTipo.get(label(t.tipo)) ?? 0) + 1);
    const lugar = t.activo?.nombre ?? t.zona?.nombre;
    if (lugar) porLugar.set(lugar, (porLugar.get(lugar) ?? 0) + 1);
  }
  const abiertosVencidos = tickets.filter((t) => !t.resueltoEn && !["CERRADO", "RESUELTO"].includes(t.estado) && t.fechaLimite < new Date()).length;
  return {
    kpis: {
      total: tickets.length,
      resueltos: resueltos.length,
      horasResolucion: horas.length ? r1(horas.reduce((a, b) => a + b, 0) / horas.length) : 0,
      cumplimientoSla: pct(enSla, resueltos.length),
      vencidos: abiertosVencidos,
      reabiertos: tickets.filter((t) => t.reabiertoVeces > 0).length,
      satisfaccion: calif.length ? r1(calif.reduce((a, t) => a + (t.calificacion ?? 0), 0) / calif.length) : 0,
    },
    porTipo: [...porTipo.entries()].map(([tipo, total]) => ({ tipo, total })).sort((a, b) => b.total - a.total),
    porEstado: Object.entries(tickets.reduce<Record<string, number>>((a, t) => ((a[label(t.estado)] = (a[label(t.estado)] ?? 0) + 1), a), {})).map(([estado, total]) => ({ estado, total })),
    masFallan: [...porLugar.entries()].map(([lugar, total]) => ({ lugar, total })).sort((a, b) => b.total - a.total).slice(0, 8),
  };
}

// ───────────────────────── COMUNIDAD ─────────────────────────
export async function statsComunidad(ctx: Ctx, f: Filtro) {
  const tw = f.torreId ? { unidad: { torreId: f.torreId === "casas" ? null : f.torreId } } : {};
  const [personas, unidades, mascotas, vehiculos, encuestas, votos, correos, lecturas, publicaciones, totalUnidades] = await Promise.all([
    ctx.db.persona.findMany({
      where: { anonimizada: false, vinculos: { some: { estado: "ACTIVO", deletedAt: null, tipo: { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] }, ...tw } } },
      select: { fechaNacimiento: true, movilidadReducida: true, vinculos: { where: { estado: "ACTIVO", deletedAt: null }, select: { unidad: { select: { torre: { select: { nombre: true } }, piso: true } } } } },
    }),
    ctx.db.unidad.groupBy({ by: ["estadoOcupacion"], where: f.torreId ? { torreId: f.torreId === "casas" ? null : f.torreId } : {}, _count: true }),
    ctx.db.mascota.groupBy({ by: ["especie"], where: { activo: true, ...tw }, _count: true }),
    ctx.db.vehiculo.groupBy({ by: ["tipo"], where: { activo: true, ...tw }, _count: true }),
    ctx.db.encuesta.findMany({ where: { inicio: { gte: f.desde, lte: f.hasta } }, select: { titulo: true, _count: { select: { respuestas: true } } } }),
    ctx.db.votacion.findMany({ where: { inicio: { gte: f.desde, lte: f.hasta } }, select: { pregunta: true, votos: { where: { deletedAt: null }, select: { coeficiente: true } } } }),
    ctx.db.correoSaliente.aggregate({ where: { conjuntoId: ctx.conjuntoId, createdAt: { gte: f.desde, lte: f.hasta }, estado: "ENVIADO" }, _count: { _all: true, abiertoEn: true } }),
    ctx.db.lecturaPublicacion.count({ where: { createdAt: { gte: f.desde, lte: f.hasta } } }),
    ctx.db.publicacion.count({ where: { createdAt: { gte: f.desde, lte: f.hasta }, estado: "PUBLICADA" } }),
    ctx.db.unidad.count(),
  ]);
  const rangos = [
    { rango: "0–11", min: 0, max: 11 },
    { rango: "12–17", min: 12, max: 17 },
    { rango: "18–29", min: 18, max: 29 },
    { rango: "30–44", min: 30, max: 44 },
    { rango: "45–59", min: 45, max: 59 },
    { rango: "60–74", min: 60, max: 74 },
    { rango: "75+", min: 75, max: 200 },
  ];
  const edades = personas.map((p) => edad(p.fechaNacimiento));
  const movPorTorre = new Map<string, number>();
  for (const p of personas.filter((x) => x.movilidadReducida)) {
    const t = p.vinculos[0]?.unidad.torre?.nombre ?? "Casas";
    movPorTorre.set(t, (movPorTorre.get(t) ?? 0) + 1);
  }
  return {
    kpis: {
      personas: personas.length,
      menores: edades.filter((e) => e !== null && e < 18).length,
      adultosMayores: edades.filter((e) => e !== null && e >= 60).length,
      movilidad: personas.filter((p) => p.movilidadReducida).length,
      mascotas: mascotas.reduce((a, m) => a + m._count, 0),
      vehiculos: vehiculos.reduce((a, v) => a + v._count, 0),
      aperturaCorreos: pct(correos._count.abiertoEn, correos._count._all),
      lecturasPorPublicacion: publicaciones ? r1(lecturas / publicaciones) : 0,
    },
    edades: rangos.map((r) => ({ rango: r.rango, personas: edades.filter((e) => e !== null && e >= r.min && e <= r.max).length })),
    ocupacion: unidades.map((u) => ({ estado: label(u.estadoOcupacion), unidades: u._count })),
    mascotas: mascotas.map((m) => ({ especie: m.especie, total: m._count })),
    vehiculos: vehiculos.map((v) => ({ tipo: label(v.tipo), total: v._count })),
    movilidadPorTorre: [...movPorTorre.entries()].map(([torre, personas]) => ({ torre, personas })),
    participacion: [
      ...encuestas.map((e) => ({ actividad: `Encuesta: ${e.titulo.slice(0, 26)}`, participacion: pct(e._count.respuestas, totalUnidades) })),
      ...votos.map((v) => ({ actividad: `Votación: ${v.pregunta.slice(0, 26)}`, participacion: r1(v.votos.reduce((a, x) => a + n(x.coeficiente), 0)) })),
    ],
  };
}

// ───────────────────────── MANTENIMIENTO ─────────────────────────
export async function statsMantenimiento(ctx: Ctx, f: Filtro) {
  const [ordenes, activos] = await Promise.all([
    ctx.db.ordenTrabajo.findMany({
      where: { fechaProgramada: { gte: f.desde, lte: f.hasta } },
      select: { origen: true, estado: true, fechaProgramada: true, fechaCierre: true, costo: true, activo: { select: { nombre: true } }, proveedor: { select: { razonSocial: true } }, activoId: true },
    }),
    ctx.db.activo.findMany({ select: { id: true, nombre: true, ordenes: { where: { deletedAt: null, origen: { in: ["TICKET", "MANUAL"] } }, select: { fechaProgramada: true }, orderBy: { fechaProgramada: "asc" } } } }),
  ]);
  const plan = ordenes.filter((o) => o.origen === "PLAN");
  const planOk = plan.filter((o) => o.estado === "COMPLETADA" && o.fechaCierre && o.fechaCierre.getTime() <= o.fechaProgramada.getTime() + 7 * 86400000).length;
  const costoPorActivo = new Map<string, number>();
  const prov = new Map<string, { total: number; completadas: number; costo: number }>();
  for (const o of ordenes) {
    if (o.activo) costoPorActivo.set(o.activo.nombre, (costoPorActivo.get(o.activo.nombre) ?? 0) + n(o.costo));
    if (o.proveedor) {
      const p = prov.get(o.proveedor.razonSocial) ?? { total: 0, completadas: 0, costo: 0 };
      p.total++;
      if (o.estado === "COMPLETADA") p.completadas++;
      p.costo += n(o.costo);
      prov.set(o.proveedor.razonSocial, p);
    }
  }
  const mtbf = activos
    .filter((a) => a.ordenes.length >= 2)
    .map((a) => {
      const f0 = a.ordenes[0].fechaProgramada.getTime();
      const f1 = a.ordenes[a.ordenes.length - 1].fechaProgramada.getTime();
      return { activo: a.nombre, dias: Math.round((f1 - f0) / 86400000 / (a.ordenes.length - 1)) };
    })
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 8);
  return {
    kpis: {
      ordenes: ordenes.length,
      cumplimientoPlan: pct(planOk, plan.length),
      costo: ordenes.reduce((a, o) => a + n(o.costo), 0),
      pendientes: ordenes.filter((o) => ["PENDIENTE", "PROGRAMADA", "EN_PROCESO"].includes(o.estado)).length,
      vencidas: ordenes.filter((o) => ["PENDIENTE", "PROGRAMADA"].includes(o.estado) && o.fechaProgramada < new Date()).length,
    },
    costoPorActivo: [...costoPorActivo.entries()].map(([activo, costo]) => ({ activo, costo })).sort((a, b) => b.costo - a.costo).slice(0, 10),
    mtbf,
    proveedores: [...prov.entries()].map(([proveedor, p]) => ({ proveedor, cumplimiento: pct(p.completadas, p.total), ordenes: p.total, costo: p.costo })).sort((a, b) => b.ordenes - a.ordenes),
  };
}

// ───────────────────────── CONVIVENCIA ─────────────────────────
export async function statsConvivencia(ctx: Ctx, f: Filtro) {
  const rango = { fecha: { gte: f.desde, lte: f.hasta }, ...unidadWhere(f) };
  const [llamados, multas, infracciones] = await Promise.all([
    ctx.db.llamadoAtencion.findMany({ where: rango, select: { unidadId: true, motivo: true } }),
    ctx.db.multa.findMany({ where: rango, select: { unidadId: true, estado: true, valor: true, infraccionId: true } }),
    ctx.db.catalogoInfraccion.findMany({ select: { id: true, nombre: true } }),
  ]);
  const porMotivo = new Map<string, number>();
  for (const l of llamados) porMotivo.set(l.motivo, (porMotivo.get(l.motivo) ?? 0) + 1);
  const porInfr = new Map<string, number>();
  for (const m of multas) {
    const nom = infracciones.find((i) => i.id === m.infraccionId)?.nombre ?? "Otra";
    porInfr.set(nom, (porInfr.get(nom) ?? 0) + 1);
  }
  const cuenta = new Map<string, number>();
  for (const x of [...llamados, ...multas]) cuenta.set(x.unidadId, (cuenta.get(x.unidadId) ?? 0) + 1);
  return {
    kpis: {
      llamados: llamados.length,
      multas: multas.length,
      ratificadas: multas.filter((m) => ["RATIFICADA", "PAGADA"].includes(m.estado)).length,
      recaudoMultas: multas.filter((m) => m.estado === "PAGADA").reduce((a, m) => a + n(m.valor), 0),
      reincidentes: [...cuenta.values()].filter((v) => v > 1).length,
    },
    llamadosPorMotivo: [...porMotivo.entries()].map(([motivo, total]) => ({ motivo: motivo.slice(0, 30), total })).sort((a, b) => b.total - a.total),
    multasPorTipo: [...porInfr.entries()].map(([tipo, total]) => ({ tipo: tipo.slice(0, 30), total })).sort((a, b) => b.total - a.total),
  };
}

// ───────────────────────── ASAMBLEAS ─────────────────────────
export async function statsAsambleas(ctx: Ctx) {
  const asambleas = await ctx.db.asamblea.findMany({
    where: { estado: { in: ["FINALIZADA", "EN_CURSO"] } },
    orderBy: { fecha: "asc" },
    select: { titulo: true, fecha: true, asistencias: { where: { deletedAt: null }, select: { coeficiente: true, unidad: { select: { torre: { select: { nombre: true } } } } } } },
  });
  const unidadesPorTorre = await prisma.$queryRaw<{ torre: string; total: number; coef: number }[]>`
    SELECT COALESCE(t.nombre, 'Casas') AS torre, COUNT(*)::int AS total, SUM(u.coeficiente)::float AS coef FROM "Unidad" u LEFT JOIN "Torre" t ON t.id = u."torreId"
    WHERE u."conjuntoId" = ${ctx.conjuntoId} AND u."deletedAt" IS NULL GROUP BY 1 ORDER BY 1`;
  const ultima = asambleas[asambleas.length - 1];
  return {
    quorum: asambleas.map((a) => ({ asamblea: `${a.titulo.slice(0, 18)} ${a.fecha.getFullYear()}`, quorum: r1(a.asistencias.reduce((s, x) => s + n(x.coeficiente), 0)) })),
    participacionTorre: ultima
      ? unidadesPorTorre.map((t) => {
          const coef = ultima.asistencias.filter((x) => (x.unidad.torre?.nombre ?? "Casas") === t.torre).reduce((s, x) => s + n(x.coeficiente), 0);
          return { torre: t.torre, participacion: pct(coef, t.coef) };
        })
      : [],
  };
}

// ───────────────────────── PANEL PERSONAL DEL RESIDENTE ─────────────────────────
export async function statsPersonal(ctx: Ctx, f: Filtro) {
  const u = ctx.unidadIds;
  const [pagos, reservas, visitas, paquetes, tickets] = await Promise.all([
    ctx.db.pago.findMany({ where: { unidadId: { in: ctx.unidadesPropias.length ? ctx.unidadesPropias : u }, estado: "APROBADO", fecha: { gte: f.desde, lte: f.hasta } }, select: { fecha: true, valor: true } }),
    ctx.db.reserva.findMany({ where: { unidadId: { in: u }, inicio: { gte: f.desde, lte: f.hasta } }, select: { valor: true, iva: true, pagada: true, zona: { select: { nombre: true } } } }),
    ctx.db.registroAcceso.count({ where: { unidadId: { in: u }, tipo: "INGRESO", sujeto: { in: ["VISITANTE", "DOMICILIARIO", "PROVEEDOR"] }, hora: { gte: f.desde, lte: f.hasta } } }),
    ctx.db.paquete.count({ where: { unidadId: { in: u }, llegadaEn: { gte: f.desde, lte: f.hasta } } }),
    ctx.db.ticket.findMany({ where: { OR: [{ unidadId: { in: u } }, { solicitanteId: ctx.userId }], createdAt: { gte: f.desde, lte: f.hasta } }, select: { createdAt: true, resueltoEn: true } }),
  ]);
  const porMes = new Map<string, number>();
  for (const p of pagos) {
    const k = p.fecha.toISOString().slice(0, 7);
    porMes.set(k, (porMes.get(k) ?? 0) + n(p.valor));
  }
  const resueltos = tickets.filter((t) => t.resueltoEn);
  return {
    kpis: {
      pagado: pagos.reduce((a, p) => a + n(p.valor), 0),
      alquileres: reservas.filter((r) => r.pagada).reduce((a, r) => a + n(r.valor) + n(r.iva), 0),
      reservas: reservas.length,
      visitas,
      paquetes,
      tickets: tickets.length,
      horasRespuesta: resueltos.length ? r1(resueltos.reduce((a, t) => a + (t.resueltoEn!.getTime() - t.createdAt.getTime()) / 3600000, 0) / resueltos.length) : 0,
    },
    pagosPorMes: [...porMes.entries()].sort().map(([m, valor]) => ({ mes: mesLabel(m), valor })),
  };
}

/** Indicadores agregados visibles para roles no administrativos según Configuración → Visibilidad. */
export async function indicadoresPublicos(ctx: Ctx) {
  const out: { label: string; valor: string }[] = [];
  const has = (p: string) => ctx.esSuperAdmin || ctx.permisos.has(p);
  if (has("secciones.mora_conjunto") || has("secciones.recaudo_conjunto")) {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const c = await statsCartera(ctx, { desde, hasta: hoy }, false);
    if (has("secciones.mora_conjunto")) out.push({ label: "Unidades en mora en el conjunto", valor: `${c.kpis.pctMoraUnidades} %` });
    if (has("secciones.recaudo_conjunto")) out.push({ label: "Efectividad de recaudo del mes", valor: `${c.kpis.efectividad} %` });
  }
  if (has("secciones.pqrs_conjunto")) {
    const hoy = new Date();
    const t = await statsTickets(ctx, { desde: new Date(hoy.getTime() - 90 * 86400000), hasta: hoy });
    out.push({ label: "PQRS resueltas dentro del plazo (90 días)", valor: `${t.kpis.cumplimientoSla} %` });
  }
  return out;
}
