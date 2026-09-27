import crypto from "node:crypto";
import type { MedioAcceso, Prisma, Severidad, SujetoAcceso, TipoNovedad, TipoPaquete, TipoVisitante } from "@prisma/client";
import { prisma, persona, placaCarro, type SeedState } from "./util";

/**
 * Portería de demostración:
 *  - 500 registros de bitácora en los últimos 30 días (ingresos con su salida, visitas, domicilios, proveedores,
 *    vehículos de residentes, frecuentes) y algunos ANULADOS con su registro de anulación.
 *  - Visitantes (2 en lista negra), autorizaciones (activas, recurrentes y vencidas), solicitudes de ingreso.
 *  - 80 paquetes (≈8 en portería, 2 con más de 3 días, 2 para T1-101).
 *  - Turnos de los últimos días con checklist y firma, 20 novedades, 12 llaves/elementos con préstamos,
 *    1 alerta de emergencia atendida.
 *
 * DEMO: autorización ACTIVA de T1-101 con código conocido **246810** (visitante "Carlos Mendoza").
 */
export const CODIGO_DEMO_T1101 = "246810";
const ALERTA_SEED = "Hay alguien intentando abrir la puerta del apartamento.";

// Firma mínima (PNG 1×1 blanco) para turnos históricos
const FIRMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

const TRANSPORTADORAS = ["Servientrega", "Interrapidísimo", "Coordinadora", "Envía", "TCC", "Amazon", "Mercado Libre", "Rappi", "Deprisa", "4-72"];
const EMPRESAS = ["Gases del Caribe", "Air-e", "Triple A", "Claro", "Tigo", "Movistar", "Ascensores del Caribe", "Fumigaciones La Costa"];
const DOMICILIOS = ["Rappi", "DiDi Food", "iFood", "Domicilio droguería", "Domicilio restaurante", "Mercado Olímpica", "Éxito"];

