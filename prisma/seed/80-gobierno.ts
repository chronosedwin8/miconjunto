import crypto from "node:crypto";
import zlib from "node:zlib";
import type { Prisma } from "@prisma/client";
import { prisma, daysAgo, type SeedState } from "./util";
import { systemCtx } from "@/lib/auth/system-ctx";
import { calcularResultado, codigoVerificacion, comprobanteHash, nuevoNonce } from "@/lib/votaciones/calculos";
import { generarTextoActa, plantillaConvocatoria, ordenDelDiaSugerido } from "@/lib/asambleas/service";
import { actaAsambleaPdf } from "@/lib/asambleas/acta";
import { saveFile } from "@/lib/storage";

/**
 * Gobierno: 2 encuestas (abierta con respuestas y cerrada), 1 votación abierta por coeficiente en la
 * que propietario@demo.co (T1-101) aún no vota, 1 asamblea ordinaria finalizada hace ~5 meses (asistencia,
 * poderes, 3 votaciones, acta firmada y publicada, compromisos), 1 asamblea extraordinaria convocada y el
 * consejo de administración con 5 miembros y 3 reuniones.
 */

// ── PNG mínimo para firmas manuscritas de demostración ──
function crc32(buf: Buffer) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(tipo: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(tipo, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function firmaPng(semilla: number) {
  const w = 320;
  const h = 110;
  const px = Buffer.alloc(w * h * 4, 0);
  const pintar = (x: number, y: number) => {
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const xx = Math.round(x + dx);
        const yy = Math.round(y + dy);
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const i = (yy * w + xx) * 4;
        px[i] = 17;
        px[i + 1] = 24;
        px[i + 2] = 39;
        px[i + 3] = 255;
      }
  };
  for (let t = 0; t < 1; t += 0.0008) {
    const x = 20 + t * 270;
    const y = 55 + Math.sin(t * (9 + semilla) * Math.PI) * 28 * (1 - t * 0.5) + Math.cos(t * 23 + semilla) * 6;
    pintar(x, y);
  }
  for (let t = 0; t < 1; t += 0.002) pintar(40 + t * 240, 92 - t * 6);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const num = (d: Prisma.Decimal | number) => Number(d.toString());

/** Idempotencia (scripts/seed-uno.ts): borra antes las filas de gobierno del conjunto. */
async function limpiarGobierno(conjuntoId: string) {
  const w = { conjuntoId };
  await prisma.voto.deleteMany({ where: w });
  await prisma.asistenciaAsamblea.deleteMany({ where: w });
  await prisma.poderAsamblea.deleteMany({ where: w });
  await prisma.cuotaExtraordinaria.updateMany({ where: { ...w, asambleaId: { not: null } }, data: { asambleaId: null } });
  await prisma.votacion.deleteMany({ where: w });
  await prisma.asamblea.deleteMany({ where: w });
  await prisma.respuestaEncuesta.deleteMany({ where: w });
  await prisma.preguntaEncuesta.deleteMany({ where: w });
  await prisma.encuesta.deleteMany({ where: w });
  await prisma.miembroConsejo.deleteMany({ where: w });
  await prisma.reunionConsejo.deleteMany({ where: w });
  const docs = await prisma.documento.findMany({ where: { ...w, categoria: "ACTA", descripcion: { contains: "Código de verificación ACT-" } }, select: { id: true } });
  if (docs.length) {
    const ids = docs.map((d) => d.id);
    await prisma.acuseDocumento.deleteMany({ where: { documentoId: { in: ids } } });
    await prisma.versionDocumento.deleteMany({ where: { documentoId: { in: ids } } });
    await prisma.documento.deleteMany({ where: { id: { in: ids } } });
  }
}

export async function seedGobierno(s: SeedState) {
  const { conjuntoId, rng, now } = s;
  await limpiarGobierno(conjuntoId);
  const ctx = await systemCtx(conjuntoId);
  const unidades = await prisma.unidad.findMany({ where: { conjuntoId, deletedAt: null, coeficiente: { gt: 0 } }, orderBy: { codigo: "asc" } });
  const totalCoef = unidades.reduce((a, u) => a + num(u.coeficiente), 0);
  const byCode = new Map(unidades.map((u) => [u.codigo, u]));
  const t1101 = byCode.get("T1-101")!;
  const t3804 = byCode.get("T3-804")!;
  const propietarios = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO"] }, deletedAt: null },
    include: { persona: true },
    orderBy: { principal: "desc" },
  });
  const duenoDe = new Map<string, (typeof propietarios)[number]["persona"]>();
  for (const v of propietarios) if (!duenoDe.has(v.unidadId)) duenoDe.set(v.unidadId, v.persona);
  const nombreDe = (unidadId: string) => {
    const p = duenoDe.get(unidadId);
    return p ? `${p.nombres} ${p.apellidos}` : "Propietario";
  };

  // ───────────── Encuestas ─────────────
  const abierta = await prisma.encuesta.create({
    data: {
      conjuntoId,
      titulo: "Horario de la piscina y aseo de zonas comunes",
      descripcion: "Queremos ajustar el horario de la piscina para la temporada de vacaciones. Toma menos de un minuto.",
      anonima: false,
      inicio: daysAgo(now, 4, 9),
      fin: new Date(now.getTime() + 6 * 86400000),
      estado: "ABIERTA",
      creadaPorId: s.users.administrador,
    },
  });
  const pAbierta = await Promise.all(
    [
      { tipo: "UNICA" as const, texto: "¿Qué horario prefieres para la piscina los fines de semana?", opciones: ["7:00 a. m. – 6:00 p. m.", "8:00 a. m. – 8:00 p. m.", "9:00 a. m. – 9:00 p. m."] },
      { tipo: "ESCALA" as const, texto: "¿Cómo calificas el aseo de las zonas comunes?", opciones: ["1", "2", "3", "4", "5"] },
      { tipo: "MULTIPLE" as const, texto: "¿Qué zonas usas con más frecuencia?", opciones: ["Piscina", "Gimnasio", "BBQ", "Parque infantil", "Cancha"] },
      { tipo: "TEXTO" as const, texto: "¿Alguna sugerencia para la administración?", opciones: [], requerida: false },
    ].map((p, i) => prisma.preguntaEncuesta.create({ data: { conjuntoId, encuestaId: abierta.id, orden: i + 1, tipo: p.tipo, texto: p.texto, opciones: p.opciones, requerida: p.requerida ?? true } })),
  );
  const sugerencias = ["Más canecas de reciclaje en cada torre", "Arreglar la luz del parqueadero de visitantes", "Clases de natación para niños", "Revisar el ruido de la motobomba en la noche", "Poner sombra en el parque infantil"];
  const respondedores = rng.shuffle(unidades.filter((u) => u.id !== t1101.id)).slice(0, 36);
  for (let i = 0; i < respondedores.length; i++) {
    const u = respondedores[i];
    const r: Record<string, unknown> = {
      [pAbierta[0].id]: rng.pick([...pAbierta[0].opciones, pAbierta[0].opciones[1], pAbierta[0].opciones[1]]),
      [pAbierta[1].id]: rng.pick([3, 4, 4, 4, 5, 5, 2]),
      [pAbierta[2].id]: rng.shuffle(pAbierta[2].opciones).slice(0, rng.int(1, 3)),
    };
    if (rng.chance(0.3)) r[pAbierta[3].id] = rng.pick(sugerencias);
    await prisma.respuestaEncuesta.create({
      data: { conjuntoId, encuestaId: abierta.id, unidadId: u.id, respuestas: r as Prisma.InputJsonValue, votanteHash: `seed:${abierta.id}:${i}`, createdAt: daysAgo(now, rng.int(0, 3), rng.int(7, 21)) },
    });
  }

  const cerrada = await prisma.encuesta.create({
    data: {
      conjuntoId,
      titulo: "Actividades para el Día de los Niños",
      descripcion: "Encuesta anónima para organizar la celebración de octubre.",
      anonima: true,
      inicio: daysAgo(now, 45, 9),
      fin: daysAgo(now, 30, 18),
      estado: "CERRADA",
      creadaPorId: s.users.administrador,
    },
  });
  const pCerrada = await Promise.all(
    [
      { tipo: "UNICA" as const, texto: "¿Qué actividad prefieres?", opciones: ["Show de magia", "Inflables y pintucaritas", "Cine al aire libre", "Búsqueda del tesoro"] },
      { tipo: "ESCALA" as const, texto: "¿Qué tan probable es que participes?", opciones: ["1", "2", "3", "4", "5"] },
    ].map((p, i) => prisma.preguntaEncuesta.create({ data: { conjuntoId, encuestaId: cerrada.id, orden: i + 1, tipo: p.tipo, texto: p.texto, opciones: p.opciones } })),
  );
  for (let i = 0; i < 52; i++) {
    await prisma.respuestaEncuesta.create({
      data: {
        conjuntoId,
        encuestaId: cerrada.id,
        respuestas: { [pCerrada[0].id]: rng.pick([...pCerrada[0].opciones, "Inflables y pintucaritas", "Cine al aire libre"]), [pCerrada[1].id]: rng.pick([3, 4, 5, 5, 5]) } as Prisma.InputJsonValue,
        votanteHash: crypto.createHash("sha256").update(`seed-cerrada-${i}`).digest("hex"),
        createdAt: daysAgo(now, rng.int(31, 44), rng.int(7, 21)),
      },
    });
  }

  // ───────────── Votación abierta (demo) ─────────────
  const fachadas = await prisma.votacion.create({
    data: {
      conjuntoId,
      pregunta: "¿Aprueba pintar las fachadas de las tres torres?",
      descripcion:
        "Se recibieron tres cotizaciones. La recomendada por el consejo es de $ 186.000.000 (pintura elastomérica, garantía de 5 años) y se pagaría con el fondo de imprevistos, sin cuota extraordinaria.",
      opciones: [
        { id: "o1", texto: "Sí, apruebo" },
        { id: "o2", texto: "No apruebo" },
        { id: "o3", texto: "Me abstengo" },
      ],
      tipoMayoria: "SIMPLE",
      ponderacion: "COEFICIENTE",
      quienVota: "PROPIETARIOS",
      secreto: true,
      inicio: daysAgo(now, 3, 8),
      fin: new Date(now.getTime() + 4 * 86400000),
      estado: "ABIERTA",
    },
  });
  const votantes = rng.shuffle(unidades.filter((u) => u.id !== t1101.id && u.id !== t3804.id && duenoDe.has(u.id))).slice(0, 40);
  for (const u of votantes) {
    await prisma.voto.create({
      data: {
        conjuntoId,
        votacionId: fachadas.id,
        unidadId: u.id,
        opcionId: rng.pick(["o1", "o1", "o1", "o2", "o2", "o3"]),
        coeficiente: u.coeficiente,
        comprobanteHash: comprobanteHash(fachadas.id, u.id, nuevoNonce()),
        emitidoEn: daysAgo(now, rng.int(0, 2), rng.int(7, 22)),
      },
    });
  }

  // ───────────── Asamblea ordinaria finalizada (~5 meses) ─────────────
  const fechaOrd = daysAgo(now, 150, 19);
  const puntosBase = ordenDelDiaSugerido("ORDINARIA");
  const ordinaria = await prisma.asamblea.create({
    data: {
      conjuntoId,
      titulo: `Asamblea general ordinaria ${fechaOrd.getFullYear()}`,
      tipo: "ORDINARIA",
      modalidad: "MIXTA",
      fecha: fechaOrd,
      lugar: "Salón social",
      enlace: "https://meet.google.com/abc-defg-hij",
      convocatoriaEnviadaEn: daysAgo(now, 172, 10),
      ordenDelDia: puntosBase as unknown as Prisma.InputJsonValue,
      limitePoderes: 2,
      estado: "FINALIZADA",
      iniciadaEn: new Date(fechaOrd.getTime() + 20 * 60000),
      finalizadaEn: new Date(fechaOrd.getTime() + 3.2 * 3600000),
      presidenteNombre: "Ricardo Charris Orozco",
      secretarioNombre: "Marcela Rodríguez Polo",
    },
  });
  await prisma.asamblea.update({ where: { id: ordinaria.id }, data: { convocatoriaTexto: plantillaConvocatoria("Conjunto Residencial Demo", ordinaria) } });

  // Asistencia ~65 % de coeficientes, con 3 poderes aprobados
  const candidatas = rng.shuffle(unidades.filter((u) => duenoDe.has(u.id)));
  const presentes: typeof unidades = [];
  let coef = 0;
  for (const u of candidatas) {
    if ((coef / totalCoef) * 100 >= 65) break;
    presentes.push(u);
    coef += num(u.coeficiente);
  }
  const conPoder = presentes.slice(0, 3);
  const apoderados = ["Julián Barrios Díaz", "Patricia Ortiz Vargas", "Esteban Mendoza Castro"];
  const poderes = await Promise.all(
    conPoder.map((u, i) =>
      prisma.poderAsamblea.create({
        data: {
          conjuntoId,
          asambleaId: ordinaria.id,
          unidadId: u.id,
          otorganteNombre: nombreDe(u.id),
          apoderadoNombre: apoderados[i],
          apoderadoDocumento: String(72_100_000 + i * 3571),
          estado: "APROBADO",
          createdAt: daysAgo(now, 155 - i, 15),
        },
      }),
    ),
  );
  for (const u of presentes) {
    const poder = poderes.find((p) => p.unidadId === u.id);
    await prisma.asistenciaAsamblea.create({
      data: {
        conjuntoId,
        asambleaId: ordinaria.id,
        unidadId: u.id,
        personaNombre: poder ? poder.apoderadoNombre : nombreDe(u.id),
        tipo: poder ? "PODER" : rng.chance(0.3) ? "VIRTUAL" : "PRESENCIAL",
        coeficiente: u.coeficiente,
        poderId: poder?.id ?? null,
        registradaEn: new Date(fechaOrd.getTime() + rng.int(-30, 25) * 60000),
      },
    });
  }
  const coefPresente = presentes.reduce((a, u) => a + num(u.coeficiente), 0);

  // 3 votaciones cerradas en los puntos 6, 7 y 8
  const puntosVotados = [
    { orden: 6, pregunta: "¿Aprueba los estados financieros del año anterior?", secreto: false, pesos: ["o1", "o1", "o1", "o1", "o2", "o3"] },
    { orden: 7, pregunta: "¿Aprueba el presupuesto de gastos del año con un incremento del 9 %?", secreto: false, pesos: ["o1", "o1", "o1", "o2", "o2", "o3"] },
    { orden: 8, pregunta: "¿Aprueba la plancha única para el consejo de administración?", secreto: true, pesos: ["o1", "o1", "o1", "o1", "o1", "o2", "o3"] },
  ];
  const puntos = puntosBase.map((p) => ({ ...p }));
  for (const pv of puntosVotados) {
    const inicio = new Date(fechaOrd.getTime() + (pv.orden * 18 + 10) * 60000);
    const opciones = [
      { id: "o1", texto: "Sí, apruebo" },
      { id: "o2", texto: "No apruebo" },
      { id: "o3", texto: "Me abstengo" },
    ];
    const v = await prisma.votacion.create({
      data: {
        conjuntoId,
        asambleaId: ordinaria.id,
        puntoOrden: pv.orden,
        pregunta: pv.pregunta,
        opciones,
        tipoMayoria: "SIMPLE",
        ponderacion: "COEFICIENTE",
        quienVota: "PROPIETARIOS",
        secreto: pv.secreto,
        inicio,
        fin: new Date(inicio.getTime() + 12 * 60000),
        estado: "CERRADA",
        codigoActa: codigoVerificacion("VOT"),
      },
    });
    const votos = presentes.filter(() => rng.chance(0.93)).map((u) => ({ unidadId: u.id, coeficiente: num(u.coeficiente), opcionId: rng.pick(pv.pesos) }));
    for (const x of votos) {
      const poder = poderes.find((p) => p.unidadId === x.unidadId);
      await prisma.voto.create({
        data: {
          conjuntoId,
          votacionId: v.id,
          unidadId: x.unidadId,
          opcionId: x.opcionId,
          coeficiente: x.coeficiente,
          porPoder: !!poder,
          votanteNombre: pv.secreto ? null : poder ? poder.apoderadoNombre : nombreDe(x.unidadId),
          comprobanteHash: comprobanteHash(v.id, x.unidadId, nuevoNonce()),
          emitidoEn: new Date(inicio.getTime() + rng.int(1, 11) * 60000),
        },
      });
    }
    const presentesCalc = { coeficiente: Math.round(coefPresente * 1e6) / 1e6, unidades: presentes.length };
    const r = calcularResultado({ opciones, votos, ponderacion: "COEFICIENTE", tipoMayoria: "SIMPLE", totalCoeficientes: totalCoef, totalUnidades: unidades.length, presentes: presentesCalc });
    await prisma.votacion.update({
      where: { id: v.id },
      data: { resultado: { ...r, totalCoeficientes: totalCoef, totalUnidades: unidades.length, presentes: presentesCalc, calculadoEn: new Date(inicio.getTime() + 12 * 60000).toISOString() } as unknown as Prisma.InputJsonValue },
    });
    const p = puntos.find((x) => x.orden === pv.orden);
    if (p) p.votacionId = v.id;
  }
  const compromisos = [
    { id: "c1", tarea: "Contratar la impermeabilización de las cubiertas de la Torre 2", responsable: "Administración", fecha: daysAgo(now, 60).toISOString().slice(0, 10), estado: "CUMPLIDO" },
    { id: "c2", tarea: "Presentar tres cotizaciones para pintura de fachadas", responsable: "Consejo de administración", fecha: daysAgo(now, 20).toISOString().slice(0, 10), estado: "CUMPLIDO" },
    { id: "c3", tarea: "Actualizar el manual de convivencia (mascotas y ruido)", responsable: "Comité de convivencia", fecha: new Date(now.getTime() + 25 * 86400000).toISOString().slice(0, 10), estado: "EN_CURSO" },
    { id: "c4", tarea: "Instalar cámaras en el parqueadero de visitantes", responsable: "Administración", fecha: daysAgo(now, 10).toISOString().slice(0, 10), estado: "PENDIENTE" },
  ];
  await prisma.asamblea.update({ where: { id: ordinaria.id }, data: { ordenDelDia: puntos as unknown as Prisma.InputJsonValue, compromisos } });

  // Acta firmada y publicada en documentos
  const actaTexto = await generarTextoActa(ctx, ordinaria.id);
  const actaCodigo = codigoVerificacion("ACT");
  await prisma.asamblea.update({
    where: { id: ordinaria.id },
    data: { actaTexto, actaCodigo, firmaPresidente: firmaPng(1), firmaSecretario: firmaPng(3), actaPublicadaEn: daysAgo(now, 140, 10) },
  });
  const pdf = await actaAsambleaPdf(ctx, ordinaria.id);
  const saved = await saveFile({ conjuntoId, folder: "actas", body: Buffer.from(pdf.buffer), filename: pdf.nombre, mime: "application/pdf" });
  const carpeta = await prisma.carpetaDocumento.findFirst({ where: { conjuntoId, deletedAt: null, nombre: { contains: "Acta", mode: "insensitive" } } });
  const doc = await prisma.documento.create({
    data: {
      conjuntoId,
      carpetaId: carpeta?.id ?? null,
      titulo: `Acta — ${ordinaria.titulo} (${fechaOrd.toLocaleDateString("es-CO", { timeZone: "America/Bogota" })})`,
      descripcion: `Acta de la asamblea general ordinaria de copropietarios. Código de verificación ${actaCodigo}.`,
      categoria: "ACTA",
      rolesVisibles: [],
      publicado: true,
      versionActual: 1,
      createdAt: daysAgo(now, 140, 10),
    },
  });
  await prisma.versionDocumento.create({
    data: { conjuntoId, documentoId: doc.id, version: 1, archivoUrl: saved.url, nombreArchivo: pdf.nombre, mime: "application/pdf", tamano: pdf.buffer.length, subidoPorId: s.users.administrador, notas: "Acta firmada y publicada", textoExtraido: actaTexto },
  });

  // ───────────── Asamblea extraordinaria convocada (en 20 días) ─────────────
  const fechaExt = new Date(now.getTime() + 20 * 86400000);
  fechaExt.setHours(19, 0, 0, 0);
  const ext = await prisma.asamblea.create({
    data: {
      conjuntoId,
      titulo: "Asamblea extraordinaria: modernización de ascensores",
      tipo: "EXTRAORDINARIA",
      modalidad: "MIXTA",
      fecha: fechaExt,
      lugar: "Salón social",
      enlace: "https://meet.google.com/xyz-uvwx-rst",
      convocatoriaEnviadaEn: daysAgo(now, 1, 10),
      limitePoderes: 2,
      estado: "CONVOCADA",
      ordenDelDia: [
        { orden: 1, titulo: "Verificación del quórum" },
        { orden: 2, titulo: "Elección de presidente y secretario de la asamblea" },
        { orden: 3, titulo: "Presentación de las propuestas de modernización de ascensores" },
        { orden: 4, titulo: "Aprobación de cuota extraordinaria para la modernización" },
        { orden: 5, titulo: "Proposiciones y varios" },
      ],
    },
  });
  const vExt = await prisma.votacion.create({
    data: {
      conjuntoId,
      asambleaId: ext.id,
      puntoOrden: 4,
      pregunta: "¿Aprueba la cuota extraordinaria de $ 420.000.000 en 6 cuotas para modernizar los ascensores?",
      opciones: [
        { id: "o1", texto: "Sí, apruebo" },
        { id: "o2", texto: "No apruebo" },
        { id: "o3", texto: "Me abstengo" },
      ],
      tipoMayoria: "CALIFICADA_70",
      ponderacion: "COEFICIENTE",
      quienVota: "PROPIETARIOS",
      inicio: fechaExt,
      fin: new Date(fechaExt.getTime() + 12 * 3600000),
      estado: "BORRADOR",
    },
  });
  const ordenExt = (ext.ordenDelDia as { orden: number; titulo: string }[]).map((p) => ({ ...p, descripcion: null, votacionId: p.orden === 4 ? vExt.id : null }));
  await prisma.asamblea.update({ where: { id: ext.id }, data: { ordenDelDia: ordenExt, convocatoriaTexto: plantillaConvocatoria("Conjunto Residencial Demo", { ...ext, ordenDelDia: ordenExt }) } });
  // Un poder pendiente de revisión para la extraordinaria
  const otra = unidades.find((u) => u.codigo === "T2-205" && duenoDe.has(u.id)) ?? candidatas[5];
  await prisma.poderAsamblea.create({
    data: { conjuntoId, asambleaId: ext.id, unidadId: otra.id, otorganteNombre: nombreDe(otra.id), apoderadoNombre: "Ricardo Charris Orozco", apoderadoUsuarioId: s.users.consejo, estado: "PENDIENTE" },
  });

  // ───────────── Consejo de administración ─────────────
  const ricardo = await prisma.persona.findFirst({ where: { conjuntoId, usuarioId: s.users.consejo } });
  const inicioPeriodo = fechaOrd;
  const finPeriodo = new Date(fechaOrd.getTime() + 365 * 86400000);
  const otros = rng.shuffle(propietarios.filter((v) => v.persona.id !== ricardo?.id && v.unidadId !== t1101.id)).slice(0, 4);
  const cargos = ["SECRETARIO", "VOCAL", "VOCAL", "SUPLENTE"] as const;
  await prisma.miembroConsejo.create({
    data: { conjuntoId, personaId: ricardo?.id, usuarioId: s.users.consejo, nombre: "Ricardo Charris Orozco", unidadCodigo: "T3-804", cargo: "PRESIDENTE", periodoInicio: inicioPeriodo, periodoFin: finPeriodo },
  });
  const unidadCod = new Map(unidades.map((u) => [u.id, u.codigo]));
  for (let i = 0; i < otros.length; i++) {
    const v = otros[i];
    const nombre = i === 0 ? "Marcela Rodríguez Polo" : `${v.persona.nombres} ${v.persona.apellidos}`;
    await prisma.miembroConsejo.create({
      data: { conjuntoId, personaId: v.persona.id, usuarioId: v.persona.usuarioId, nombre, unidadCodigo: unidadCod.get(v.unidadId) ?? null, cargo: cargos[i], periodoInicio: inicioPeriodo, periodoFin: finPeriodo },
    });
  }
  const miembros = ["Ricardo Charris Orozco", "Marcela Rodríguez Polo", ...otros.slice(1).map((v) => `${v.persona.nombres} ${v.persona.apellidos}`)];
  const reuniones = [
    {
      dias: 120,
      tema: "Instalación del consejo y plan de trabajo",
      decisiones: "Elegir a Ricardo Charris como presidente del consejo\nReuniones ordinarias el primer martes de cada mes\nPriorizar impermeabilización de la Torre 2",
    },
    {
      dias: 65,
      tema: "Seguimiento de cartera y cotizaciones de fachadas",
      decisiones: "Solicitar tres cotizaciones de pintura de fachadas\nAprobar acuerdo de pago para dos unidades en mora mayor a 90 días\nRevisar contrato de vigilancia antes de su renovación",
    },
    {
      dias: 12,
      tema: "Propuesta de pintura de fachadas y convocatoria extraordinaria",
      decisiones: "Recomendar la cotización de pintura elastomérica con garantía de 5 años\nAbrir votación electrónica sobre pintura de fachadas\nConvocar asamblea extraordinaria para modernización de ascensores",
    },
  ];
  for (const r of reuniones) {
    const f = daysAgo(now, r.dias, 19);
    await prisma.reunionConsejo.create({
      data: {
        conjuntoId,
        fecha: f,
        tema: r.tema,
        asistentes: miembros.slice(0, r.dias === 65 ? 4 : 5),
        decisiones: r.decisiones,
        actaTexto: `Siendo las 7:00 p. m. se reunió el consejo de administración con quórum (${r.dias === 65 ? 4 : 5} de 5 miembros) y la administradora. Tema: ${r.tema.toLowerCase()}.\n\nSe revisó el informe de gestión del mes y el estado de la cartera. Después de la discusión se tomaron las decisiones registradas.\n\nSe levantó la sesión a las 9:00 p. m.`,
      },
    });
  }
}
