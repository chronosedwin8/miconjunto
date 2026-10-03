import type { CategoriaObjeto, EstadoObjetoPerdido, EstadoReclamoObjeto, TipoObjetoPerdido } from "@prisma/client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { Bike, Gem, Glasses, Headphones, IdCard, KeyRound, PawPrint, Shirt, Smartphone, ToyBrick, Wallet, type LucideIcon } from "lucide-react";
import { saveFile } from "@/lib/storage";
import { syncPermisos } from "@/lib/conjunto/provision";
import { DEFAULT_ROLE_PERMS, ROLES_BASE } from "@/lib/permisos/catalog";
import { formatoCodigo } from "@/lib/objetos-perdidos/reglas";
import { prisma, type SeedState } from "./util";

/**
 * Objetos perdidos y encontrados (módulo propio): ~14 reportes realistas en distintos estados, con
 * coincidencias perdido ↔ encontrado, un reclamo pendiente, uno aprobado, uno rechazado, una entrega
 * con firma, una donación y un objeto en custodia con el plazo vencido. Idempotente: borra lo suyo.
 * También sincroniza los permisos `objetos.*` en los roles base del conjunto demo.
 */
export async function seedObjetosPerdidos(s: SeedState) {
  const { conjuntoId, now } = s;
  const U = s.users;
  const DIA = 86_400_000;
  const hace = (d: number, h = 10) => {
    const x = new Date(now.getTime() - d * DIA);
    x.setHours(h, (d * 7) % 60, 0, 0);
    return x;
  };

  // ── Permisos del módulo en los roles base (catálogo nuevo) ──
  await syncPermisos(prisma);
  const roles = await prisma.rol.findMany({ where: { conjuntoId, clave: { in: [...ROLES_BASE] }, deletedAt: null } });
  for (const r of roles) {
    const perms = DEFAULT_ROLE_PERMS[r.clave as (typeof ROLES_BASE)[number]].filter((p) => p.startsWith("objetos."));
    if (!perms.length) continue;
    const ya = new Set((await prisma.rolPermiso.findMany({ where: { rolId: r.id, permisoClave: { in: perms } }, select: { permisoClave: true } })).map((x) => x.permisoClave));
    const faltan = perms.filter((p) => !ya.has(p));
    if (faltan.length) {
      await prisma.rolPermiso.createMany({ data: faltan.map((p) => ({ conjuntoId, rolId: r.id, permisoClave: p })), skipDuplicates: true });
      await prisma.rol.update({ where: { id: r.id }, data: { version: { increment: 1 } } });
    }
  }

  // ── Idempotencia ──
  await prisma.reclamoObjeto.deleteMany({ where: { conjuntoId } });
  await prisma.objetoPerdido.deleteMany({ where: { conjuntoId } });
  await prisma.notificacion.deleteMany({ where: { conjuntoId, tipo: "OBJETO_PERDIDO" } });

  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  const zonas = new Map((await prisma.zonaComun.findMany({ where: { conjuntoId }, select: { id: true, nombre: true } })).map((z) => [z.nombre, z.id]));
  const unidadDe = async (userId?: string) => {
    if (!userId) return null;
    const v = await prisma.vinculoUnidad.findFirst({ where: { conjuntoId, estado: "ACTIVO", deletedAt: null, persona: { usuarioId: userId } }, select: { unidadId: true } });
    return v?.unidadId ?? null;
  };
  // Vecinos con cuenta creados por 70-comunicaciones (sin contraseña); si no hay, se usan los demo.
  const vecinos = (
    await prisma.membresiaConjunto.findMany({
      where: { conjuntoId, personaId: { not: null }, usuario: { passwordHash: null }, rol: { clave: { in: ["PROPIETARIO", "RESIDENTE"] } } },
      select: { usuarioId: true, usuario: { select: { nombre: true } } },
      orderBy: { createdAt: "asc" },
      take: 4,
    })
  ).map((m) => ({ id: m.usuarioId, nombre: m.usuario.nombre }));
  const vecino = (i: number) => vecinos[i] ?? { id: U.propietario, nombre: "Laura Gómez Fontalvo" };

  // ── Fotos de ejemplo (ilustraciones generadas con íconos) ──
  const foto = async (Icon: LucideIcon, texto: string, c1: string, c2: string, nombre: string) => {
    const icono = renderToStaticMarkup(createElement(Icon, { size: 220, color: "#ffffff", strokeWidth: 1.4 }));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="960" height="720" fill="url(#g)"/><circle cx="800" cy="110" r="170" fill="#fff" opacity=".10"/><circle cx="130" cy="640" r="210" fill="#fff" opacity=".07"/><g transform="translate(370,170)">${icono}</g><text x="480" y="520" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="700" fill="#fff">${texto}</text><text x="480" y="570" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#fff" opacity=".8">${conjunto.nombre}</text></svg>`;
    const body = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
    return (await saveFile({ conjuntoId, folder: "objetos-perdidos", body, filename: `${nombre}.jpg`, mime: "image/jpeg" })).url;
  };
  const fLlaves = await foto(KeyRound, "Llavero azul con 3 llaves", "#1d4ed8", "#38bdf8", "llavero");
  const fAirpods = await foto(Headphones, "AirPods en estuche blanco", "#475569", "#cbd5e1", "airpods");
  const fChaqueta = await foto(Shirt, "Chaqueta azul talla 8", "#1e3a8a", "#6366f1", "chaqueta");
  const fBici = await foto(Bike, "Bicicleta GW rin 20", "#b91c1c", "#f97316", "bicicleta");
  const fGafas = await foto(Glasses, "Gafas Ray-Ban marco negro", "#18181b", "#71717a", "gafas");
  const fCanela = await foto(PawPrint, "Canela, criolla color miel", "#b45309", "#fbbf24", "canela");
  const fBilletera = await foto(Wallet, "Billetera café de cuero", "#78350f", "#a16207", "billetera");
  const fAnillo = await foto(Gem, "Anillo plateado", "#6b7280", "#e5e7eb", "anillo");
  const fBalon = await foto(ToyBrick, "Balón y juguetes", "#15803d", "#84cc16", "juguetes");
  const fCedula = await foto(IdCard, "Cédula de ciudadanía", "#0f766e", "#14b8a6", "cedula");
  const fCelular = await foto(Smartphone, "Samsung A54 forro negro", "#111827", "#4b5563", "celular");

  // Firma de ejemplo para la entrega.
  const firmaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect width="600" height="180" fill="#fff"/><path d="M40 120 C 80 40, 120 160, 160 90 S 230 40, 260 110 S 330 150, 360 80 C 380 50, 400 140, 440 100 S 520 70, 560 95" stroke="#0a0a0a" stroke-width="3.2" fill="none" stroke-linecap="round"/></svg>`;
  const firmaUrl = (await saveFile({ conjuntoId, folder: "objetos-firmas", body: await sharp(Buffer.from(firmaSvg)).jpeg({ quality: 70 }).toBuffer(), filename: "firma-demo.jpg", mime: "image/jpeg" })).url;

  const anio = now.getFullYear();
  const cfgDias = { custodia: 60, perdido: 90 };
  type Item = {
    key: string;
    tipo: TipoObjetoPerdido;
    categoria: CategoriaObjeto;
    titulo: string;
    descripcion: string;
    rasgos?: string;
    color?: string;
    marca?: string;
    zona?: string;
    lugar?: string;
    d: number;
    quien?: string;
    fotos?: string[];
    contacto?: string;
    recompensa?: string;
    estado: EstadoObjetoPerdido;
    custodia?: string;
    recibe?: string;
    extra?: Record<string, unknown>;
  };
  const items: Item[] = [
    {
      key: "llavesPerdidas",
      tipo: "PERDIDO",
      categoria: "LLAVES",
      titulo: "Llaves con llavero de Millonarios",
      descripcion: "Tres llaves (apartamento, buzón y bodega) con llavero azul del escudo de Millonarios. Creo que se me cayeron saliendo del gimnasio.",
      rasgos: "La llave del buzón tiene cinta roja y viene con un control de parqueadero Hikvision gris.",
      color: "Azul",
      zona: "Gimnasio",
      d: 3,
      quien: "residente",
      recompensa: "$30.000",
      estado: "ABIERTO",
    },
    {
      key: "llavesEncontradas",
      tipo: "ENCONTRADO",
      categoria: "LLAVES",
      titulo: "Llavero azul con 3 llaves",
      descripcion: "Llavero azul de fútbol con tres llaves. Estaba en el piso junto a la entrada del gimnasio.",
      rasgos: "Una llave pequeña tiene cinta roja; trae un control de parqueadero gris.",
      color: "Azul",
      zona: "Gimnasio",
      lugar: "Entrada del gimnasio",
      d: 2,
      quien: "porteria",
      fotos: [fLlaves],
      estado: "EN_CUSTODIA",
      custodia: "Portería principal",
      recibe: "porteria",
    },
    {
      key: "cedula",
      tipo: "PERDIDO",
      categoria: "DOCUMENTOS",
      titulo: "Cédula de ciudadanía",
      descripcion: "Perdí mi cédula amarilla con holograma, probablemente en el parqueadero de visitantes o en el ascensor de la Torre 1.",
      rasgos: "A nombre de Laura Gómez Fontalvo, expedida en Barranquilla.",
      lugar: "Parqueadero de visitantes",
      d: 1,
      quien: "propietario",
      fotos: [fCedula],
      estado: "ABIERTO",
    },
    {
      key: "airpodsEncontrados",
      tipo: "ENCONTRADO",
      categoria: "ELECTRONICO",
      titulo: "AirPods en estuche blanco",
      descripcion: "Audífonos inalámbricos blancos en su estuche, los encontré en una silla de la piscina. Los tengo en mi apartamento.",
      rasgos: "El estuche tiene grabado 'Sofi' con un corazón.",
      color: "Blanco",
      marca: "Apple",
      zona: "Piscina",
      d: 5,
      quien: "consejo",
      fotos: [fAirpods],
      contacto: "Ricardo · T3-804 (WhatsApp)",
      estado: "ABIERTO",
    },
    {
      key: "airpodsPerdidos",
      tipo: "PERDIDO",
      categoria: "ELECTRONICO",
      titulo: "Audífonos AirPods blancos",
      descripcion: "Se me quedaron los AirPods de mi hija en la piscina el fin de semana.",
      rasgos: "El estuche tiene grabado 'Sofi ♥'.",
      color: "Blanco",
      marca: "Apple",
      zona: "Piscina",
      d: 6,
      quien: "conviviente",
      estado: "ABIERTO",
    },
    {
      key: "chaqueta",
      tipo: "ENCONTRADO",
      categoria: "ROPA",
      titulo: "Chaqueta azul de niño talla 8",
      descripcion: "Chaqueta impermeable azul oscuro con capucha, talla 8. Quedó en el salón social después de la fiesta del sábado.",
      rasgos: "Tiene un nombre marcado en la etiqueta interior.",
      color: "Azul",
      marca: "Totto",
      zona: "Salón social",
      d: 20,
      quien: "asistente",
      fotos: [fChaqueta],
      estado: "EN_CUSTODIA",
      custodia: "Administración",
      recibe: "asistente",
    },
    {
      key: "bici",
      tipo: "ENCONTRADO",
      categoria: "BICICLETA",
      titulo: "Bicicleta GW rin 20 roja",
      descripcion: "Bicicleta roja de niño rin 20, sin candado, abandonada en el bicicletero del sótano 1 desde hace semanas.",
      rasgos: "Tiene el sillín rasgado y una calcomanía de Spiderman en el tubo.",
      color: "Rojo",
      marca: "GW",
      lugar: "Bicicletero sótano 1",
      d: 70,
      quien: "porteria2",
      fotos: [fBici],
      estado: "EN_CUSTODIA",
      custodia: "Bodega de portería",
      recibe: "porteria2",
    },
    {
      key: "gafas",
      tipo: "ENCONTRADO",
      categoria: "GAFAS",
      titulo: "Gafas formuladas Ray-Ban marco negro",
      descripcion: "Gafas de marco negro en estuche duro, encontradas en las graderías de la cancha.",
      rasgos: "El estuche dice 'Óptica Colombiana – Centro' y los lentes tienen fórmula alta.",
      color: "Negro",
      marca: "Ray-Ban",
      zona: "Cancha múltiple",
      d: 12,
      quien: "porteria",
      fotos: [fGafas],
      estado: "RECLAMADO",
      custodia: "Portería principal",
      recibe: "porteria",
    },
    {
      key: "canela",
      tipo: "PERDIDO",
      categoria: "MASCOTA",
      titulo: "Perrita criolla 'Canela'",
      descripcion: "Perrita criolla color miel, tamaño mediano, collar rojo con placa. Se salió por la zona BBQ.",
      rasgos: "Tiene una mancha blanca en el pecho y responde al silbido.",
      color: "Café",
      zona: "Zona BBQ",
      d: 25,
      quien: "consejo",
      fotos: [fCanela],
      contacto: "Ricardo · 300 555 1234",
      recompensa: "$100.000",
      estado: "DEVUELTO",
      extra: { disposicion: "¡Apareció! Cerrado por quien lo reportó." },
    },
    {
      key: "billeteraEncontrada",
      tipo: "ENCONTRADO",
      categoria: "BILLETERA",
      titulo: "Billetera café de cuero",
      descripcion: "Billetera café de cuero con documentos y tarjetas, encontrada en el parqueadero de visitantes.",
      rasgos: `Cédula a nombre de ${vecino(0).nombre} y tarjeta débito Bancolombia.`,
      color: "Café",
      lugar: "Parqueadero de visitantes",
      d: 30,
      quien: "porteria",
      fotos: [fBilletera],
      estado: "DEVUELTO",
      custodia: "Portería principal",
      recibe: "porteria",
    },
    {
      key: "billeteraPerdida",
      tipo: "PERDIDO",
      categoria: "BILLETERA",
      titulo: "Billetera café con mis documentos",
      descripcion: "Perdí la billetera café, tenía cédula, pase y tarjetas.",
      rasgos: "Tiene una foto carné de mi hija y una tarjeta Bancolombia.",
      color: "Café",
      d: 31,
      quien: "vecino0",
      estado: "DEVUELTO",
    },
    {
      key: "balon",
      tipo: "ENCONTRADO",
      categoria: "JUGUETE",
      titulo: "Balón de fútbol Golty y juguetes",
      descripcion: "Balón Golty número 4 y dos carritos olvidados en el parque infantil.",
      color: "Blanco",
      marca: "Golty",
      zona: "Parque infantil",
      d: 100,
      quien: "residente",
      fotos: [fBalon],
      estado: "DONADO",
      custodia: "Administración",
      recibe: "asistente",
      extra: { disposicion: "Donado a la Fundación Niños de los Andes junto con otros juguetes sin reclamar (acta 03 de 2026)." },
    },
    {
      key: "anillo",
      tipo: "ENCONTRADO",
      categoria: "JOYA",
      titulo: "Anillo plateado",
      descripcion: "Anillo plateado delgado encontrado en el borde de la piscina durante el aseo.",
      rasgos: "Tiene grabadas las iniciales 'J & M' y la fecha 2015 por dentro.",
      color: "Plateado",
      zona: "Piscina",
      d: 40,
      quien: "porteria2",
      fotos: [fAnillo],
      estado: "EN_CUSTODIA",
      custodia: "Caja fuerte de administración",
      recibe: "administrador",
    },
    {
      key: "celular",
      tipo: "PERDIDO",
      categoria: "CELULAR",
      titulo: "Celular Samsung A54 con forro negro",
      descripcion: "Se me perdió el celular entre la portería y la Torre 2. Está apagado.",
      rasgos: "Fondo de pantalla con foto de un golden retriever; el forro tiene una tarjeta TransMilenio.",
      color: "Negro",
      marca: "Samsung",
      d: 83,
      quien: "vecino1",
      fotos: [fCelular],
      estado: "ABIERTO",
    },
  ];

  const usuario = (k?: string) => (k?.startsWith("vecino") ? vecino(Number(k.slice(6))).id : k ? U[k] : undefined) ?? null;
  const ids: Record<string, string> = {};
  let n = 0;
  for (const it of items) {
    n++;
    const reportadoPorId = usuario(it.quien);
    const creado = hace(it.d, 9 + (n % 9));
    const recibidoEn = it.recibe ? new Date(creado.getTime() + 2 * 3_600_000) : null;
    const venceEn =
      it.tipo === "PERDIDO" && it.estado === "ABIERTO" ? new Date(creado.getTime() + cfgDias.perdido * DIA) : recibidoEn && it.estado === "EN_CUSTODIA" ? new Date(recibidoEn.getTime() + cfgDias.custodia * DIA) : null;
    const o = await prisma.objetoPerdido.create({
      data: {
        conjuntoId,
        codigo: formatoCodigo(anio, n),
        tipo: it.tipo,
        categoria: it.categoria,
        titulo: it.titulo,
        descripcion: it.descripcion,
        rasgosPrivados: it.rasgos ?? null,
        color: it.color ?? null,
        marca: it.marca ?? null,
        lugar: it.lugar ?? it.zona ?? null,
        zonaId: it.zona ? (zonas.get(it.zona) ?? null) : null,
        fecha: creado,
        fotos: it.fotos ?? [],
        fotoUrl: it.fotos?.[0] ?? null,
        reportadoPorId,
        unidadId: await unidadDe(reportadoPorId ?? undefined),
        contacto: it.contacto ?? null,
        recompensa: it.recompensa ?? null,
        estado: it.estado,
        custodia: it.custodia ?? null,
        recibidoPorId: it.recibe ? (U[it.recibe] ?? null) : null,
        recibidoEn,
        venceEn,
        createdAt: creado,
        ...(it.extra ?? {}),
      },
    });
    ids[it.key] = o.id;
  }
  // El consecutivo continúa después de los reportes sembrados.
  await prisma.consecutivo.upsert({
    where: { conjuntoId_tipo_anio: { conjuntoId, tipo: "OBJETO_PERDIDO", anio } },
    create: { id: `c_${conjuntoId}_OBJETO_PERDIDO_${anio}`, conjuntoId, tipo: "OBJETO_PERDIDO", anio, valor: n },
    update: { valor: n },
  });

  // Entrega con documento y firma (billetera) enlazada a su reporte de pérdida.
  const duenoBilletera = vecino(0);
  const entregaEn = hace(29, 18);
  await prisma.objetoPerdido.update({
    where: { id: ids.billeteraEncontrada },
    data: { entregadoA: duenoBilletera.nombre, entregadoDocumento: "72.145.889", entregadoPorId: U.porteria ?? null, entregadoEn: entregaEn, firmaUrl, coincideConId: ids.billeteraPerdida },
  });
  await prisma.objetoPerdido.update({
    where: { id: ids.billeteraPerdida },
    data: { entregadoA: duenoBilletera.nombre, entregadoEn: entregaEn, entregadoPorId: U.porteria ?? null, coincideConId: ids.billeteraEncontrada, disposicion: "Recuperado con el reporte del objeto encontrado" },
  });

  // Reclamos: uno pendiente (llaves), uno aprobado (gafas), uno rechazado (anillo).
  const reclamo = async (objeto: string, quien: string | null | undefined, descripcion: string, estado: EstadoReclamoObjeto, d: number, respuesta?: string) => {
    if (!quien) return;
    await prisma.reclamoObjeto.create({
      data: {
        conjuntoId,
        objetoId: ids[objeto],
        usuarioId: quien,
        unidadId: await unidadDe(quien),
        descripcion,
        estado,
        respuesta: respuesta ?? null,
        resueltoPorId: estado === "PENDIENTE" ? null : (U.administrador ?? null),
        resueltoEn: estado === "PENDIENTE" ? null : hace(d - 1, 15),
        createdAt: hace(d, 11),
      },
    });
  };
  await reclamo("llavesEncontradas", U.residente, "Son mis llaves: el llavero es de Millonarios, la llave pequeña del buzón tiene cinta roja y tiene el control del parqueadero.", "PENDIENTE", 1);
  await reclamo("gafas", vecino(2).id, "Son mis gafas, marco negro Ray-Ban con fórmula alta. El estuche es de Óptica Colombiana del Centro.", "APROBADO", 10, "Los detalles coinciden. Recógelas en portería con tu cédula.");
  await reclamo("anillo", vecino(3).id, "Creo que es el anillo de mi esposa, es plateado y sencillo.", "RECHAZADO", 35, "La descripción no coincide con los detalles del anillo.");

  // Notificaciones de ejemplo.
  const notif = async (usuarioId: string | undefined, titulo: string, cuerpo: string, enlace: string, d: number, leida = false) => {
    if (!usuarioId) return;
    await prisma.notificacion.create({ data: { conjuntoId, usuarioId, titulo, cuerpo, enlace, tipo: "OBJETO_PERDIDO", canales: ["app", "push"], leida, leidaEn: leida ? hace(d - 0.1) : null, createdAt: hace(d, 12) } });
  };
  await notif(U.residente, "¿Es tuyo? Encontraron: Llavero azul con 3 llaves", "Se parece a lo que reportaste (Llaves con llavero de Millonarios). Revísalo y, si es tuyo, reclámalo.", `/objetos-perdidos/${ids.llavesEncontradas}`, 2, true);
  await notif(U.conviviente, "¿Es tuyo? Encontraron: AirPods en estuche blanco", "Se parece a lo que reportaste (Audífonos AirPods blancos). Revísalo y, si es tuyo, reclámalo.", `/objetos-perdidos/${ids.airpodsEncontrados}`, 5);
  for (const k of ["administrador", "porteria"]) {
    await notif(U[k], `Reclamo de objeto ${formatoCodigo(anio, 2)}`, `Andrés Pérez Rojas dice que Llavero azul con 3 llaves es suyo. Verifica los rasgos antes de aprobar.`, `/objetos-perdidos/${ids.llavesEncontradas}`, 1);
  }
}
