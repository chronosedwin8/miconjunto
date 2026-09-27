import type { EstadoOrden, OrigenOrden, Prisma, TipoDocProveedor, TipoMantenimiento } from "@prisma/client";
import sharp from "sharp";
import { nextConsecutivo } from "@/lib/consecutivo";
import { saveFile } from "@/lib/storage";
import { prisma, type SeedState } from "./util";

/**
 * Fase 10 · Activos, mantenimiento, proveedores, contratos, presupuesto, gastos y empleados.
 * 12 proveedores (uno vinculado al usuario proveedor@demo.co), 15 activos con planes (incluye legales),
 * ~40 órdenes históricas y actuales, contratos (uno por vencer), presupuesto del año con ~60 gastos
 * y 8 empleados (porteros con foto).
 */
export async function seedMantenimiento(s: SeedState) {
  const { conjuntoId, rng, now } = s;
  const DIA = 86_400_000;
  // Fechas a mediodía de Bogotá (17:00 UTC) para evitar saltos de día.
  const dia = (offset: number) => {
    const d = new Date(now.getTime() + offset * DIA);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 17));
  };
  const anio = now.getFullYear();
  const mesActual = now.getMonth(); // 0-11

  await limpiar(conjuntoId);
  const zonas = await prisma.zonaComun.findMany({ where: { conjuntoId } });
  const zona = (n: string) => zonas.find((z) => z.nombre.toLowerCase().includes(n.toLowerCase()))?.id ?? null;
  const U = s.users;

  // ── Proveedores ──
  type P = { key: string; nit: string; razonSocial: string; categoria: string; contacto: string; tel: string; email: string; tarifas?: string; directorio?: boolean; beneficio?: string; usuarioId?: string };
  const provDefs: P[] = [
    { key: "ascensores", nit: "900456789-1", razonSocial: "Ascensores del Caribe S.A.S.", categoria: "Ascensores", contacto: "Ing. Mauricio Barrios", tel: "3014567890", email: "servicio@ascensorescaribe.co", tarifas: "Mantenimiento preventivo mensual por equipo $ 780.000. Visita correctiva $ 180.000 + repuestos.", usuarioId: U.proveedor },
    { key: "vigilancia", nit: "890112233-4", razonSocial: "Seguridad Atlántico Ltda.", categoria: "Vigilancia", contacto: "Carolina Orozco", tel: "3205551122", email: "comercial@seguridadatlantico.co", tarifas: "Puesto 24 h con arma no letal. Supervisión motorizada." },
    { key: "aseo", nit: "901223344-5", razonSocial: "Aseo Integral del Norte S.A.S.", categoria: "Aseo", contacto: "Luis Fontalvo", tel: "3157778899", email: "operaciones@aseointegral.co", tarifas: "Operaria de aseo 8 h lunes a sábado.", directorio: true, beneficio: "Aseo profundo de apartamentos con 15 % de descuento para residentes" },
    { key: "plomeria", nit: "1045678123", razonSocial: "Plomería Express Barranquilla", categoria: "Plomería", contacto: "Jorge Charris", tel: "3002223344", email: "plomeriaexpress@correo.co", tarifas: "Visita $ 50.000 · destape $ 90.000 · cambio de grifería $ 70.000 (sin materiales).", directorio: true, beneficio: "Visita de diagnóstico gratis para residentes del conjunto" },
    { key: "electricidad", nit: "901334455-6", razonSocial: "Electro Caribe Ingeniería S.A.S.", categoria: "Electricidad", contacto: "Ing. Paola Rojas", tel: "3116665544", email: "proyectos@electrocaribe.co", tarifas: "Hora técnico $ 60.000. Certificado RETIE para reformas.", directorio: true, beneficio: "10 % de descuento en instalaciones y revisiones RETIE" },
    { key: "jardineria", nit: "1043987654", razonSocial: "Jardines La Costa", categoria: "Jardinería", contacto: "Hernán Polo", tel: "3148889900", email: "jardineslacosta@correo.co", tarifas: "Mantenimiento de jardín de balcón $ 45.000.", directorio: true, beneficio: "Primera poda de plantas de balcón sin costo" },
    { key: "piscinas", nit: "900778899-2", razonSocial: "AquaPiscinas Barranquilla S.A.S.", categoria: "Piscinas", contacto: "Diana Mendoza", tel: "3053334455", email: "servicio@aquapiscinas.co", tarifas: "Mantenimiento semanal $ 350.000 · análisis fisicoquímico y microbiológico $ 280.000." },
    { key: "plantas", nit: "900667788-3", razonSocial: "Energía Total Plantas S.A.S.", categoria: "Plantas eléctricas", contacto: "Ing. Rafael Díaz", tel: "3187776655", email: "soporte@energiatotal.co", tarifas: "Mantenimiento preventivo mensual $ 420.000 · mayor anual $ 2.800.000." },
    { key: "extintores", nit: "900998877-0", razonSocial: "Extintores Seguros de la Costa", categoria: "Extintores y seguridad", contacto: "Andrea Barraza", tel: "3024445566", email: "ventas@extintoresseguros.co", tarifas: "Recarga ABC 10 lb $ 38.000 · Solkaflam $ 120.000.", directorio: true, beneficio: "Recarga de extintores de vehículo y cocina a precio de conjunto" },
    { key: "cctv", nit: "901556677-8", razonSocial: "TecnoSeguridad CCTV S.A.S.", categoria: "CCTV y control de acceso", contacto: "Sebastián Moreno", tel: "3172223311", email: "soporte@tecnoseguridad.co", tarifas: "Visita técnica $ 120.000 · cámara IP instalada desde $ 380.000." },
    { key: "fumigacion", nit: "1047123456", razonSocial: "Fumigaciones del Caribe", categoria: "Fumigación", contacto: "Gloria Pardo", tel: "3009998877", email: "fumicaribe@correo.co", tarifas: "Fumigación de apartamento $ 80.000 con certificado.", directorio: true, beneficio: "Precio especial $ 60.000 por apartamento en jornadas del conjunto" },
    { key: "pintura", nit: "1044556677", razonSocial: "Pinturas y Obras JR", categoria: "Pintura y obra civil", contacto: "Julián Rubio", tel: "3131112233", email: "obrasjr@correo.co", tarifas: "Pintura m² $ 12.000 (mano de obra).", directorio: true, beneficio: "Cotización sin costo y 8 % de descuento" },
  ];
  const prov: Record<string, string> = {};
  for (const p of provDefs) {
    const r = await prisma.proveedor.create({
      data: {
        conjuntoId,
        nit: p.nit,
        razonSocial: p.razonSocial,
        categoria: p.categoria,
        contactoNombre: p.contacto,
        telefono: p.tel,
        email: p.email,
        direccion: `${rng.pick(["Cra.", "Calle"])} ${rng.int(30, 98)} # ${rng.int(10, 80)}-${rng.int(10, 99)}, Barranquilla`,
        tarifas: p.tarifas,
        directorioComunitario: !!p.directorio,
        beneficioComunidad: p.beneficio ?? null,
        usuarioId: p.usuarioId ?? null,
      },
    });
    prov[p.key] = r.id;
    // Documentos con vencimientos (algunos vencidos o por vencer)
    const docs: { tipo: TipoDocProveedor; vence: Date | null }[] = [
      { tipo: "RUT", vence: null },
      { tipo: "CAMARA_COMERCIO", vence: dia(rng.int(40, 300)) },
      { tipo: "SEGURIDAD_SOCIAL", vence: dia(rng.int(-3, 30)) },
      { tipo: "POLIZA", vence: dia(rng.int(-20, 330)) },
    ];
    if (["ascensores", "extintores", "plantas", "electricidad"].includes(p.key)) docs.push({ tipo: "CERTIFICACION", vence: dia(p.key === "ascensores" ? 18 : rng.int(60, 400)) });
    await prisma.documentoProveedor.createMany({ data: docs.map((d) => ({ conjuntoId, proveedorId: r.id, tipo: d.tipo, vence: d.vence, archivoUrl: null })) });
  }

  // Calificaciones de residentes para los del directorio (el módulo de directorio las gestiona).
  const calificadores = [U.propietario, U.residente, U.consejo].filter(Boolean);
  const comentarios = ["Muy cumplidos y buen precio.", "Llegaron a tiempo, recomendados.", "Buen trabajo, aunque demoraron en responder.", "Excelente atención.", "Correcto, nada que objetar."];
  for (const p of provDefs.filter((x) => x.directorio)) {
    const puntajes: number[] = [];
    for (const u of calificadores) {
      const puntaje = rng.pick([3, 4, 4, 5, 5]);
      puntajes.push(puntaje);
      const usr = await prisma.usuario.findUnique({ where: { id: u }, select: { nombre: true } });
      await prisma.calificacionProveedor.create({ data: { conjuntoId, proveedorId: prov[p.key], usuarioId: u, usuarioNombre: usr?.nombre.split(" ")[0] ?? null, puntaje, comentario: rng.pick(comentarios) } });
    }
    await prisma.proveedor.update({ where: { id: prov[p.key] }, data: { calificacionPromedio: Math.round((puntajes.reduce((a, b) => a + b, 0) / puntajes.length) * 100) / 100 } });
  }

  // ── Activos ──
  type A = { key: string; nombre: string; categoria: string; ubicacion: string; zona?: string; marca: string; modelo: string; valor: number; compraDias: number; vida: number; prov: string; garantiaDias?: number; estado?: "OPERATIVO" | "EN_MANTENIMIENTO" | "FUERA_SERVICIO" };
  const actDefs: A[] = [
    { key: "asc1", nombre: "Ascensor Torre 1", categoria: "Ascensor", ubicacion: "Torre 1 · foso y cuarto de máquinas", marca: "Schindler", modelo: "3300", valor: 185_000_000, compraDias: 2900, vida: 25, prov: "ascensores" },
    { key: "asc2", nombre: "Ascensor Torre 2", categoria: "Ascensor", ubicacion: "Torre 2 · foso y cuarto de máquinas", marca: "Schindler", modelo: "3300", valor: 185_000_000, compraDias: 2900, vida: 25, prov: "ascensores" },
    { key: "asc3", nombre: "Ascensor Torre 3", categoria: "Ascensor", ubicacion: "Torre 3 · foso y cuarto de máquinas", marca: "Otis", modelo: "Gen2 Life", valor: 198_000_000, compraDias: 1500, vida: 25, prov: "ascensores", estado: "EN_MANTENIMIENTO" },
    { key: "planta", nombre: "Planta eléctrica de emergencia", categoria: "Planta eléctrica", ubicacion: "Sótano · cuarto eléctrico", marca: "Cummins", modelo: "C150 D6 150 kVA", valor: 96_000_000, compraDias: 2600, vida: 20, prov: "plantas" },
    { key: "bomba1", nombre: "Motobomba 1 · equipo hidroneumático", categoria: "Motobomba", ubicacion: "Cuarto de bombas", marca: "Barnes", modelo: "BHV 5 HP", valor: 14_500_000, compraDias: 1800, vida: 10, prov: "plomeria" },
    { key: "bomba2", nombre: "Motobomba 2 · equipo hidroneumático", categoria: "Motobomba", ubicacion: "Cuarto de bombas", marca: "Barnes", modelo: "BHV 5 HP", valor: 14_500_000, compraDias: 1800, vida: 10, prov: "plomeria", estado: "FUERA_SERVICIO" },
    { key: "piscina", nombre: "Sistema de filtración de la piscina", categoria: "Piscina", ubicacion: "Cuarto de máquinas de la piscina", zona: "Piscina", marca: "Hayward", modelo: "Pro Series S244T", valor: 22_000_000, compraDias: 1200, vida: 12, prov: "piscinas", garantiaDias: 25 },
    { key: "cctv", nombre: "Sistema de CCTV (32 cámaras)", categoria: "CCTV", ubicacion: "Portería principal · rack", marca: "Hikvision", modelo: "NVR DS-7732", valor: 38_000_000, compraDias: 700, vida: 8, prov: "cctv", garantiaDias: 60 },
    { key: "porton", nombre: "Portón vehicular principal", categoria: "Portón", ubicacion: "Acceso vehicular", marca: "Motorline", modelo: "Mercury 1000", valor: 12_800_000, compraDias: 1100, vida: 10, prov: "electricidad" },
    { key: "extintores", nombre: "Extintores de áreas comunes (36 unidades)", categoria: "Extintores", ubicacion: "Pasillos, sótanos y zonas comunes", marca: "Varias", modelo: "ABC 10 lb / Solkaflam", valor: 6_800_000, compraDias: 900, vida: 12, prov: "extintores" },
    { key: "incendio", nombre: "Red contra incendios y bomba jockey", categoria: "Red contra incendios", ubicacion: "Cuarto de bombas", marca: "Pedrollo", modelo: "Jockey 2 HP", valor: 28_000_000, compraDias: 2900, vida: 20, prov: "plomeria" },
    { key: "gimnasio", nombre: "Equipos del gimnasio", categoria: "Gimnasio", ubicacion: "Gimnasio", zona: "Gimnasio", marca: "Life Fitness", modelo: "Caminadoras y multifuerza", valor: 45_000_000, compraDias: 800, vida: 8, prov: "electricidad", garantiaDias: 10 },
    { key: "acceso", nombre: "Control de acceso peatonal", categoria: "Control de acceso", ubicacion: "Portería peatonal", marca: "ZKTeco", modelo: "SpeedFace V5L", valor: 9_500_000, compraDias: 400, vida: 6, prov: "cctv", garantiaDias: 330 },
    { key: "citofonia", nombre: "Citofonía IP", categoria: "Citofonía", ubicacion: "Portería y torres", marca: "Fermax", modelo: "Meet", valor: 31_000_000, compraDias: 1300, vida: 10, prov: "cctv" },
    { key: "iluminacion", nombre: "Iluminación LED de zonas comunes", categoria: "Iluminación", ubicacion: "Senderos, parqueaderos y fachadas", marca: "Philips", modelo: "Luminarias LED 50 W", valor: 18_000_000, compraDias: 600, vida: 10, prov: "electricidad" },
  ];
  const act: Record<string, { id: string; nombre: string; zonaId: string | null; proveedorId: string }> = {};
  for (const a of actDefs) {
    const r = await prisma.activo.create({
      data: {
        conjuntoId,
        nombre: a.nombre,
        categoria: a.categoria,
        ubicacion: a.ubicacion,
        zonaId: a.zona ? zona(a.zona) : null,
        marca: a.marca,
        modelo: a.modelo,
        serie: `${a.marca.slice(0, 3).toUpperCase()}-${rng.int(100000, 999999)}`,
        fechaCompra: dia(-a.compraDias),
        valor: a.valor,
        vidaUtilAnios: a.vida,
        proveedorId: prov[a.prov],
        garantiaVence: a.garantiaDias !== undefined ? dia(a.garantiaDias) : dia(-a.compraDias + 365),
        estado: a.estado ?? "OPERATIVO",
        notas: a.key === "bomba2" ? "Rodamiento dañado. En espera de repuesto importado." : null,
      },
    });
    act[a.key] = { id: r.id, nombre: r.nombre, zonaId: r.zonaId, proveedorId: prov[a.prov] };
  }

  // ── Planes de mantenimiento ──
  type PL = { activo: string; nombre: string; tipo: TipoMantenimiento; frec: number; proxima: number; prov?: string; interno?: boolean; costo: number; checklist: string[]; anticip?: number };
  const plDefs: PL[] = [
    ...(["asc1", "asc2", "asc3"] as const).map((k, i) => ({ activo: k, nombre: `Mantenimiento preventivo mensual · ${act[k].nombre}`, tipo: "PREVENTIVO" as const, frec: 30, proxima: [3, 9, -2][i], prov: "ascensores", costo: 780_000, checklist: ["Revisar frenos y poleas", "Lubricar guías", "Probar puertas y sensores", "Verificar alarma y citófono de cabina", "Registrar en bitácora del equipo"] })),
    ...(["asc1", "asc2", "asc3"] as const).map((k, i) => ({ activo: k, nombre: `Certificación anual de ascensor (NTC 5926) · ${act[k].nombre}`, tipo: "LEGAL" as const, frec: 365, proxima: [18, 45, -5][i], prov: "ascensores", costo: 1_450_000, checklist: ["Inspección por organismo acreditado ONAC", "Corregir no conformidades", "Publicar certificado en cabina"], anticip: 30 })),
    { activo: "planta", nombre: "Mantenimiento preventivo de la planta eléctrica", tipo: "PREVENTIVO", frec: 30, proxima: 5, prov: "plantas", costo: 420_000, checklist: ["Arranque en vacío 30 min", "Nivel de aceite y refrigerante", "Estado de baterías", "Transferencia automática"] },
    { activo: "planta", nombre: "Mantenimiento mayor y prueba de carga anual de la planta", tipo: "LEGAL", frec: 365, proxima: 60, prov: "plantas", costo: 2_800_000, checklist: ["Cambio de aceite y filtros", "Prueba con banco de carga", "Informe técnico firmado"], anticip: 21 },
    { activo: "extintores", nombre: "Recarga anual de extintores (NTC 2885)", tipo: "LEGAL", frec: 365, proxima: 12, prov: "extintores", costo: 1_380_000, checklist: ["Retirar extintores por lotes", "Recarga y prueba hidrostática si aplica", "Etiqueta con fecha de recarga", "Reinstalar y señalizar"], anticip: 20 },
    { activo: "piscina", nombre: "Análisis fisicoquímico y microbiológico del agua (Res. 1618 de 2010)", tipo: "LEGAL", frec: 30, proxima: -3, prov: "piscinas", costo: 280_000, checklist: ["Toma de muestras", "Resultado de laboratorio", "Publicar resultado en la piscina"] },
    { activo: "piscina", nombre: "Limpieza y químicos semanales de la piscina", tipo: "PREVENTIVO", frec: 7, proxima: 1, interno: true, costo: 0, checklist: ["Aspirar fondo", "Cepillar paredes", "Medir pH y cloro", "Retrolavar filtro"], anticip: 2 },
    { activo: "bomba1", nombre: "Mantenimiento trimestral de motobombas", tipo: "PREVENTIVO", frec: 90, proxima: 20, prov: "plomeria", costo: 650_000, checklist: ["Revisar sellos mecánicos", "Medir consumo eléctrico", "Revisar presostatos y tanque"] },
    { activo: "incendio", nombre: "Prueba semestral de la red contra incendios", tipo: "PREVENTIVO", frec: 180, proxima: 35, prov: "plomeria", costo: 900_000, checklist: ["Arranque de bomba jockey", "Presión en gabinetes", "Revisar mangueras y válvulas"] },
    { activo: "cctv", nombre: "Mantenimiento trimestral del CCTV", tipo: "PREVENTIVO", frec: 90, proxima: 8, prov: "cctv", costo: 520_000, checklist: ["Limpiar domos y lentes", "Revisar grabación 30 días", "Actualizar firmware"] },
    { activo: "porton", nombre: "Mantenimiento bimestral del portón vehicular", tipo: "PREVENTIVO", frec: 60, proxima: -6, interno: true, costo: 0, checklist: ["Lubricar cremallera", "Probar fotoceldas", "Revisar finales de carrera"] },
    { activo: "gimnasio", nombre: "Mantenimiento de equipos del gimnasio", tipo: "PREVENTIVO", frec: 90, proxima: 25, interno: true, costo: 0, checklist: ["Lubricar bandas", "Ajustar tornillería", "Revisar cables de multifuerza"] },
    { activo: "iluminacion", nombre: "Revisión de iluminación de zonas comunes", tipo: "PREVENTIVO", frec: 30, proxima: 0, interno: true, costo: 0, checklist: ["Recorrido nocturno", "Reemplazar luminarias fundidas", "Revisar fotoceldas"] },
    { activo: "citofonia", nombre: "Revisión semestral de citofonía", tipo: "PREVENTIVO", frec: 180, proxima: 70, prov: "cctv", costo: 350_000, checklist: ["Probar llamadas por torre", "Revisar fuentes"] },
  ];
  const planes: { id: string; def: PL }[] = [];
  for (const p of plDefs) {
    const r = await prisma.planMantenimiento.create({
      data: {
        conjuntoId,
        activoId: act[p.activo].id,
        zonaId: act[p.activo].zonaId,
        nombre: p.nombre,
        tipo: p.tipo,
        frecuenciaDias: p.frec,
        proximaFecha: dia(p.proxima),
        ultimaEjecucion: dia(p.proxima - p.frec),
        responsableId: p.interno ? U.mantenimiento : null,
        proveedorId: p.prov ? prov[p.prov] : null,
        checklist: p.checklist,
        costoEstimado: p.costo || null,
        diasAnticipacion: p.anticip ?? 7,
      },
    });
    planes.push({ id: r.id, def: p });
  }

  // ── Órdenes de trabajo ──
  const nuevaOrden = async (o: {
    origen: OrigenOrden;
    planId?: string | null;
    ticketId?: string | null;
    activo: string;
    titulo: string;
    descripcion?: string;
    proveedorId?: string | null;
    asignadoAId?: string | null;
    fechaProgramada: Date;
    estado: EstadoOrden;
    costo?: number | null;
    checklist?: string[];
    notas?: string;
  }) => {
    const numero = await nextConsecutivo(conjuntoId, "ORDEN", 0);
    const cerrada = o.estado === "COMPLETADA";
    const cierre = cerrada ? new Date(o.fechaProgramada.getTime() + rng.int(-1, 4) * DIA) : null;
    const items = (o.checklist ?? []).map((item) => ({ item, ok: cerrada || (o.estado === "EN_PROCESO" && rng.chance(0.5)) }));
    return prisma.ordenTrabajo.create({
      data: {
        conjuntoId,
        numero,
        origen: o.origen,
        planId: o.planId ?? null,
        ticketId: o.ticketId ?? null,
        activoId: act[o.activo].id,
        zonaId: act[o.activo].zonaId,
        proveedorId: o.proveedorId ?? null,
        asignadoAId: o.asignadoAId ?? null,
        titulo: o.titulo,
        descripcion: o.descripcion ?? null,
        fechaProgramada: o.fechaProgramada,
        fechaInicio: cerrada || o.estado === "EN_PROCESO" ? o.fechaProgramada : null,
        fechaCierre: cierre && cierre > now ? now : cierre,
        costo: o.costo ?? null,
        checklist: items as unknown as Prisma.InputJsonValue,
        evidencias: [],
        estado: o.estado,
        notasCierre: cerrada ? (o.notas ?? "Trabajo realizado según lista de chequeo. Equipo operando normalmente.") : o.estado === "CANCELADA" ? "Cancelada: se reprogramó con el proveedor." : null,
      },
    });
  };

  const ordenesConCosto: { id: string; numero: number; titulo: string; costo: number; fecha: Date; proveedorId: string | null }[] = [];
  // Históricas de los planes (últimos 8 meses) → completadas
  for (const { id, def } of planes) {
    const ciclos = def.frec <= 90 ? 2 : 1;
    for (let c = 1; c <= ciclos; c++) {
      const offset = def.proxima - def.frec * c;
      if (offset > -2) continue;
      if (offset < -240) break;
      const costo = def.costo ? Math.round((def.costo * (0.9 + rng.next() * 0.3)) / 1000) * 1000 : null;
      const o = await nuevaOrden({
        origen: "PLAN",
        planId: id,
        activo: def.activo,
        titulo: def.tipo === "LEGAL" ? `${def.nombre} (legal)` : def.nombre,
        proveedorId: def.prov ? prov[def.prov] : null,
        asignadoAId: def.interno ? U.mantenimiento : null,
        fechaProgramada: dia(offset),
        estado: def.tipo === "PREVENTIVO" && c === 2 && rng.chance(0.15) ? "CANCELADA" : "COMPLETADA",
        costo,
        checklist: def.checklist,
      });
      if (o.estado === "COMPLETADA" && costo) ordenesConCosto.push({ id: o.id, numero: o.numero, titulo: o.titulo, costo, fecha: o.fechaCierre ?? o.fechaProgramada, proveedorId: o.proveedorId });
    }
  }

  // Actuales de los planes (dentro de la anticipación): programadas, en proceso y atrasadas
  // Índices de plDefs: 0-2 preventivo ascensores, 3-5 certificación ascensores, 6-7 planta, 8 extintores,
  // 9 análisis piscina, 10 limpieza piscina, 11 motobombas, 12 red incendios, 13 CCTV, 14 portón, 15 gimnasio, 16 iluminación, 17 citofonía.
  const abiertas: [number, EstadoOrden][] = [
    [2, "EN_PROCESO"], // preventivo ascensor T3 (atrasada)
    [5, "PROGRAMADA"], // certificación ascensor T3 (legal vencida)
    [0, "PROGRAMADA"], // preventivo ascensor T1
    [3, "PROGRAMADA"], // certificación ascensor T1 (anticipación 30 días)
    [6, "PROGRAMADA"], // planta eléctrica
    [8, "PROGRAMADA"], // recarga de extintores
    [9, "PROGRAMADA"], // análisis de agua (atrasada)
    [10, "PROGRAMADA"], // limpieza piscina (mantenimiento interno)
    [14, "PENDIENTE"], // portón (atrasada, mantenimiento interno)
    [16, "EN_PROCESO"], // iluminación (hoy, mantenimiento interno)
  ];
  for (const [i, estado] of abiertas) {
    const { id, def } = planes[i];
    await nuevaOrden({
      origen: "PLAN",
      planId: id,
      activo: def.activo,
      titulo: def.tipo === "LEGAL" ? `${def.nombre} (legal)` : def.nombre,
      descripcion: `Mantenimiento ${def.tipo.toLowerCase()} programado de ${act[def.activo].nombre}.`,
      proveedorId: def.prov ? prov[def.prov] : null,
      asignadoAId: def.interno ? U.mantenimiento : null,
      fechaProgramada: dia(def.proxima),
      estado,
      costo: def.costo || null,
      checklist: def.checklist,
    });
  }

  // Tickets reportados por QR sobre activos y sus órdenes correctivas
  const radicado = async () => `${anio}-${String(await nextConsecutivo(conjuntoId, "RADICADO", anio)).padStart(4, "0")}`;
  const tk = [
    { activo: "bomba2", titulo: "Falla en Motobomba 2 · equipo hidroneumático", desc: "La motobomba 2 hace un ruido metálico fuerte y se apagó. Hay baja presión en pisos altos.", prioridad: "ALTA" as const, dias: -9, estado: "EN_PROCESO" as const, orden: "EN_PROCESO" as EstadoOrden, costo: 1_850_000, prov: "plomeria" },
    { activo: "asc3", titulo: "Falla en Ascensor Torre 3", desc: "El ascensor se detiene entre el piso 5 y 6 y abre la puerta desnivelado.", prioridad: "URGENTE" as const, dias: -4, estado: "ASIGNADO" as const, orden: "PROGRAMADA" as EstadoOrden, costo: null, prov: "ascensores" },
    { activo: "porton", titulo: "Falla en Portón vehicular principal", desc: "El portón no cierra completo, queda abierto unos 30 cm.", prioridad: "MEDIA" as const, dias: -35, estado: "RESUELTO" as const, orden: "COMPLETADA" as EstadoOrden, costo: 320_000, prov: "electricidad" },
    { activo: "iluminacion", titulo: "Falla en Iluminación LED de zonas comunes", desc: "Tres luminarias apagadas en el sendero de la cancha.", prioridad: "MEDIA" as const, dias: -60, estado: "CERRADO" as const, orden: "COMPLETADA" as EstadoOrden, costo: 210_000, prov: null },
    { activo: "gimnasio", titulo: "Falla en Equipos del gimnasio", desc: "La caminadora 2 se frena sola a los pocos minutos.", prioridad: "MEDIA" as const, dias: -2, estado: "ABIERTO" as const, orden: null, costo: null, prov: null },
    { activo: "asc3", titulo: "Falla en Ascensor Torre 3", desc: "Botón del piso 7 no responde.", prioridad: "MEDIA" as const, dias: -80, estado: "CERRADO" as const, orden: "COMPLETADA" as EstadoOrden, costo: 260_000, prov: "ascensores" },
  ];
  const solicitantes = [U.propietario, U.residente, U.consejo, U.porteria];
  for (const t of tk) {
    const creado = dia(t.dias);
    const resuelto = t.estado === "RESUELTO" || t.estado === "CERRADO";
    const ticket = await prisma.ticket.create({
      data: {
        conjuntoId,
        radicado: await radicado(),
        tipo: "DANO_ZONA_COMUN",
        solicitanteId: rng.pick(solicitantes),
        activoId: act[t.activo].id,
        zonaId: act[t.activo].zonaId,
        titulo: t.titulo,
        descripcion: t.desc,
        adjuntos: [],
        prioridad: t.prioridad,
        estado: t.estado,
        origen: "ACTIVO_QR",
        asignadoAId: t.prov ? null : U.mantenimiento,
        proveedorId: t.prov ? prov[t.prov] : null,
        fechaLimite: new Date(creado.getTime() + ({ URGENTE: 1, ALTA: 3, MEDIA: 7, BAJA: 15 } as const)[t.prioridad] * DIA),
        primeraRespuestaEn: t.estado === "ABIERTO" ? null : new Date(creado.getTime() + 3 * 3_600_000),
        resueltoEn: resuelto ? new Date(creado.getTime() + 2 * DIA) : null,
        cerradoEn: t.estado === "CERRADO" ? new Date(creado.getTime() + 4 * DIA) : null,
        calificacion: t.estado === "CERRADO" ? rng.pick([4, 5]) : null,
        createdAt: creado,
      },
    });
    if (!t.orden) continue;
    const o = await nuevaOrden({
      origen: "TICKET",
      ticketId: ticket.id,
      activo: t.activo,
      titulo: `Correctivo: ${t.titulo.replace("Falla en ", "")}`,
      descripcion: t.desc,
      proveedorId: t.prov ? prov[t.prov] : null,
      asignadoAId: t.prov ? null : U.mantenimiento,
      fechaProgramada: new Date(creado.getTime() + DIA),
      estado: t.orden,
      costo: t.costo,
      checklist: ["Diagnóstico", "Reparación", "Prueba de funcionamiento"],
      notas: "Se reemplazó la pieza averiada y se probó el equipo con el residente.",
    });
    if (resuelto) {
      await prisma.comentarioTicket.create({
        data: { conjuntoId, ticketId: ticket.id, tipo: "SISTEMA", contenido: `Orden de trabajo #${o.numero} completada.`, adjuntos: [], data: { ordenId: o.id, numero: o.numero }, createdAt: ticket.resueltoEn ?? creado },
      });
    }
    if (o.estado === "COMPLETADA" && t.costo) ordenesConCosto.push({ id: o.id, numero: o.numero, titulo: o.titulo, costo: t.costo, fecha: o.fechaCierre ?? o.fechaProgramada, proveedorId: o.proveedorId });
  }

  // Manuales (correctivos sin ticket), una cancelada y una para el proveedor esta semana
  await nuevaOrden({ origen: "MANUAL", activo: "bomba2", titulo: "Cambio de rodamientos Motobomba 2 (repuesto importado)", proveedorId: prov.plomeria, fechaProgramada: dia(6), estado: "PROGRAMADA", costo: 2_400_000, checklist: ["Recibir repuesto", "Desmontar motor", "Cambiar rodamientos", "Probar presión"] });
  await nuevaOrden({ origen: "MANUAL", activo: "citofonia", titulo: "Reubicar citófono de la Torre 2", asignadoAId: U.mantenimiento, fechaProgramada: dia(-15), estado: "CANCELADA", checklist: [] });
  await nuevaOrden({ origen: "MANUAL", activo: "asc2", titulo: "Ajuste de nivelación de cabina Torre 2", descripcion: "Residentes reportan desnivel de 2 cm en el piso 1.", proveedorId: prov.ascensores, fechaProgramada: dia(1), estado: "PROGRAMADA", costo: 180_000, checklist: ["Medir desnivel en cada parada", "Ajustar encoder", "Prueba con carga"] });
  const manualCerrada = await nuevaOrden({ origen: "MANUAL", activo: "cctv", titulo: "Instalar 2 cámaras adicionales en parqueadero de visitantes", proveedorId: prov.cctv, fechaProgramada: dia(-50), estado: "COMPLETADA", costo: 1_560_000, checklist: ["Tender cableado", "Instalar cámaras", "Configurar en NVR"] });
  ordenesConCosto.push({ id: manualCerrada.id, numero: manualCerrada.numero, titulo: manualCerrada.titulo, costo: 1_560_000, fecha: manualCerrada.fechaCierre!, proveedorId: manualCerrada.proveedorId });

  // ── Contratos ──
  const contratos = [
    { p: "vigilancia", objeto: "Servicio de vigilancia y seguridad privada 24 horas (3 puestos)", valorMes: 16_800_000, inicio: -270, fin: 95, renov: false, alerta: 60 },
    { p: "aseo", objeto: "Servicio de aseo y limpieza de zonas comunes (4 operarias)", valorMes: 9_600_000, inicio: -200, fin: 165, renov: true, alerta: 30 },
    { p: "ascensores", objeto: "Mantenimiento preventivo y correctivo de 3 ascensores", valorMes: 2_340_000, inicio: -345, fin: 20, renov: false, alerta: 30 },
    { p: "piscinas", objeto: "Mantenimiento de piscina y análisis de agua", valorMes: 1_680_000, inicio: -150, fin: 215, renov: true, alerta: 30 },
    { p: "plantas", objeto: "Mantenimiento de planta eléctrica", valorMes: 420_000, inicio: -380, fin: -15, renov: false, alerta: 30 },
    { p: "jardineria", objeto: "Mantenimiento de jardines y poda", valorMes: 1_200_000, inicio: -500, fin: -135, renov: false, alerta: 30, terminado: true },
  ];
  const hoy = dia(0);
  for (const c of contratos) {
    const inicio = dia(c.inicio);
    const fin = dia(c.fin);
    const dias = Math.round((fin.getTime() - hoy.getTime()) / DIA);
    await prisma.contrato.create({
      data: {
        conjuntoId,
        proveedorId: prov[c.p],
        objeto: c.objeto,
        valor: c.valorMes * 12,
        inicio,
        fin,
        renovacionAutomatica: c.renov,
        diasAlerta: c.alerta,
        estado: c.terminado ? "TERMINADO" : dias < 0 ? "VENCIDO" : dias <= c.alerta ? "POR_VENCER" : "VIGENTE",
      },
    });
  }

  // ── Presupuesto del año y gastos ──
  const cuotas = await prisma.unidad.aggregate({ where: { conjuntoId, deletedAt: null }, _sum: { cuotaAdministracion: true } });
  const adminMes = Math.round(Number(cuotas._sum.cuotaAdministracion ?? 0)) || 42_000_000;
  const presupuesto = await prisma.presupuesto.create({ data: { conjuntoId, anio, estado: "APROBADO", notas: `Aprobado en la asamblea general ordinaria de marzo de ${anio}.` } });
  const R = async (tipo: "INGRESO" | "GASTO", nombre: string, cuenta: string, anual: number) =>
    (await prisma.rubroPresupuesto.create({ data: { conjuntoId, presupuestoId: presupuesto.id, tipo, nombre, cuentaContable: cuenta, valorAnual: Math.round(anual / 1000) * 1000 } })).id;
  await R("INGRESO", "Cuotas de administración", "417005", adminMes * 12);
  await R("INGRESO", "Intereses de mora", "421005", adminMes * 12 * 0.02);
  await R("INGRESO", "Cuotas extraordinarias", "417010", adminMes * 1.5);
  await R("INGRESO", "Multas de convivencia", "425050", 3_600_000);
  await R("INGRESO", "Alquiler de zonas comunes", "415540", 9_600_000);
  await R("INGRESO", "Parqueadero de visitantes", "415545", 6_000_000);
  const g = {
    vigilancia: await R("GASTO", "Vigilancia", "513505", 16_800_000 * 12),
    aseo: await R("GASTO", "Aseo de zonas comunes", "513595", 9_600_000 * 12),
    energia: await R("GASTO", "Energía de zonas comunes", "513530", 4_200_000 * 12),
    agua: await R("GASTO", "Acueducto y alcantarillado", "513525", 2_100_000 * 12),
    ascensores: await R("GASTO", "Mantenimiento de ascensores", "514540", 2_340_000 * 12 + 4_350_000),
    mantenimiento: await R("GASTO", "Mantenimiento y reparaciones generales", "514510", 24_000_000),
    piscina: await R("GASTO", "Mantenimiento de piscina", "514525", 1_680_000 * 12),
    honorarios: await R("GASTO", "Honorarios de administración", "511025", 5_800_000 * 12),
    revisor: await R("GASTO", "Revisoría fiscal", "511010", 1_900_000 * 12),
    seguros: await R("GASTO", "Póliza de áreas comunes", "513025", 14_500_000),
    bancarios: await R("GASTO", "Gastos bancarios", "530505", 2_400_000),
    imprevistos: await R("GASTO", "Fondo de imprevistos (Ley 675, art. 35)", "539595", adminMes * 12 * 0.01),
  };
  const recurrentes: { rubro: string; desc: string; valor: number; prov?: string; cuenta: string }[] = [
    { rubro: g.vigilancia, desc: "Servicio de vigilancia", valor: 16_800_000, prov: "vigilancia", cuenta: "513505" },
    { rubro: g.aseo, desc: "Servicio de aseo", valor: 9_600_000, prov: "aseo", cuenta: "513595" },
    { rubro: g.energia, desc: "Energía zonas comunes (Air-e)", valor: 4_200_000, cuenta: "513530" },
    { rubro: g.agua, desc: "Acueducto y alcantarillado (Triple A)", valor: 2_100_000, cuenta: "513525" },
    { rubro: g.honorarios, desc: "Honorarios de administración", valor: 5_800_000, cuenta: "511025" },
  ];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const gastos: Prisma.GastoCreateManyInput[] = [];
  for (let m = 0; m <= mesActual; m++) {
    for (const r of recurrentes) {
      const fecha = new Date(Date.UTC(anio, m, Math.min(28, 5 + rng.int(0, 10)), 17));
      if (fecha > now) continue;
      const variacion = r.cuenta === "513530" || r.cuenta === "513525" ? 0.85 + rng.next() * 0.3 : 1;
      gastos.push({
        conjuntoId,
        rubroId: r.rubro,
        proveedorId: r.prov ? prov[r.prov] : null,
        fecha,
        descripcion: `${r.desc} · ${MESES[m]}`,
        valor: Math.round((r.valor * variacion) / 100) * 100,
        estado: m === mesActual ? "APROBADO" : "PAGADO",
        aprobadoPorId: U.administrador,
        cuentaContable: null,
      });
    }
  }
  for (const o of ordenesConCosto) {
    const esAsc = /ascensor/i.test(o.titulo);
    const esPiscina = /piscina/i.test(o.titulo);
    const reciente = now.getTime() - o.fecha.getTime() < 12 * DIA;
    if (o.fecha.getFullYear() !== anio) continue;
    gastos.push({
      conjuntoId,
      rubroId: esAsc ? g.ascensores : esPiscina ? g.piscina : g.mantenimiento,
      proveedorId: o.proveedorId,
      ordenTrabajoId: o.id,
      fecha: o.fecha,
      descripcion: `OT #${o.numero}: ${o.titulo}`.slice(0, 200),
      valor: o.costo,
      estado: reciente ? "PENDIENTE_APROBACION" : "PAGADO",
      aprobadoPorId: reciente ? null : U.consejo,
    });
  }
  gastos.push(
    { conjuntoId, rubroId: g.seguros, fecha: new Date(Date.UTC(anio, 1, 10, 17)), descripcion: "Póliza de áreas comunes (vigencia anual)", valor: 14_200_000, estado: "PAGADO", aprobadoPorId: U.consejo },
    { conjuntoId, rubroId: g.mantenimiento, proveedorId: prov.pintura, fecha: dia(-3), descripcion: "Pintura de la fachada interna de la portería", valor: 3_900_000, estado: "PENDIENTE_APROBACION" },
    { conjuntoId, rubroId: g.mantenimiento, proveedorId: prov.fumigacion, fecha: dia(-1), descripcion: "Fumigación de sótanos y cuartos de basura", valor: 780_000, estado: "PENDIENTE_APROBACION" },
    { conjuntoId, rubroId: g.bancarios, fecha: dia(-20), descripcion: "Comisiones y 4 × 1.000 del trimestre", valor: 540_000, estado: "PAGADO", aprobadoPorId: U.administrador },
    { conjuntoId, rubroId: null, fecha: dia(-8), descripcion: "Refrigerios reunión de consejo", valor: 185_000, estado: "RECHAZADO", aprobadoPorId: U.consejo },
  );
  // Máximo 3 pendientes de aprobación, como pide la demo: los demás recientes pasan a aprobados.
  let pendientes = 0;
  for (const x of gastos.sort((a, b) => new Date(b.fecha as Date).getTime() - new Date(a.fecha as Date).getTime())) {
    if (x.estado !== "PENDIENTE_APROBACION") continue;
    pendientes++;
    if (pendientes > 3) {
      x.estado = "APROBADO";
      x.aprobadoPorId = U.consejo;
    }
  }
  await prisma.gasto.createMany({ data: gastos });

  // ── Empleados (porteros con foto para portería) ──
  const foto = async (nombre: string, color: string) => {
    const iniciales = nombre.split(" ").slice(0, 2).map((w) => w[0]).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${color}"/><circle cx="128" cy="100" r="52" fill="#ffffff" fill-opacity="0.85"/><path d="M40 256c8-62 48-92 88-92s80 30 88 92z" fill="#ffffff" fill-opacity="0.85"/><text x="128" y="118" font-family="Arial, sans-serif" font-size="44" font-weight="bold" fill="${color}" text-anchor="middle">${iniciales}</text></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return (await saveFile({ conjuntoId, folder: "empleados", body: png, filename: `${iniciales.toLowerCase()}.png`, mime: "image/png" })).url;
  };
  const empleados = [
    { nombre: "Carlos Andrés Barraza Polo", cargo: "Portero", turno: "Diurno 6:00–14:00", eps: 120, arl: 200, color: "#0f766e" },
    { nombre: "Jhon Jairo Fontalvo De la Hoz", cargo: "Portero", turno: "Tarde 14:00–22:00", eps: 12, arl: 160, color: "#1d4ed8" },
    { nombre: "Luis Eduardo Charris Orozco", cargo: "Portero", turno: "Nocturno 22:00–6:00", eps: -5, arl: 90, color: "#7c3aed" },
    { nombre: "Wilmer Rafael Pardo Mendoza", cargo: "Portero", turno: "Fines de semana", eps: 200, arl: 25, color: "#b45309" },
    { nombre: "Marta Lucía Rojas Barrios", cargo: "Aseo", turno: "Día 7:00–16:00", eps: 150, arl: 150, color: null },
    { nombre: "Yolanda Castro Jiménez", cargo: "Aseo", turno: "Día 7:00–16:00", eps: 80, arl: -12, color: null },
    { nombre: "Hernán Darío Polo Ortiz", cargo: "Jardinería", turno: "Día 7:00–16:00", eps: 60, arl: 60, color: null },
    { nombre: "Óscar Ramírez Díaz", cargo: "Mantenimiento", turno: "Día 7:00–16:00", eps: 110, arl: 110, color: "#be123c" },
  ];
  let doc = 72_150_000;
  for (const e of empleados) {
    doc += rng.int(10_000, 900_000);
    await prisma.empleado.create({
      data: {
        conjuntoId,
        nombre: e.nombre,
        documento: String(doc),
        cargo: e.cargo,
        turno: e.turno,
        telefono: `3${rng.pick(["00", "01", "04", "12", "15", "20"])}${rng.int(1_000_000, 9_999_999)}`,
        fotoUrl: e.color ? await foto(e.nombre, e.color) : null,
        epsVence: dia(e.eps),
        arlVence: dia(e.arl),
        fechaIngreso: dia(-rng.int(90, 2500)),
        documentos: [],
      },
    });
  }
}