export async function seedPorteria(s: SeedState) {
  const { conjuntoId, rng, now } = s;
  // Idempotente: borra primero lo que crea este módulo (para `scripts/seed-uno.ts 50-porteria`).
  const w = { conjuntoId };
  await prisma.registroAcceso.deleteMany({ where: w });
  await prisma.solicitudIngreso.deleteMany({ where: w });
  await prisma.autorizacionIngreso.deleteMany({ where: w });
  await prisma.visitante.deleteMany({ where: w });
  await prisma.paquete.deleteMany({ where: w });
  await prisma.novedad.deleteMany({ where: w });
  await prisma.prestamoElemento.deleteMany({ where: w });
  await prisma.llaveElemento.deleteMany({ where: w });
  await prisma.turnoPorteria.deleteMany({ where: w });
  await prisma.alertaEmergencia.deleteMany({ where: { ...w, mensaje: ALERTA_SEED } });
  await prisma.parqueadero.updateMany({ where: { ...w, tipo: "VISITANTES" }, data: { estado: "DISPONIBLE" } });
  const porteros = [s.users.porteria, s.users.porteria2].filter(Boolean);
  const admin = s.users.administrador;
  const unidades = await prisma.unidad.findMany({ where: { conjuntoId }, select: { id: true, codigo: true, estadoOcupacion: true } });
  const byCode = new Map(unidades.map((u) => [u.codigo, u]));
  const habitadas = unidades.filter((u) => u.estadoOcupacion !== "DESOCUPADA" && u.estadoOcupacion !== "EN_VENTA");
  const t1101 = byCode.get("T1-101")!;
  const t2302 = byCode.get("T2-302") ?? habitadas[1];
  const parqsVis = await prisma.parqueadero.findMany({ where: { conjuntoId, tipo: "VISITANTES" }, orderBy: { codigo: "asc" } });
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId, estado: "ACTIVO", deletedAt: null },
    include: { persona: { select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, fechaNacimiento: true } } },
  });
  const residentesPorUnidad = new Map<string, typeof vinculos>();
  for (const v of vinculos) {
    if (!["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "AUTORIZADO_RECOGER_PAQUETES"].includes(v.tipo)) continue;
    const edad = v.persona.fechaNacimiento ? (now.getTime() - v.persona.fechaNacimiento.getTime()) / (365.25 * 86400000) : 30;
    if (edad < 14) continue;
    residentesPorUnidad.set(v.unidadId, [...(residentesPorUnidad.get(v.unidadId) ?? []), v]);
  }
  const empleados = vinculos.filter((v) => v.tipo === "EMPLEADO_DOMESTICO" || v.tipo === "CUIDADOR");
  const vehiculos = await prisma.vehiculo.findMany({ where: { conjuntoId }, select: { placa: true, unidadId: true } });
  const nombre = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`;
  const id = () => crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const en = (diasAtras: number, h: number, m = 0) => {
    const d = new Date(now.getTime() - diasAtras * 86400000);
    d.setHours(h, m, rng.int(0, 59), 0);
    return d;
  };

  // ── Visitantes (con 2 en lista negra) ──
  const visitantes: { id: string; nombre: string; doc: string; tipo: TipoVisitante; empresa: string | null }[] = [];
  for (let i = 0; i < 40; i++) {
    const p = persona(rng);
    const tipo: TipoVisitante = i < 26 ? "VISITA" : i < 32 ? "PROVEEDOR" : i < 36 ? "TECNICO" : "DOMICILIO";
    visitantes.push({ id: id(), nombre: `${p.nombres} ${p.apellidos}`, doc: String(rng.int(10_000_000, 1_200_000_000)), tipo, empresa: tipo === "PROVEEDOR" || tipo === "TECNICO" ? rng.pick(EMPRESAS) : null });
  }
  await prisma.visitante.createMany({
    data: [
      ...visitantes.map((v) => ({ id: v.id, conjuntoId, nombre: v.nombre, numeroDocumento: v.doc, tipo: v.tipo, empresa: v.empresa })),
      { id: id(), conjuntoId, nombre: "Jairo Alberto Mercado Ruiz", numeroDocumento: "72145889", tipo: "VISITA" as const, listaNegra: true, motivoListaNegra: "Orden de alejamiento vigente solicitada por residente de T2-504 (Comisaría de Familia)." },
      { id: id(), conjuntoId, nombre: "Kevin Andrés Solano Pérez", numeroDocumento: "1143998765", tipo: "DOMICILIO" as const, listaNegra: true, motivoListaNegra: "Hurto de un paquete en portería (denuncia 2026-0415). Prohibido el ingreso." },
    ],
  });

  // ── Turnos (últimos 7 días, 2 por día; el actual abierto para porteria@demo.co) ──
  const turnos: { id: string; porteroId: string; apertura: Date; cierre: Date | null }[] = [];
  const checklist = (ok = true) =>
    ["Llaves de zonas comunes", "Radios", "Controles de parqueadero", "Libro de minuta", "Linterna"].map((e, i) => ({ elemento: e, ok: ok || i !== 1, nota: !ok && i === 1 ? "Radio 2 sin batería" : null }));
  for (let d = 7; d >= 0; d--) {
    for (const [k, h] of [
      [0, 6],
      [1, 18],
    ] as const) {
      const apertura = en(d, h, 0);
      if (apertura > now) continue;
      const cierre = new Date(apertura.getTime() + 12 * 3600000);
      const abierto = cierre > now;
      turnos.push({ id: id(), porteroId: porteros[k % porteros.length], apertura, cierre: abierto ? null : cierre });
    }
  }
  // El turno en curso es de porteria@demo.co
  const actual = turnos.find((t) => !t.cierre);
  if (actual) actual.porteroId = s.users.porteria;
  await prisma.turnoPorteria.createMany({
    data: turnos.map((t, i) => ({
      id: t.id,
      conjuntoId,
      porteroId: t.porteroId,
      apertura: t.apertura,
      cierre: t.cierre,
      estado: t.cierre ? ("CERRADO" as const) : ("ABIERTO" as const),
      checklistApertura: checklist(i % 5 !== 3),
      checklistCierre: t.cierre ? checklist(true) : undefined,
      novedadesApertura: i % 4 === 0 ? "Se recibe turno sin novedad." : i % 4 === 1 ? "Puerta vehicular lenta; se reportó a mantenimiento." : null,
      novedadesCierre: t.cierre ? (i % 3 === 0 ? "Turno sin novedades." : "Se entregan 2 paquetes pendientes en bodega.") : null,
      firmaApertura: FIRMA,
      firmaCierre: t.cierre ? FIRMA : null,
    })),
  });
  const turnoDe = (d: Date) => turnos.find((t) => d >= t.apertura && (!t.cierre || d <= t.cierre));
  const porteroDe = (d: Date) => turnoDe(d)?.porteroId ?? porteros[0];

  // ── Bitácora (500 registros) ──
  type Reg = Prisma.RegistroAccesoCreateManyInput;
  const regs: Reg[] = [];
  const pares = 228;
  for (let i = 0; i < pares; i++) {
    const dias = rng.int(0, 29);
    const ingreso = en(dias, rng.int(6, 21), rng.int(0, 59));
    if (ingreso > new Date(now.getTime() - 3 * 3600000)) ingreso.setTime(now.getTime() - rng.int(4, 30) * 3600000);
    const u = rng.pick(habitadas);
    const r = rng.next();
    let sujeto: SujetoAcceso;
    let nombreR: string;
    let medio: MedioAcceso;
    let doc: string | null = null;
    let visitanteId: string | null = null;
    let personaId: string | null = null;
    let placa: string | null = null;
    let parqueaderoId: string | null = null;
    let obs: string | null = null;
    let unidadId: string | null = u.id;
    let durMin: number;
    if (r < 0.4) {
      const v = rng.pick(visitantes.filter((x) => x.tipo === "VISITA"));
      sujeto = "VISITANTE";
      nombreR = v.nombre;
      doc = v.doc;
      visitanteId = v.id;
      medio = rng.pick(["CODIGO", "QR", "LLAMADA_RESIDENTE", "LLAMADA_RESIDENTE", "MANUAL"] as const);
      durMin = rng.int(40, 300);
      if (rng.chance(0.3)) {
        placa = placaCarro(rng);
        parqueaderoId = rng.pick(parqsVis).id;
      }
    } else if (r < 0.62) {
      sujeto = "DOMICILIARIO";
      nombreR = `${persona(rng, "M").nombres} (${rng.pick(DOMICILIOS)})`;
      medio = "LLAMADA_RESIDENTE";
      durMin = rng.int(3, 15);
    } else if (r < 0.75) {
      const v = rng.pick(visitantes.filter((x) => x.tipo === "PROVEEDOR" || x.tipo === "TECNICO"));
      sujeto = "PROVEEDOR";
      nombreR = v.nombre;
      doc = v.doc;
      visitanteId = v.id;
      medio = "MANUAL";
      obs = `${v.empresa ?? "Proveedor"}: ${rng.pick(["revisión de medidor", "instalación de internet", "mantenimiento de ascensores", "fumigación de zonas comunes", "reparación de citófono"])}`;
      if (rng.chance(0.5)) unidadId = null;
      durMin = rng.int(30, 180);
    } else if (r < 0.88 && empleados.length) {
      const e = rng.pick(empleados);
      sujeto = "EMPLEADO";
      nombreR = nombre(e.persona);
      doc = e.persona.numeroDocumento;
      personaId = e.personaId;
      unidadId = e.unidadId;
      medio = "LISTA_FRECUENTES";
      ingreso.setHours(rng.int(6, 8), rng.int(0, 59));
      durMin = rng.int(420, 560);
    } else {
      const veh = vehiculos.length ? rng.pick(vehiculos) : { placa: placaCarro(rng), unidadId: u.id };
      const un = unidades.find((x) => x.id === veh.unidadId);
      sujeto = "RESIDENTE";
      nombreR = `Vehículo ${veh.placa} (${un?.codigo ?? ""})`;
      placa = veh.placa;
      unidadId = veh.unidadId;
      medio = "MANUAL";
      durMin = rng.int(60, 600);
    }
    const ingId = id();
    // La salida nunca queda en el futuro
    durMin = Math.max(2, Math.min(durMin, Math.floor((now.getTime() - ingreso.getTime()) / 60000) - 5));
    const salidaHora = new Date(ingreso.getTime() + durMin * 60000);
    regs.push({ id: ingId, conjuntoId, tipo: "INGRESO", sujeto, visitanteId, personaId, nombre: nombreR, documento: doc, unidadId, medio, placa, parqueaderoId, hora: ingreso, porteroId: porteroDe(ingreso), observaciones: obs });
    const horas = Math.ceil(durMin / 60);
    const valor = parqueaderoId && durMin > 15 ? Math.min(horas * 2000, 15000) : 0;
    regs.push({
      id: id(),
      conjuntoId,
      tipo: "SALIDA",
      sujeto,
      visitanteId,
      personaId,
      nombre: nombreR,
      documento: doc,
      unidadId,
      medio,
      placa,
      parqueaderoId,
      hora: salidaHora,
      porteroId: porteroDe(salidaHora),
      ingresoId: ingId,
      observaciones: valor ? `Parqueadero: el visitante pagó $ ${valor.toLocaleString("es-CO")} en portería` : null,
    });
  }
  // Anulaciones: 7 registros corregidos (unidad equivocada, doble registro…)
  const anulables = rng.shuffle(regs.filter((x) => x.tipo === "INGRESO")).slice(0, 7);
  for (const a of anulables) {
    const h = new Date((a.hora as Date).getTime() + rng.int(2, 20) * 60000);
    regs.push({
      id: id(),
      conjuntoId,
      tipo: "ANULACION",
      sujeto: a.sujeto,
      nombre: a.nombre,
      documento: a.documento,
      unidadId: a.unidadId,
      visitanteId: a.visitanteId,
      personaId: a.personaId,
      medio: "MANUAL",
      placa: a.placa,
      hora: h,
      porteroId: admin ?? porteroDe(h),
      anulaId: a.id,
      observaciones: rng.pick(["Se registró en la unidad equivocada", "Registro duplicado", "El visitante no ingresó finalmente", "Error al digitar el nombre"]),
    });
  }
  // Visitantes adentro ahora (sin salida): uno lleva más de 8 horas y otro usa parqueadero
  const adentro: Reg[] = [
    { id: id(), conjuntoId, tipo: "INGRESO", sujeto: "VISITANTE", nombre: "Mariana Ortiz Polo", documento: "1045678123", unidadId: t1101.id, medio: "CODIGO", placa: "KTR591", parqueaderoId: parqsVis[0]?.id ?? null, hora: new Date(now.getTime() - 95 * 60000), porteroId: s.users.porteria },
    { id: id(), conjuntoId, tipo: "INGRESO", sujeto: "PROVEEDOR", nombre: "Técnico Claro — Wilson Ariza", documento: "8765432", unidadId: t2302.id, medio: "MANUAL", hora: new Date(now.getTime() - 40 * 60000), porteroId: s.users.porteria, observaciones: "Instalación de fibra óptica" },
    { id: id(), conjuntoId, tipo: "INGRESO", sujeto: "VISITANTE", nombre: "Esteban Rojas Fontalvo", documento: "1002003004", unidadId: rng.pick(habitadas).id, medio: "LLAMADA_RESIDENTE", hora: new Date(now.getTime() - 9.5 * 3600000), porteroId: porteros[1] ?? s.users.porteria },
    { id: id(), conjuntoId, tipo: "INGRESO", sujeto: "DOMICILIARIO", nombre: "Domiciliario Rappi", unidadId: rng.pick(habitadas).id, medio: "LLAMADA_RESIDENTE", hora: new Date(now.getTime() - 6 * 60000), porteroId: s.users.porteria },
  ];
  regs.push(...adentro);
  // Completar hasta 500 con ingresos de vehículos de residentes sin par (entradas/salidas sueltas)
  while (regs.length < 500) {
    const veh = vehiculos.length ? rng.pick(vehiculos) : { placa: placaCarro(rng), unidadId: t1101.id };
    const un = unidades.find((x) => x.id === veh.unidadId);
    const h = en(rng.int(0, 29), rng.int(5, 22), rng.int(0, 59));
    if (h > now) continue;
    regs.push({ id: id(), conjuntoId, tipo: rng.chance(0.5) ? "SALIDA" : "INGRESO", sujeto: "RESIDENTE", nombre: `Vehículo ${veh.placa} (${un?.codigo ?? ""})`, placa: veh.placa, unidadId: veh.unidadId, medio: "MANUAL", hora: h, porteroId: porteroDe(h) });
  }
  await prisma.registroAcceso.createMany({ data: regs.slice(0, 500) });
  if (adentro[0].parqueaderoId) await prisma.parqueadero.update({ where: { id: adentro[0].parqueaderoId }, data: { estado: "OCUPADO" } });

  // ── Autorizaciones ──
  const token = () => crypto.randomBytes(24).toString("base64url");
  const codigos = new Set<string>([CODIGO_DEMO_T1101]);
  const codigo = () => {
    let c = String(rng.int(100000, 999999));
    while (codigos.has(c)) c = String(rng.int(100000, 999999));
    codigos.add(c);
    return c;
  };
  const auts: Prisma.AutorizacionIngresoCreateManyInput[] = [
    {
      conjuntoId,
      unidadId: t1101.id,
      creadaPorId: s.users.propietario,
      nombreVisitante: "Carlos Mendoza",
      documentoVisitante: "80123456",
      tipo: "VISITA",
      fechaInicio: new Date(now.getTime() - 86400000),
      fechaFin: new Date(now.getTime() + 30 * 86400000),
      codigo: CODIGO_DEMO_T1101,
      qrToken: token(),
      usosPermitidos: 20,
      usos: 1,
      placa: "HJK234",
      observaciones: "Primo de Laura. Autorización de demostración.",
    },
    {
      conjuntoId,
      unidadId: t1101.id,
      creadaPorId: s.users.propietario,
      nombreVisitante: "Profesora de piano — Diana Charris",
      tipo: "OTRO",
      fechaInicio: new Date(now.getTime() - 20 * 86400000),
      fechaFin: new Date(now.getTime() + 90 * 86400000),
      recurrente: true,
      diasSemana: [2, 4],
      horaInicio: "15:00",
      horaFin: "18:00",
      codigo: codigo(),
      qrToken: token(),
      usosPermitidos: 0,
      usos: 6,
    },
  ];
  for (let i = 0; i < 18; i++) {
    const u = rng.pick(habitadas);
    const v = rng.pick(visitantes);
    const estado = i < 8 ? "ACTIVA" : i < 12 ? "USADA" : i < 16 ? "VENCIDA" : "REVOCADA";
    const inicio = estado === "ACTIVA" ? new Date(now.getTime() - rng.int(0, 2) * 86400000) : new Date(now.getTime() - rng.int(5, 25) * 86400000);
    const recurrente = i % 4 === 0;
    auts.push({
      conjuntoId,
      unidadId: u.id,
      nombreVisitante: recurrente ? `${rng.pick(["Jardinero", "Entrenador personal", "Cuidadora", "Profesor de inglés"])} — ${v.nombre}` : v.nombre,
      documentoVisitante: v.doc,
      visitanteId: v.id,
      tipo: recurrente ? "OTRO" : v.tipo,
      fechaInicio: inicio,
      fechaFin: estado === "ACTIVA" ? new Date(now.getTime() + rng.int(1, 60) * 86400000) : new Date(inicio.getTime() + 86400000),
      recurrente,
      diasSemana: recurrente ? [1, 3, 5] : [],
      horaInicio: recurrente ? "07:00" : null,
      horaFin: recurrente ? "12:00" : null,
      codigo: codigo(),
      qrToken: token(),
      estado,
      usosPermitidos: recurrente ? 0 : 1,
      usos: estado === "USADA" ? 1 : 0,
    });
  }
  await prisma.autorizacionIngreso.createMany({ data: auts });

  // ── Solicitudes de ingreso históricas ──
  const solicitudes: Prisma.SolicitudIngresoCreateManyInput[] = [];
  const conSolicitud = regs.filter((x) => x.tipo === "INGRESO" && x.medio === "LLAMADA_RESIDENTE" && x.unidadId).slice(0, 8);
  for (const [i, r] of conSolicitud.entries()) {
    const creada = new Date((r.hora as Date).getTime() - 3 * 60000);
    solicitudes.push({
      conjuntoId,
      unidadId: r.unidadId!,
      visitanteNombre: r.nombre,
      tipo: r.sujeto === "DOMICILIARIO" ? "DOMICILIO" : "VISITA",
      estado: i % 3 === 2 ? "DECISION_TELEFONICA" : "AUTORIZADA",
      respondidaEn: new Date(creada.getTime() + 60000),
      porteroId: r.porteroId,
      registroAccesoId: r.id,
      expiraEn: new Date(creada.getTime() + 3 * 60000),
      createdAt: creada,
      deletedAt: new Date(creada.getTime() + 5 * 60000),
    });
  }
  solicitudes.push({ conjuntoId, unidadId: rng.pick(habitadas).id, visitanteNombre: "Vendedor de seguros", tipo: "VISITA", estado: "RECHAZADA", respondidaEn: new Date(now.getTime() - 3 * 86400000), expiraEn: new Date(now.getTime() - 3 * 86400000), createdAt: new Date(now.getTime() - 3 * 86400000 - 60000), deletedAt: new Date(now.getTime() - 3 * 86400000) });
  await prisma.solicitudIngreso.createMany({ data: solicitudes });

  // ── Paquetes (80) ──
  const paquetes: Prisma.PaqueteCreateManyInput[] = [];
  const tipoPaq = (): TipoPaquete => rng.pick(["CAJA", "CAJA", "CAJA", "SOBRE", "SOBRE", "MERCADO", "DOMICILIO", "OTRO"] as const);
  const enPorteria: { unidadId: string; dias: number; horas?: number }[] = [
    { unidadId: t1101.id, dias: 0, horas: 2 },
    { unidadId: t1101.id, dias: 1 },
    { unidadId: rng.pick(habitadas).id, dias: 4 },
    { unidadId: rng.pick(habitadas).id, dias: 6 },
    { unidadId: t2302.id, dias: 0, horas: 5 },
    { unidadId: rng.pick(habitadas).id, dias: 1 },
    { unidadId: rng.pick(habitadas).id, dias: 2 },
    { unidadId: rng.pick(habitadas).id, dias: 0, horas: 1 },
  ];
  for (const p of enPorteria) {
    const llegada = p.dias === 0 ? new Date(now.getTime() - (p.horas ?? 1) * 3600000) : en(p.dias, rng.int(9, 17), rng.int(0, 59));
    paquetes.push({
      conjuntoId,
      unidadId: p.unidadId,
      tipo: tipoPaq(),
      transportadora: rng.pick(TRANSPORTADORAS),
      guia: String(rng.int(100000000, 999999999)),
      destinatario: p.unidadId === t1101.id ? "Laura Gómez" : null,
      llegadaEn: llegada,
      recibidoPorId: porteroDe(llegada),
      notificadoEn: llegada,
      estado: "EN_PORTERIA",
    });
  }
  while (paquetes.length < 80) {
    const u = rng.pick(habitadas);
    const llegada = en(rng.int(1, 30), rng.int(8, 19), rng.int(0, 59));
    const devuelto = paquetes.length % 36 === 0;
    const quienes = residentesPorUnidad.get(u.id) ?? [];
    const quien = quienes.length ? rng.pick(quienes) : null;
    const entregado = new Date(llegada.getTime() + rng.int(1, 30) * 3600000);
    if (entregado > now) continue;
    paquetes.push({
      conjuntoId,
      unidadId: u.id,
      tipo: tipoPaq(),
      transportadora: rng.pick(TRANSPORTADORAS),
      guia: String(rng.int(100000000, 999999999)),
      llegadaEn: llegada,
      recibidoPorId: porteroDe(llegada),
      notificadoEn: llegada,
      estado: devuelto || !quien ? "DEVUELTO" : "ENTREGADO",
      entregadoEn: entregado,
      entregadoPorId: porteroDe(entregado),
      recogidoPor: devuelto || !quien ? null : nombre(quien.persona),
      recogidoPorPersonaId: devuelto || !quien ? null : quien.personaId,
      firmaEntrega: devuelto || !quien ? null : FIRMA,
      observaciones: devuelto || !quien ? "Devuelto: la transportadora lo recogió por dirección errada" : null,
    });
  }
  await prisma.paquete.createMany({ data: paquetes });

  // ── Novedades (20) ──
  const plantillas: [TipoNovedad, Severidad, string][] = [
    ["RUIDO", "MEDIA", "Queja por música a alto volumen después de las 10:00 p. m."],
    ["RUIDO", "BAJA", "Perros ladrando de forma continua en el piso 6."],
    ["DANO", "MEDIA", "Se encontró la luminaria del pasillo del piso 3 fundida."],
    ["DANO", "ALTA", "Fuga de agua en el sótano 1 junto al cuarto de bombas."],
    ["SEGURIDAD", "ALTA", "Persona sospechosa merodeando el cerramiento del parque infantil; se informó a la Policía (cuadrante)."],
    ["SEGURIDAD", "MEDIA", "Puerta peatonal quedó mal cerrada; se revisó el brazo hidráulico."],
    ["INCIDENTE", "BAJA", "Discusión entre residentes por uso del parqueadero de visitantes."],
    ["INCIDENTE", "MEDIA", "Menor se golpeó en el parque infantil; se avisó a los padres."],
    ["SERVICIOS", "MEDIA", "Corte de energía de 20 minutos; la planta eléctrica arrancó correctamente."],
    ["SERVICIOS", "BAJA", "Corte programado de agua informado por Triple A."],
    ["EMERGENCIA", "CRITICA", "Residente de T3 con dolor en el pecho; se llamó ambulancia y se abrió el acceso vehicular."],
    ["OTRO", "BAJA", "Se encontró una billetera en la piscina; quedó en objetos perdidos."],
  ];
  const novedades: Prisma.NovedadCreateManyInput[] = [];
  for (let i = 0; i < 20; i++) {
    const [tipo, severidad, descripcion] = plantillas[i % plantillas.length];
    const f = i === 0 ? new Date(now.getTime() - 50 * 60000) : en(rng.int(0, 29), rng.int(6, 23), rng.int(0, 59));
    if (f > now) f.setTime(now.getTime() - 3600000);
    novedades.push({
      conjuntoId,
      turnoId: turnoDe(f)?.id ?? null,
      tipo,
      severidad,
      descripcion,
      unidadId: rng.chance(0.4) ? rng.pick(habitadas).id : null,
      reportadoPorId: porteroDe(f),
      notificada: severidad === "ALTA" || severidad === "CRITICA",
      createdAt: f,
    });
  }
  await prisma.novedad.createMany({ data: novedades });

  // ── Llaves y elementos (12) con préstamos ──
  const elementos: [string, "LLAVE" | "CONTROL" | "TARJETA" | "RADIO" | "OTRO", string][] = [
    ["Llave salón social", "LLAVE", "L-01"],
    ["Llave gimnasio", "LLAVE", "L-02"],
    ["Llave BBQ", "LLAVE", "L-03"],
    ["Llave cuarto de bombas", "LLAVE", "L-04"],
    ["Llave sala de juntas", "LLAVE", "L-05"],
    ["Llave cancha", "LLAVE", "L-06"],
    ["Control puerta vehicular 1", "CONTROL", "C-01"],
    ["Control puerta vehicular 2", "CONTROL", "C-02"],
    ["Tarjeta de acceso visitantes", "TARJETA", "T-01"],
    ["Radio portería 1", "RADIO", "R-01"],
    ["Radio portería 2", "RADIO", "R-02"],
    ["Linterna recargable", "OTRO", "O-01"],
  ];
  const prestados = new Set([0, 1, 6]);
  for (const [i, [nombreE, tipo, cod]] of elementos.entries()) {
    const e = await prisma.llaveElemento.create({ data: { conjuntoId, nombre: nombreE, tipo, codigo: cod, ubicacion: `Tablero de llaves, gancho ${i + 1}`, estado: prestados.has(i) ? "PRESTADO" : "DISPONIBLE" } });
    const historicos = rng.int(0, 3);
    for (let k = 0; k < historicos; k++) {
      const pe = en(rng.int(2, 25), rng.int(8, 18));
      const u = rng.pick(habitadas);
      await prisma.prestamoElemento.create({ data: { conjuntoId, elementoId: e.id, prestadoA: `Residente ${u.codigo}`, unidadId: u.id, prestadoEn: pe, devueltoEn: new Date(pe.getTime() + rng.int(1, 5) * 3600000), porteroId: porteroDe(pe) } });
    }
    if (prestados.has(i)) {
      const pe = new Date(now.getTime() - rng.int(1, 4) * 3600000);
      const u = i === 0 ? t1101 : rng.pick(habitadas);
      await prisma.prestamoElemento.create({ data: { conjuntoId, elementoId: e.id, prestadoA: i === 6 ? "Mantenimiento — Óscar Ramírez" : `Residente ${u.codigo}`, unidadId: i === 6 ? null : u.id, prestadoEn: pe, porteroId: s.users.porteria, observaciones: i === 0 ? "Reserva del salón social" : null } });
    }
  }

  // ── Alerta de emergencia atendida ──
  const alertaEn = en(5, 21, 40);
  await prisma.alertaEmergencia.create({
    data: { conjuntoId, tipo: "PANICO", origen: "RESIDENTE", unidadId: t2302.id, usuarioId: s.users.residente, mensaje: ALERTA_SEED, alcance: "ADMIN_CONSEJO", estado: "ATENDIDA", atendidaEn: new Date(alertaEn.getTime() + 4 * 60000), atendidaPorId: porteroDe(alertaEn), createdAt: alertaEn },
  });
}
