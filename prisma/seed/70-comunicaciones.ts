import type { CategoriaDocumento, CategoriaPublicacion, EstadoPublicacion, Prisma, TipoEvento } from "@prisma/client";
import sharp from "sharp";
import { saveFile } from "@/lib/storage";
import { pdfSimple, type SeccionPdf } from "@/lib/documentos/pdf-simple";
import { extraerTextoPdf } from "@/lib/documentos/texto-pdf";
import { resumenDe, textoAHtml, type Bloque } from "@/lib/muro/contenido";
import { parseLocal } from "@/lib/format";
import { prisma, daysAgo, type SeedState } from "./util";

/**
 * Fase 8 — Comunicaciones: segmentos, muro (avisos, noticias, eventos, emergencia pasada, clasificados
 * aprobados y pendientes, perdido/encontrado) con reacciones, comentarios y lecturas; campañas de correo
 * con métricas; carpetas y documentos con versiones y acuses; calendario; directorio opt-in.
 */
export async function seedComunicaciones(s: SeedState) {
  const { conjuntoId, rng, now } = s;
  const U = s.users;
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  const torres = await prisma.torre.findMany({ where: { conjuntoId }, orderBy: { nombre: "asc" } });
  const roles = await prisma.rol.findMany({ where: { conjuntoId } });
  const rolId = (clave: string) => roles.find((r) => r.clave === clave)!.id;
  const dia = (n: number, h = 9, m = 0) => {
    const d = new Date(now.getTime() + n * 86_400_000);
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
    return parseLocal(`${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  };

  // ── Idempotencia: borra lo que este módulo creó antes en el conjunto demo ──
  const w = { conjuntoId };
  await prisma.lecturaPublicacion.deleteMany({ where: w });
  await prisma.reaccionPublicacion.deleteMany({ where: w });
  await prisma.comentarioPublicacion.deleteMany({ where: w });
  await prisma.publicacion.deleteMany({ where: w });
  const campAnt = await prisma.campanaCorreo.findMany({ where: { ...w, tipo: "GENERAL" }, select: { id: true } });
  await prisma.correoSaliente.deleteMany({ where: { campanaId: { in: campAnt.map((c) => c.id) } } });
  await prisma.campanaCorreo.deleteMany({ where: { id: { in: campAnt.map((c) => c.id) } } });
  await prisma.segmento.deleteMany({ where: w });
  await prisma.acuseDocumento.deleteMany({ where: w });
  await prisma.versionDocumento.deleteMany({ where: w });
  await prisma.documento.deleteMany({ where: w });
  await prisma.carpetaDocumento.deleteMany({ where: w });
  const evAnt = await prisma.eventoCalendario.findMany({ where: w, select: { titulo: true } });
  await prisma.bloqueoZona.deleteMany({ where: { ...w, motivo: { in: evAnt.map((e) => e.titulo) } } });
  await prisma.eventoCalendario.deleteMany({ where: w });

  // ── Vecinos con cuenta en la app (para reacciones, lecturas y acuses realistas) ──
  const vinculos = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "ARRENDATARIO"] }, principal: true, persona: { usuarioId: null, email: { not: null } } },
    include: { persona: true },
    orderBy: { createdAt: "asc" },
  });
  const vecinos: string[] = [];
  for (const v of rng.shuffle(vinculos).slice(0, 28)) {
    const email = v.persona.email!.toLowerCase();
    if (await prisma.usuario.findUnique({ where: { email } })) continue;
    const u = await prisma.usuario.create({
      data: { email, nombre: `${v.persona.nombres} ${v.persona.apellidos}`, telefono: v.persona.telefono, estado: "ACTIVO", politicaAceptadaEn: daysAgo(now, rng.int(20, 300)), politicaVersion: "1.0" },
    });
    await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId, rolId: rolId(v.tipo === "PROPIETARIO" ? "PROPIETARIO" : "RESIDENTE"), personaId: v.personaId } });
    await prisma.persona.update({ where: { id: v.personaId }, data: { usuarioId: u.id } });
    vecinos.push(u.id);
  }
  // En re-ejecuciones: recupera los vecinos creados antes (cuentas sin contraseña vinculadas a su persona).
  if (!vecinos.length) {
    const previos = await prisma.membresiaConjunto.findMany({ where: { conjuntoId, personaId: { not: null }, usuario: { passwordHash: null }, rol: { clave: { in: ["PROPIETARIO", "RESIDENTE"] } } }, select: { usuarioId: true }, take: 28 });
    vecinos.push(...previos.map((m) => m.usuarioId));
  }
  const residentes = [U.propietario, U.residente, U.consejo, U.conviviente, ...vecinos].filter(Boolean);
  const nombres = new Map((await prisma.usuario.findMany({ where: { id: { in: [...residentes, U.administrador] } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));

  // ── Segmentos guardados ──
  const t1 = torres[0];
  const t2 = torres[1];
  const seg = async (nombre: string, descripcion: string, definicion: object) => prisma.segmento.create({ data: { conjuntoId, nombre, descripcion, definicion } });
  const segT2 = await seg("Torre 2", "Todos los residentes de la Torre 2", { torres: [t2.id] });
  const segMascotas = await seg("Hogares con mascotas", "Unidades con al menos una mascota registrada", { conMascotas: true });
  await seg("Propietarios en mora", "Propietarios de unidades con saldo vencido", { cartera: "EN_MORA", vinculos: ["PROPIETARIO", "COPROPIETARIO"] });
  await seg("Adultos mayores y movilidad reducida", "Hogares que pueden requerir asistencia", { adultosMayores: true });
  await seg("Consejo de administración", "Miembros del consejo", { roles: ["CONSEJO"] });

  // ── Imágenes de ejemplo (banners generados) ──
  const banner = async (titulo: string, c1: string, c2: string, nombre: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="960" height="480" fill="url(#g)"/><circle cx="820" cy="90" r="140" fill="#fff" opacity=".12"/><circle cx="120" cy="420" r="180" fill="#fff" opacity=".08"/><text x="60" y="270" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" fill="#fff">${titulo}</text><text x="60" y="330" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#fff" opacity=".85">${conjunto.nombre}</text></svg>`;
    const body = await sharp(Buffer.from(svg)).png().toBuffer();
    return (await saveFile({ conjuntoId, folder: "muro", body, filename: `${nombre}.png`, mime: "image/png" })).url;
  };
  const imgFamilia = await banner("Día de la familia", "#7c3aed", "#db2777", "dia-familia");
  const imgAscensor = await banner("Mantenimiento de ascensores", "#0f766e", "#0369a1", "ascensores");
  const imgReciclaje = await banner("Jornada de reciclaje", "#15803d", "#65a30d", "reciclaje");
  const imgPiscina = await banner("Horario de piscina", "#0284c7", "#06b6d4", "piscina");
  const imgBici = await banner("Bicicleta rin 20", "#ea580c", "#f59e0b", "bicicleta");
  const imgSofa = await banner("Sofá de 3 puestos", "#57534e", "#a8a29e", "sofa");
  const imgGato = await banner("¿Es tu gato?", "#475569", "#94a3b8", "gato");

  // ── Publicaciones ──
  type Pub = {
    titulo: string;
    categoria: CategoriaPublicacion;
    texto: string;
    extra?: Bloque[];
    dias: number;
    fijada?: boolean;
    autor?: string;
    estado?: EstadoPublicacion;
    segmentoId?: string;
    audiencia?: object;
    precio?: number;
    imagenes?: string[];
    meta?: { subcategoria: string; contacto?: string };
    comentarios?: [string, string, boolean?][];
    venceEn?: Date;
  };
  const pubs: Pub[] = [
    {
      titulo: "Mantenimiento de ascensores de la Torre 2",
      categoria: "AVISO",
      texto: "El próximo martes, de 8:00 a. m. a 12:00 m., se hará el mantenimiento preventivo de los dos ascensores de la Torre 2.\n\nDurante ese horario funcionará un solo ascensor. Si en tu hogar hay una persona con movilidad reducida y necesitas apoyo, avísanos en portería.",
      extra: [{ tipo: "imagen", url: imgAscensor, alt: "Mantenimiento de ascensores" }],
      dias: 1,
      fijada: true,
      segmentoId: segT2.id,
      comentarios: [["residente", "Gracias por avisar con tiempo."]],
    },
    {
      titulo: "Horario de la piscina en temporada de vacaciones",
      categoria: "AVISO",
      texto: "Desde el 1 de octubre la piscina abrirá de martes a domingo de 9:00 a. m. a 7:00 p. m. Los lunes permanece cerrada por mantenimiento.\n\nRecuerda: uso obligatorio de ducha, gorro de baño y los menores de 12 años deben estar acompañados por un adulto.",
      extra: [{ tipo: "imagen", url: imgPiscina, alt: "Piscina" }],
      dias: 3,
      fijada: true,
      comentarios: [["propietario", "¿Los fines de semana hay salvavidas?"], ["administrador", "Sí, sábados y domingos de 10:00 a. m. a 5:00 p. m."]],
    },
    {
      titulo: "Aprovecha el descuento por pronto pago",
      categoria: "AVISO",
      texto: "Paga tu cuota de administración antes del día 5 y obtén el descuento por pronto pago. Puedes pagar en línea desde la app en la opción Pagar, con PSE, Nequi o tarjeta.",
      dias: 6,
    },
    {
      titulo: "Jornada de vacunación para mascotas",
      categoria: "EVENTO",
      texto: "La Secretaría de Salud realizará una jornada gratuita de vacunación antirrábica el sábado en el parque infantil, de 9:00 a. m. a 1:00 p. m. Lleva el carné de vacunas de tu mascota.",
      dias: 2,
      segmentoId: segMascotas.id,
    },
    {
      titulo: "¡Llega el Día de la familia!",
      categoria: "EVENTO",
      texto: "Te invitamos al Día de la familia con juegos para niños, concurso de mascotas disfrazadas, música y venta de comida por parte de los vecinos emprendedores. ¡No faltes!",
      extra: [{ tipo: "imagen", url: imgFamilia, alt: "Día de la familia" }],
      dias: 4,
      comentarios: [["conviviente", "¿Se puede llevar a los perritos?"], ["administrador", "¡Claro! Con traílla y bolsa para recoger."], ["propietario", "Nosotros llevamos postres para vender 😊"]],
    },
    {
      titulo: "Resultados de la jornada de reciclaje",
      categoria: "NOTICIA",
      texto: "Gracias a todos los que participaron: recogimos 420 kg de material aprovechable y 35 kg de aceite de cocina usado. Lo recaudado se destinará a mejorar el parque infantil.",
      extra: [{ tipo: "imagen", url: imgReciclaje, alt: "Reciclaje" }],
      dias: 9,
    },
    {
      titulo: "Nuevo sistema de control de acceso vehicular",
      categoria: "NOTICIA",
      texto: "El consejo aprobó la instalación de lectores de placas en el acceso vehicular. Mientras se instalan, verifica que tus vehículos estén registrados en la app (Mi hogar → Vehículos).",
      dias: 12,
    },
    {
      titulo: "Corte de energía por la tormenta — servicio restablecido",
      categoria: "EMERGENCIA",
      texto: "Por la tormenta de anoche hubo un corte de energía en las torres 1 y 3. La planta eléctrica atendió ascensores y bombas. El servicio fue restablecido a las 11:40 p. m. Si tienes algún daño, repórtalo en PQRS.",
      dias: 21,
      comentarios: [["consejo", "Excelente respuesta del equipo de mantenimiento."]],
    },
    {
      titulo: "Convocatoria a la asamblea ordinaria",
      categoria: "AVISO",
      texto: "Se convoca a la asamblea general ordinaria de copropietarios. El orden del día, el presupuesto y los estados financieros están disponibles en Documentos. Si no puedes asistir, registra tu poder en la app.",
      dias: 15,
    },
    {
      titulo: "Se encontró un gato gris en el parque infantil",
      categoria: "PERDIDO_ENCONTRADO",
      texto: "Gato gris con collar azul, muy manso. Está en portería de la Torre 1. Si es tuyo, acércate con una foto o el carné de vacunas.",
      extra: [{ tipo: "imagen", url: imgGato, alt: "Gato gris" }],
      dias: 1,
    },
    // Clasificados aprobados
    {
      titulo: "Bicicleta rin 20 en buen estado",
      categoria: "CLASIFICADO",
      texto: "Bicicleta para niño de 7 a 10 años, con cambios y frenos revisados. Se entrega con casco.",
      dias: 5,
      autor: "propietario",
      precio: 280000,
      imagenes: [imgBici],
      meta: { subcategoria: "VENTA", contacto: "WhatsApp por la app" },
      comentarios: [["residente", "¿Todavía está disponible?"], ["propietario", "Sí, puedes pasar a verla en la tarde."]],
    },
    {
      titulo: "Clases de inglés para niños y adultos",
      categoria: "CLASIFICADO",
      texto: "Licenciada en idiomas con 10 años de experiencia. Clases personalizadas en tu apartamento o en el coworking. Primera clase gratis para vecinos.",
      dias: 8,
      autor: "consejo",
      precio: 45000,
      meta: { subcategoria: "TUTORIAS", contacto: "Escríbeme por aquí" },
    },
    {
      titulo: "Paseo y cuidado de perros",
      categoria: "CLASIFICADO",
      texto: "Paseos de 45 minutos en la mañana o en la tarde, y cuidado de mascotas en vacaciones. Referencias de vecinos de la Torre 3.",
      dias: 11,
      autor: "residente",
      precio: 15000,
      meta: { subcategoria: "CUIDADO_MASCOTAS" },
      comentarios: [["conviviente", "¡Lo recomiendo! Cuidó a Max en diciembre."], ["propietario", "PUBLICIDAD: visita mi-tienda-rapida.com para ganar dinero", true]],
    },
    // Clasificados pendientes de moderación
    {
      titulo: "Tortas y postres por encargo",
      categoria: "CLASIFICADO",
      texto: "Tortas de cumpleaños, cheesecake y postres de tres leches. Pedidos con dos días de anticipación.",
      dias: 0,
      autor: "conviviente",
      estado: "PENDIENTE_MODERACION",
      precio: 60000,
      meta: { subcategoria: "VENTA" },
    },
    {
      titulo: "Sofá de 3 puestos",
      categoria: "CLASIFICADO",
      texto: "Sofá gris de 3 puestos, 2 años de uso, en muy buen estado. Por trasteo.",
      dias: 0,
      autor: "residente",
      estado: "PENDIENTE_MODERACION",
      precio: 650000,
      imagenes: [imgSofa],
      meta: { subcategoria: "VENTA", contacto: "Torre 2" },
    },
  ];

  const creadas: { id: string; estado: string; dias: number; segmento: boolean }[] = [];
  for (const p of pubs) {
    const bloques: Bloque[] = [{ tipo: "texto", html: textoAHtml(p.texto) }, ...(p.extra ?? [])];
    if (p.meta) bloques.push({ tipo: "meta", subcategoria: p.meta.subcategoria, contacto: p.meta.contacto });
    const creado = dia(-p.dias, rng.int(7, 18), rng.pick([0, 15, 30, 45]));
    const pub = await prisma.publicacion.create({
      data: {
        conjuntoId,
        autorId: U[p.autor ?? "administrador"],
        titulo: p.titulo,
        contenido: bloques as unknown as Prisma.InputJsonValue,
        resumen: resumenDe(bloques),
        categoria: p.categoria,
        fijada: p.fijada ?? false,
        estado: p.estado ?? "PUBLICADA",
        segmentoId: p.segmentoId ?? null,
        precio: p.precio ?? null,
        imagenes: p.imagenes ?? [],
        venceEn: p.categoria === "CLASIFICADO" ? new Date(creado.getTime() + 60 * 86_400_000) : null,
        createdAt: creado,
      },
    });
    creadas.push({ id: pub.id, estado: pub.estado, dias: p.dias, segmento: !!p.segmentoId });
    let t = creado.getTime();
    for (const [quien, texto, oculto] of p.comentarios ?? []) {
      t += rng.int(20, 300) * 60_000;
      await prisma.comentarioPublicacion.create({
        data: { conjuntoId, publicacionId: pub.id, autorId: U[quien], autorNombre: nombres.get(U[quien]) ?? "Vecino", contenido: texto, oculto: !!oculto, moderadoPorId: oculto ? U.administrador : null, createdAt: new Date(t) },
      });
    }
    if (pub.estado === "PUBLICADA") {
      const lectores = rng.shuffle(residentes).slice(0, rng.int(Math.floor(residentes.length * 0.3), residentes.length - 2)).filter((u) => u !== U.propietario || p.dias > 2);
      await prisma.lecturaPublicacion.createMany({ data: lectores.map((u) => ({ conjuntoId, publicacionId: pub.id, usuarioId: u, createdAt: new Date(creado.getTime() + rng.int(10, 2000) * 60_000) })) });
      const reaccionan = rng.shuffle(lectores).slice(0, rng.int(2, Math.max(3, Math.floor(lectores.length * 0.6))));
      await prisma.reaccionPublicacion.createMany({
        data: reaccionan.map((u) => ({ conjuntoId, publicacionId: pub.id, usuarioId: u, tipo: p.categoria === "EMERGENCIA" ? rng.pick(["GRACIAS", "IMPORTANTE"]) : rng.pick(["LIKE", "LIKE", "GRACIAS", "CORAZON"]) })),
      });
    }
  }

  // ── Campañas de correo (generales) con métricas ──
  const campanas: { asunto: string; plantilla: string; dias: number; definicion: { torres?: string[]; vinculos?: string[] } }[] = [
    {
      asunto: "Corte de agua programado el sábado",
      plantilla: "<p>Hola {{nombre}},</p><p>Te informamos que el <strong>sábado de 8:00 a. m. a 2:00 p. m.</strong> se suspenderá el servicio de agua por el lavado de los tanques de reserva.</p><p>Te recomendamos almacenar agua con anticipación.</p><p>Administración</p>",
      dias: 18,
      definicion: {},
    },
    {
      asunto: "Tu estado de cuenta y opciones de pago",
      plantilla: "<p>Hola {{nombre}},</p><p>El saldo de tu unidad {{unidad}} a la fecha es <strong>{{saldo}}</strong>.</p><p>Puedes pagar en línea aquí: {{link_pago}}</p><p>Si ya pagaste, ignora este mensaje.</p>",
      dias: 7,
      definicion: { vinculos: ["PROPIETARIO", "COPROPIETARIO"], torres: [t1.id] },
    },
  ];
  const destinatarios = await prisma.vinculoUnidad.findMany({
    where: { conjuntoId, estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR"] }, persona: { email: { not: null } } },
    include: { persona: true, unidad: true },
  });
  for (const c of campanas) {
    const enviadoEn = dia(-c.dias, 10, 0);
    const lista = destinatarios.filter((d) => (c.definicion.torres ? d.unidad.torreId === t1.id && ["PROPIETARIO", "COPROPIETARIO"].includes(d.tipo) : true));
    const emails = [...new Map(lista.map((d) => [d.persona.email!.toLowerCase(), d])).values()];
    const camp = await prisma.campanaCorreo.create({
      data: { conjuntoId, asunto: c.asunto, plantilla: c.plantilla, tipo: "GENERAL", definicionSegmento: c.definicion, estado: "ENVIADA", programadaPara: enviadoEn, creadaPorId: U.administrador, createdAt: enviadoEn },
    });
    let enviados = 0;
    let aperturas = 0;
    let clics = 0;
    let rebotes = 0;
    const rows = emails.map((d) => {
      const error = rng.chance(0.03);
      const abierto = !error && rng.chance(0.58);
      const clic = abierto && c.plantilla.includes("link_pago") && rng.chance(0.35);
      if (error) rebotes++;
      else enviados++;
      if (abierto) aperturas++;
      if (clic) clics++;
      const t = enviadoEn.getTime() + rng.int(1, 30) * 60_000;
      return {
        conjuntoId,
        campanaId: camp.id,
        para: d.persona.email!.toLowerCase(),
        asunto: c.asunto,
        html: c.plantilla.replace("{{nombre}}", d.persona.nombres).replace("{{unidad}}", d.unidad.codigo),
        estado: error ? ("ERROR" as const) : ("ENVIADO" as const),
        intentos: error ? 5 : 1,
        error: error ? "550 Buzón no existe" : null,
        enviadoEn: error ? null : new Date(t),
        abiertoEn: abierto ? new Date(t + rng.int(5, 3000) * 60_000) : null,
        clicEn: clic ? new Date(t + rng.int(10, 3000) * 60_000) : null,
        createdAt: enviadoEn,
      };
    });
    await prisma.correoSaliente.createMany({ data: rows });
    await prisma.campanaCorreo.update({ where: { id: camp.id }, data: { totalDestinatarios: rows.length, enviados, aperturas, clics, rebotes } });
  }
  await prisma.campanaCorreo.create({
    data: { conjuntoId, asunto: "Invitación al Día de la familia", plantilla: "<p>Hola {{nombre}},</p><p>¡Te esperamos en el Día de la familia! Habrá juegos, música y comida.</p>", tipo: "GENERAL", definicionSegmento: {}, estado: "PROGRAMADA", programadaPara: dia(2, 8, 0), creadaPorId: U.administrador },
  });
  await prisma.campanaCorreo.create({
    data: { conjuntoId, asunto: "Recordatorio: vacunas de mascotas", plantilla: "<p>Hola {{nombre}},</p><p>Recuerda mantener al día el carné de vacunas de tu mascota.</p>", tipo: "GENERAL", segmentoId: segMascotas.id, estado: "BORRADOR", creadaPorId: U.administrador },
  });

  // ── Documentos ──
  const carpeta = async (nombre: string, rolesVisibles: string[] = []) => prisma.carpetaDocumento.create({ data: { conjuntoId, nombre, rolesVisibles } });
  const cReg = await carpeta("Reglamento y manuales");
  const cActas = await carpeta("Actas de asamblea");
  const cFin = await carpeta("Informes financieros");
  const cPol = await carpeta("Pólizas y contratos", ["ADMINISTRADOR", "CONSEJO", "CONTADOR", "REVISOR_FISCAL", "ASISTENTE_ADMIN"]);
  const cCirc = await carpeta("Circulares");

  const enc = `${conjunto.nombre} · NIT ${conjunto.nit ?? ""}`;
  const subirPdf = async (titulo: string, secciones: SeccionPdf[], nombre: string) => {
    const body = pdfSimple({ encabezado: enc, titulo, secciones });
    const saved = await saveFile({ conjuntoId, folder: "documentos", body, filename: `${nombre}.pdf`, mime: "application/pdf" });
    return { archivoUrl: saved.url, nombreArchivo: `${nombre}.pdf`, mime: "application/pdf", tamano: body.length, textoExtraido: extraerTextoPdf(body) };
  };
  type DocSeed = { titulo: string; categoria: CategoriaDocumento; carpetaId: string; descripcion?: string; secciones: SeccionPdf[]; archivo: string; dias: number; requiereAcuse?: boolean; vence?: Date; roles?: string[]; codigo?: string; versiones?: { secciones: SeccionPdf[]; dias: number; notas: string }[] };
  const reglamento: SeccionPdf[] = [
    { titulo: "Capítulo I. Disposiciones generales", parrafos: ["Artículo 1. Objeto. El presente reglamento regula los derechos y obligaciones de los copropietarios y residentes del conjunto, conforme a la Ley 675 de 2001.", "Artículo 2. Bienes comunes. Son bienes comunes las zonas verdes, la piscina, el salón social, el gimnasio, los parqueaderos de visitantes, las circulaciones y los ascensores."] },
    { titulo: "Capítulo II. Convivencia", parrafos: ["Artículo 10. Horario de silencio. Entre las 10:00 p. m. y las 7:00 a. m. de domingo a jueves, y entre la 1:00 a. m. y las 8:00 a. m. los viernes y sábados, se prohíben ruidos que perturben la tranquilidad.", "Artículo 11. Mascotas. Los perros deben circular con traílla por las zonas comunes y sus tenedores deben recoger los excrementos. Los perros de razas potencialmente peligrosas usarán bozal y contarán con póliza (Ley 746 de 2002).", "Artículo 12. Trasteos. Los trasteos se programan con 48 horas de anticipación, de lunes a sábado de 8:00 a. m. a 5:00 p. m., previa presentación del paz y salvo."] },
    { titulo: "Capítulo III. Parqueaderos", parrafos: ["Artículo 20. Cada unidad tiene asignado un parqueadero privado. Los parqueaderos de visitantes se usan máximo 24 horas continuas.", "Artículo 21. Se prohíbe el lavado de vehículos con manguera en los sótanos."] },
    { titulo: "Capítulo IV. Sanciones", parrafos: ["Artículo 30. El incumplimiento del reglamento dará lugar a llamados de atención y multas sucesivas que no podrán exceder, cada una, dos veces el valor de la cuota de administración mensual (artículo 59, Ley 675 de 2001), previo debido proceso."] },
  ];
  const docs: DocSeed[] = [
    {
      titulo: "Reglamento de propiedad horizontal",
      categoria: "REGLAMENTO",
      carpetaId: cReg.id,
      descripcion: "Versión actualizada con la reforma aprobada en la última asamblea.",
      secciones: reglamento.slice(0, 3),
      archivo: "reglamento-propiedad-horizontal-2019",
      dias: 400,
      requiereAcuse: true,
      codigo: "RPH2026ABC",
      versiones: [{ secciones: reglamento, dias: 20, notas: "Reforma aprobada en asamblea: horario de silencio y sanciones" }],
    },
    {
      titulo: "Manual de convivencia",
      categoria: "MANUAL_CONVIVENCIA",
      carpetaId: cReg.id,
      secciones: [
        { titulo: "Uso de zonas comunes", parrafos: ["La piscina funciona de martes a domingo de 9:00 a. m. a 7:00 p. m. El salón social se reserva con 72 horas de anticipación desde la app.", "El gimnasio es para mayores de 15 años; el uso de toalla es obligatorio."] },
        { titulo: "Residuos", parrafos: ["Separa los residuos: bolsa blanca para aprovechables, negra para no aprovechables y verde para orgánicos. El cuarto de basuras abre de 6:00 a. m. a 9:00 p. m."] },
        { titulo: "Visitantes", parrafos: ["Todo visitante debe ser autorizado por el residente. Puedes generar un código QR de invitado desde la app."] },
      ],
      archivo: "manual-de-convivencia",
      dias: 200,
    },
    { titulo: "Acta asamblea ordinaria 2026", categoria: "ACTA", carpetaId: cActas.id, secciones: [{ titulo: "Orden del día", parrafos: ["1. Verificación del quórum (68,4 % de coeficientes). 2. Informe de gestión. 3. Aprobación de estados financieros 2025. 4. Presupuesto 2026. 5. Elección del consejo. 6. Proposiciones y varios."] }, { titulo: "Decisiones", parrafos: ["Se aprobó el presupuesto 2026 con un incremento del 7 % en la cuota de administración y la reforma del reglamento en materia de convivencia."] }], archivo: "acta-asamblea-ordinaria-2026", dias: 170, codigo: "ACTA2026ORD" },
    { titulo: "Acta asamblea extraordinaria 2025", categoria: "ACTA", carpetaId: cActas.id, secciones: [{ titulo: "Decisión", parrafos: ["Se aprobó una cuota extraordinaria para la impermeabilización de cubiertas, distribuida por coeficiente en seis cuotas."] }], archivo: "acta-asamblea-extraordinaria-2025", dias: 330 },
    { titulo: "Presupuesto 2026", categoria: "PRESUPUESTO", carpetaId: cFin.id, secciones: [{ titulo: "Resumen", parrafos: ["Ingresos por cuotas de administración: $ 612.000.000. Gastos de vigilancia: $ 264.000.000. Aseo: $ 96.000.000. Mantenimientos: $ 84.000.000. Servicios públicos zonas comunes: $ 72.000.000. Fondo de imprevistos (1 %): $ 6.120.000."] }], archivo: "presupuesto-2026", dias: 175 },
    { titulo: "Estados financieros a junio de 2026", categoria: "ESTADO_FINANCIERO", carpetaId: cFin.id, secciones: [{ titulo: "Balance", parrafos: ["Activos: $ 318.450.000. Cartera por cobrar: $ 41.200.000 (6,7 %). Fondo de imprevistos: $ 22.300.000."] }], archivo: "estados-financieros-junio-2026", dias: 60 },
    { titulo: "Estados financieros 2025", categoria: "ESTADO_FINANCIERO", carpetaId: cFin.id, secciones: [{ titulo: "Dictamen", parrafos: ["El revisor fiscal emite opinión sin salvedades sobre los estados financieros del año 2025."] }], archivo: "estados-financieros-2025", dias: 180 },
    { titulo: "Póliza de áreas comunes (todo riesgo)", categoria: "POLIZA", carpetaId: cPol.id, descripcion: "Póliza obligatoria de bienes comunes (art. 15, Ley 675 de 2001).", secciones: [{ titulo: "Coberturas", parrafos: ["Incendio y terremoto sobre bienes comunes, responsabilidad civil extracontractual y daños por agua. Valor asegurado: $ 18.500.000.000."] }], archivo: "poliza-areas-comunes", dias: 350, vence: dia(12, 23, 59), roles: [] },
    { titulo: "Contrato de vigilancia 2026", categoria: "CONTRATO", carpetaId: cPol.id, secciones: [{ titulo: "Objeto", parrafos: ["Prestación del servicio de vigilancia 24 horas con 4 guardas por turno y supervisión."] }], archivo: "contrato-vigilancia-2026", dias: 150, vence: dia(95, 23, 59), roles: ["ADMINISTRADOR", "CONSEJO"] },
    { titulo: "Circular 012: uso de parqueaderos de visitantes", categoria: "CIRCULAR", carpetaId: cCirc.id, secciones: [{ parrafos: ["Recordamos que los parqueaderos de visitantes son exclusivos para visitantes y máximo por 24 horas. Los vehículos de residentes serán reportados."] }], archivo: "circular-012-parqueaderos", dias: 40 },
    { titulo: "Circular 013: fumigación y control de plagas", categoria: "CIRCULAR", carpetaId: cCirc.id, secciones: [{ parrafos: ["El próximo viernes se fumigarán sótanos, cuartos de basura y zonas verdes. Mantén a tus mascotas dentro del apartamento de 8:00 a. m. a 12:00 m."] }], archivo: "circular-013-fumigacion", dias: 6, requiereAcuse: true },
    { titulo: "Plan de emergencias y evacuación", categoria: "OTRO", carpetaId: cReg.id, secciones: [{ titulo: "Puntos de encuentro", parrafos: ["Punto 1: parqueadero de visitantes. Punto 2: cancha múltiple. Sigue las indicaciones de los brigadistas."] }], archivo: "plan-emergencias", dias: 90 },
  ];
  const residencialesConAcuse = [U.propietario, U.residente, U.consejo, U.conviviente, ...vecinos];
  for (const d of docs) {
    const v1 = await subirPdf(d.titulo, d.secciones, d.archivo);
    const creado = dia(-d.dias, 10);
    const versionActual = 1 + (d.versiones?.length ?? 0);
    const doc = await prisma.documento.create({
      data: {
        conjuntoId,
        carpetaId: d.carpetaId,
        titulo: d.titulo,
        descripcion: d.descripcion ?? null,
        categoria: d.categoria,
        rolesVisibles: d.roles ?? [],
        requiereAcuse: !!d.requiereAcuse,
        versionActual,
        vence: d.vence ?? null,
        codigoVerificacion: d.codigo ?? null,
        createdAt: creado,
      },
    });
    await prisma.versionDocumento.create({ data: { conjuntoId, documentoId: doc.id, version: 1, ...v1, subidoPorId: U.administrador, createdAt: creado } });
    let n = 1;
    for (const v of d.versiones ?? []) {
      n++;
      const f = await subirPdf(d.titulo, v.secciones, `${d.archivo.replace(/-\d{4}$/, "")}-v${n}`);
      await prisma.versionDocumento.create({ data: { conjuntoId, documentoId: doc.id, version: n, ...f, notas: v.notas, subidoPorId: U.administrador, createdAt: dia(-v.dias, 11) } });
    }
    if (d.requiereAcuse) {
      // Acuses parciales: la mitad confirmó la versión vigente; algunos solo habían leído la anterior.
      const leyeron = rng.shuffle(residencialesConAcuse.filter((u) => u !== U.propietario)).slice(0, Math.floor(residencialesConAcuse.length * 0.45));
      await prisma.acuseDocumento.createMany({ data: leyeron.map((u) => ({ conjuntoId, documentoId: doc.id, usuarioId: u, version: versionActual, leidoEn: dia(-rng.int(0, Math.min(d.dias, 18)), rng.int(7, 21)) })) });
      if (versionActual > 1) {
        const anteriores = residencialesConAcuse.slice(0, 6);
        await prisma.acuseDocumento.createMany({ data: anteriores.map((u) => ({ conjuntoId, documentoId: doc.id, usuarioId: u, version: 1, leidoEn: dia(-rng.int(100, 300), 9) })), skipDuplicates: true });
      }
    }
  }

  // ── Calendario ──
  const zonas = await prisma.zonaComun.findMany({ where: { conjuntoId } });
  const zona = (n: string) => zonas.find((z) => z.nombre === n)?.id ?? null;
  type Ev = { titulo: string; tipo: TipoEvento; d: number; h: number; dur: number; lugar?: string; zona?: string; todoElDia?: boolean; descripcion?: string; oculto?: boolean };
  const eventos: Ev[] = [
    { titulo: "Fumigación de sótanos y zonas verdes", tipo: "FUMIGACION", d: 5, h: 8, dur: 4, lugar: "Sótanos, cuartos de basura y zonas verdes", descripcion: "Mantén a tus mascotas dentro del apartamento durante la jornada." },
    { titulo: "Corte de agua por lavado de tanques", tipo: "CORTE_SERVICIO", d: 9, h: 8, dur: 6, lugar: "Todas las torres", descripcion: "Almacena agua con anticipación." },
    { titulo: "Asamblea general extraordinaria", tipo: "ASAMBLEA", d: 24, h: 18, dur: 3, zona: "Salón social", descripcion: "Tema: aprobación de obras de la fachada. Registra tu poder en la app si no puedes asistir." },
    { titulo: "Día de la familia", tipo: "COMUNITARIO", d: 4, h: 10, dur: 7, zona: "Cancha múltiple", descripcion: "Juegos, música y concurso de mascotas disfrazadas." },
    { titulo: "Mantenimiento de ascensores Torre 2", tipo: "MANTENIMIENTO", d: 1, h: 8, dur: 4, lugar: "Torre 2" },
    { titulo: "Reunión del consejo de administración", tipo: "OTRO", d: 3, h: 19, dur: 2, zona: "Sala de juntas", oculto: true },
    { titulo: "Jornada de vacunación de mascotas", tipo: "COMUNITARIO", d: 2, h: 9, dur: 4, zona: "Parque infantil" },
    { titulo: "Mantenimiento de la piscina", tipo: "MANTENIMIENTO", d: 7, h: 7, dur: 10, zona: "Piscina", descripcion: "La piscina permanecerá cerrada." },
    { titulo: "Corte de energía programado (Air-e)", tipo: "CORTE_SERVICIO", d: 13, h: 7, dur: 5, lugar: "Torres 1 y 3", descripcion: "Mantenimiento de redes del operador de red. Funcionará la planta eléctrica para ascensores." },
    { titulo: "Fiesta de disfraces para niños", tipo: "COMUNITARIO", d: 34, h: 16, dur: 3, zona: "Salón social" },
    { titulo: "Poda de árboles y jardines", tipo: "MANTENIMIENTO", d: 16, h: 8, dur: 8, lugar: "Zonas verdes", todoElDia: true },
    { titulo: "Cine al parque", tipo: "COMUNITARIO", d: 11, h: 19, dur: 2, zona: "Cancha múltiple" },
    { titulo: "Taller de reciclaje y compostaje", tipo: "COMUNITARIO", d: -9, h: 10, dur: 2, zona: "Salón social" },
    { titulo: "Fumigación mensual", tipo: "FUMIGACION", d: -25, h: 8, dur: 4, lugar: "Sótanos" },
    { titulo: "Simulacro de evacuación", tipo: "OTRO", d: 20, h: 10, dur: 1, lugar: "Todas las torres", descripcion: "Participa y sigue a los brigadistas hasta el punto de encuentro." },
  ];
  for (const e of eventos) {
    const inicio = e.todoElDia ? dia(e.d, 0) : dia(e.d, e.h);
    const fin = e.todoElDia ? dia(e.d + 1, 0) : new Date(inicio.getTime() + e.dur * 3_600_000);
    const zonaId = e.zona ? zona(e.zona) : null;
    await prisma.eventoCalendario.create({
      data: { conjuntoId, titulo: e.titulo, tipo: e.tipo, inicio, fin, todoElDia: !!e.todoElDia, lugar: e.lugar ?? null, zonaId, descripcion: e.descripcion ?? null, visibleResidentes: !e.oculto, creadoPorId: U.administrador },
    });
    if (zonaId && (e.tipo === "MANTENIMIENTO" || e.tipo === "FUMIGACION")) {
      await prisma.bloqueoZona.create({ data: { conjuntoId, zonaId, inicio, fin, motivo: e.titulo, tipo: "MANTENIMIENTO" } });
    }
  }

  // Los objetos perdidos y encontrados se siembran en 75-objetos-perdidos.ts.

  // ── Directorio opt-in (~20 personas) ──
  await prisma.persona.updateMany({ where: { conjuntoId }, data: { directorioOptIn: false } });
  const candidatas = await prisma.persona.findMany({
    where: { conjuntoId, fechaNacimiento: { lt: new Date(now.getTime() - 18 * 365 * 86_400_000) }, vinculos: { some: { estado: "ACTIVO", tipo: { in: ["PROPIETARIO", "ARRENDATARIO", "FAMILIAR", "RESIDENTE"] } } }, NOT: { usuarioId: U.propietario } },
    orderBy: { numeroDocumento: "asc" },
  });
  const servicios = ["Clases de inglés", "Repostería por encargo", "Paseo de perros", "Plomería y arreglos locativos", "Asesoría contable y declaración de renta", "Manicure y pedicure a domicilio", "Clases de guitarra", "Fotografía de eventos", "Refuerzo escolar de matemáticas", "Costura y arreglos de ropa"];
  const elegidas = rng.shuffle(candidatas).slice(0, 20);
  for (const [i, p] of elegidas.entries()) {
    const campos = rng.pick([
      ["nombre", "unidad"],
      ["nombre", "unidad", "telefono"],
      ["nombre", "unidad", "whatsapp"],
      ["nombre", "unidad", "telefono", "whatsapp"],
    ]);
    const ofrece = i < 10;
    await prisma.persona.update({
      where: { id: p.id },
      data: { directorioOptIn: true, directorioCampos: ofrece ? [...campos, "servicios"] : campos, serviciosOfrecidos: ofrece ? servicios[i] : p.serviciosOfrecidos },
    });
  }
}