/** Idempotencia (scripts/seed-uno.ts): borra solo las filas de este módulo en el conjunto. */
async function limpiar(conjuntoId: string) {
  const activos = (await prisma.activo.findMany({ where: { conjuntoId }, select: { id: true } })).map((a) => a.id);
  const proveedores = (await prisma.proveedor.findMany({ where: { conjuntoId }, select: { id: true } })).map((p) => p.id);
  const planes = (await prisma.planMantenimiento.findMany({ where: { conjuntoId }, select: { id: true } })).map((p) => p.id);
  const tickets = (await prisma.ticket.findMany({ where: { conjuntoId, activoId: { in: activos } }, select: { id: true } })).map((t) => t.id);
  const ordenes = (
    await prisma.ordenTrabajo.findMany({
      where: { conjuntoId, OR: [{ activoId: { in: activos } }, { proveedorId: { in: proveedores } }, { planId: { in: planes } }, { ticketId: { in: tickets } }] },
      select: { id: true },
    })
  ).map((o) => o.id);
  await prisma.gasto.deleteMany({ where: { conjuntoId } });
  await prisma.rubroPresupuesto.deleteMany({ where: { conjuntoId } });
  await prisma.presupuesto.deleteMany({ where: { conjuntoId } });
  await prisma.ordenTrabajo.deleteMany({ where: { id: { in: ordenes } } });
  await prisma.comentarioTicket.deleteMany({ where: { ticketId: { in: tickets } } });
  await prisma.ticket.deleteMany({ where: { id: { in: tickets } } });
  await prisma.planMantenimiento.deleteMany({ where: { conjuntoId } });
  await prisma.documentoProveedor.deleteMany({ where: { conjuntoId } });
  await prisma.calificacionProveedor.deleteMany({ where: { proveedorId: { in: proveedores } } });
  await prisma.contrato.deleteMany({ where: { conjuntoId } });
  await prisma.activo.deleteMany({ where: { conjuntoId } });
  await prisma.proveedor.deleteMany({ where: { conjuntoId, ordenes: { none: {} } } });
  await prisma.empleado.deleteMany({ where: { conjuntoId } });
}
