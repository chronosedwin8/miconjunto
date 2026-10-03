import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { globalSearch } from "@/lib/buscar/service";
import { keyFromUrl, storage } from "@/lib/storage";
import { nowBogota } from "@/lib/format";
import {
  aPublico,
  coincidenciasDe,
  disponerObjeto,
  entregarObjeto,
  listarObjetos,
  marcarAparecio,
  obtenerObjeto,
  procesarVencimientos,
  reclamarObjeto,
  recibirEnCustodia,
  reportarObjeto,
  resolverReclamo,
} from "@/lib/objetos-perdidos/service";
import { makeConjunto, makeUnidades } from "../helpers/db";
import { makeUsuario } from "../helpers/usuarios";

/** Firma mínima válida (PNG 1×1 transparente). */
const FIRMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const SECRETO = "cinta roja en la llave del buzón";

let admin: Ctx;
let porteria: Ctx;
let dueno: Ctx; // pierde las llaves (unidad 1)
let vecina: Ctx; // encuentra las llaves (unidad 2)
let otro: Ctx; // otro residente (unidad 3)
const archivos: string[] = [];

beforeAll(async () => {
  const { ctx: sys, roles } = await makeConjunto("Objetos");
  const [u1, u2, u3] = await makeUnidades(sys.conjuntoId, 3);
  admin = await makeUsuario(sys.conjuntoId, roles.ADMINISTRADOR);
  porteria = await makeUsuario(sys.conjuntoId, roles.PORTERIA);
  dueno = await makeUsuario(sys.conjuntoId, roles.RESIDENTE, u1.id, "ARRENDATARIO");
  vecina = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u2.id);
  otro = await makeUsuario(sys.conjuntoId, roles.PROPIETARIO, u3.id);
});

afterAll(async () => {
  for (const u of archivos) {
    const k = keyFromUrl(u);
    if (k) await storage().remove(k).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe("objetos perdidos", () => {
  it("reporte → custodia → reclamo → aprobación → entrega con firma", async () => {
    const anio = nowBogota().year;
    const perdido = await reportarObjeto(dueno, {
      tipo: "PERDIDO",
      categoria: "LLAVES",
      titulo: "Llaves con llavero de Millonarios",
      descripcion: "Tres llaves con llavero azul, se me cayeron en el gimnasio",
      rasgosPrivados: SECRETO,
      color: "Azul",
      recompensa: "$30.000",
    });
    expect(perdido.codigo).toBe(`OP-${anio}-0001`);
    expect(perdido.estado).toBe("ABIERTO");
    expect(perdido.unidadId).toBe(dueno.unidadIds[0]);
    expect(Math.round((perdido.venceEn!.getTime() - Date.now()) / 86_400_000)).toBe(90);

    const encontrado = await reportarObjeto(vecina, { tipo: "ENCONTRADO", categoria: "LLAVES", titulo: "Llavero azul con tres llaves", descripcion: "Llavero de fútbol azul junto al gimnasio", color: "azul", recompensa: "no aplica" });
    expect(encontrado.codigo).toBe(`OP-${anio}-0002`);
    expect(encontrado.estado).toBe("ABIERTO");
    expect(encontrado.recompensa).toBeNull(); // solo las pérdidas ofrecen recompensa
    expect(encontrado.coincidencias).toBe(1);
    // Al dueño de la pérdida le llega el aviso "¿Es tuyo?"
    const aviso = await prisma.notificacion.findFirst({ where: { usuarioId: dueno.userId, tipo: "OBJETO_PERDIDO" } });
    expect(aviso?.titulo).toMatch(/¿Es tuyo\?/);
    expect(aviso?.enlace).toBe(`/objetos-perdidos/${encontrado.id}`);
    // Y la pérdida muestra la sugerencia
    const sug = await coincidenciasDe(dueno, perdido);
    expect(sug[0].objeto.id).toBe(encontrado.id);

    // Solo portería/administración reciben en custodia
    await expect(recibirEnCustodia(vecina, encontrado.id, "Portería")).rejects.toThrow(/Solo portería/);
    const enCustodia = await recibirEnCustodia(porteria, encontrado.id, "Portería principal");
    expect(enCustodia.estado).toBe("EN_CUSTODIA");
    expect(enCustodia.recibidoPorId).toBe(porteria.userId);
    expect(Math.round((enCustodia.venceEn!.getTime() - Date.now()) / 86_400_000)).toBe(60);
    expect(await prisma.notificacion.count({ where: { usuarioId: vecina.userId, titulo: { contains: "Recibimos" } } })).toBe(1);
    await expect(recibirEnCustodia(porteria, encontrado.id, "Otra")).rejects.toThrow(/no se puede recibir/);

    // Reclamo
    await expect(reclamarObjeto(vecina, encontrado.id, "Es mío, lo perdí ayer en el gimnasio")).rejects.toThrow(/tú reportaste/);
    await expect(reclamarObjeto(dueno, encontrado.id, "mío")).rejects.toThrow(/mínimo 10/);
    const reclamo = await reclamarObjeto(dueno, encontrado.id, "Son mis llaves: la del buzón tiene cinta roja y hay un control de parqueadero.");
    expect(reclamo.estado).toBe("PENDIENTE");
    expect(reclamo.unidadId).toBe(dueno.unidadIds[0]);
    await expect(reclamarObjeto(dueno, encontrado.id, "Otra vez: son mis llaves con cinta roja")).rejects.toThrow(/Ya tienes un reclamo/);
    expect(await prisma.notificacion.count({ where: { usuarioId: porteria.userId, titulo: { contains: "Reclamo de objeto" } } })).toBe(1);

    // El gestor ve el reclamo con los rasgos privados de la pérdida del reclamante para comparar
    const vistaGestor = await obtenerObjeto(porteria, encontrado.id);
    expect(vistaGestor.reclamos).toHaveLength(1);
    expect(vistaGestor.reclamos[0].perdidasDelReclamante[0].rasgosPrivados).toBe(SECRETO);
    expect(vistaGestor.puede.entregar).toBe(true);

    await expect(resolverReclamo(dueno, reclamo.id, "APROBAR")).rejects.toThrow(/Solo portería/);
    await resolverReclamo(porteria, reclamo.id, "APROBAR", "Recógelas después de las 2 p. m.");
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: encontrado.id } })).estado).toBe("RECLAMADO");
    await expect(resolverReclamo(porteria, reclamo.id, "APROBAR")).rejects.toThrow(/ya fue resuelto/);
    const vistaDueno = await obtenerObjeto(dueno, encontrado.id);
    expect(vistaDueno.miReclamo?.estado).toBe("APROBADO");
    expect(vistaDueno.puede.reclamar).toBe(false);

    // Entrega: exige documento y firma
    await expect(entregarObjeto(porteria, encontrado.id, { entregadoA: dueno.nombre, entregadoDocumento: "1045", firma: FIRMA })).rejects.toThrow(/documento/);
    await expect(entregarObjeto(porteria, encontrado.id, { entregadoA: dueno.nombre, entregadoDocumento: "1045678", firma: "no-es-firma" })).rejects.toThrow(/firma/);
    const r = await entregarObjeto(porteria, encontrado.id, { entregadoA: dueno.nombre, entregadoDocumento: "1045678901", firma: FIRMA });
    expect(r.perdidoId).toBe(perdido.id);
    const entregado = await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: encontrado.id } });
    archivos.push(entregado.firmaUrl!);
    expect(entregado.estado).toBe("DEVUELTO");
    expect(entregado.firmaUrl).toMatch(new RegExp(`^/api/files/${porteria.conjuntoId}/objetos-firmas/`));
    expect(entregado.entregadoPorId).toBe(porteria.userId);
    expect(entregado.entregadoDocumento).toBe("1045678901");
    expect(entregado.coincideConId).toBe(perdido.id);
    const perdidaCerrada = await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: perdido.id } });
    expect(perdidaCerrada.estado).toBe("DEVUELTO");
    expect(perdidaCerrada.coincideConId).toBe(encontrado.id);
    await expect(entregarObjeto(porteria, encontrado.id, { entregadoA: "x", entregadoDocumento: "123456", firma: FIRMA })).rejects.toThrow(/ya fue entregado/);

    // Historial: la vista "historial" del dueño incluye ambos; la auditoría no guarda la firma
    const hist = await listarObjetos(dueno, { vista: "historial" });
    expect(hist.items.map((o) => o.id).sort()).toEqual([perdido.id, encontrado.id].sort());
    const aud = await prisma.auditoria.findFirst({ where: { entidad: "ObjetoPerdido", entidadId: encontrado.id, accion: "entregar" } });
    expect(JSON.stringify(aud?.despues)).not.toContain("base64");
  });

  it("rechazo de reclamos y reversión de una aprobación", async () => {
    const anillo = await reportarObjeto(porteria, { tipo: "ENCONTRADO", categoria: "JOYA", titulo: "Anillo plateado", descripcion: "Anillo delgado en el borde de la piscina", rasgosPrivados: "Iniciales J & M por dentro", custodia: "Caja fuerte" });
    expect(anillo.estado).toBe("EN_CUSTODIA"); // el gestor lo registra directamente en custodia
    expect(anillo.recibidoPorId).toBe(porteria.userId);

    const rec = await reclamarObjeto(otro, anillo.id, "Es el anillo de mi esposa, es plateado y sencillo.");
    await expect(resolverReclamo(admin, rec.id, "RECHAZAR")).rejects.toThrow(/Explica por qué/);
    await resolverReclamo(admin, rec.id, "RECHAZAR", "La descripción no coincide con el objeto.");
    const tras = await prisma.reclamoObjeto.findUniqueOrThrow({ where: { id: rec.id } });
    expect(tras.estado).toBe("RECHAZADO");
    expect(tras.resueltoPorId).toBe(admin.userId);
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: anillo.id } })).estado).toBe("EN_CUSTODIA");
    expect(await prisma.notificacion.count({ where: { usuarioId: otro.userId, titulo: "Tu reclamo no fue aprobado" } })).toBe(1);
    const vista = await obtenerObjeto(otro, anillo.id);
    expect(vista.miReclamo?.estado).toBe("RECHAZADO");
    expect(vista.puede.reclamar).toBe(true); // puede volver a intentarlo con más detalles

    // Dos reclamantes: al aprobar uno, el otro se rechaza; luego se revierte la aprobación
    const a = await reclamarObjeto(otro, anillo.id, "Tiene grabadas las iniciales J & M por dentro.");
    const b = await reclamarObjeto(vecina, anillo.id, "Creo que es mío, lo perdí en la piscina.");
    await resolverReclamo(admin, a.id, "APROBAR");
    expect((await prisma.reclamoObjeto.findUniqueOrThrow({ where: { id: b.id } })).estado).toBe("RECHAZADO");
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: anillo.id } })).estado).toBe("RECLAMADO");
    await resolverReclamo(admin, a.id, "RECHAZAR", "No se presentó con documento.");
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: anillo.id } })).estado).toBe("EN_CUSTODIA");

    // Disposición tras el plazo: exige nota y rechaza reclamos pendientes
    const c = await reclamarObjeto(dueno, anillo.id, "Es mío, plateado con iniciales grabadas");
    await expect(disponerObjeto(otro, anillo.id, "DONADO", "Donado")).rejects.toThrow(/Solo portería/);
    await expect(disponerObjeto(admin, anillo.id, "DONADO", "x")).rejects.toThrow(/disposición/);
    await disponerObjeto(admin, anillo.id, "DONADO", "Donado a la Fundación Niños de los Andes, acta 3.");
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: anillo.id } })).estado).toBe("DONADO");
    expect((await prisma.reclamoObjeto.findUniqueOrThrow({ where: { id: c.id } })).estado).toBe("RECHAZADO");
    await expect(reclamarObjeto(otro, anillo.id, "Lo quiero reclamar de nuevo por favor")).rejects.toThrow(/ya no se puede reclamar/);
  });

  it("privacidad: los rasgos privados solo los ven quien reportó y quien gestiona", async () => {
    const o = await reportarObjeto(vecina, { tipo: "ENCONTRADO", categoria: "BILLETERA", titulo: "Billetera café", descripcion: "Billetera de cuero en el parqueadero", rasgosPrivados: "Cédula a nombre de Zacarías Quintero", contacto: "300 123 4567" });
    await reclamarObjeto(dueno, o.id, "Es mi billetera café con mis documentos adentro");

    const ajeno = await obtenerObjeto(otro, o.id);
    expect("rasgosPrivados" in ajeno.objeto).toBe(false);
    expect(JSON.stringify(ajeno)).not.toContain("Zacarías");
    expect(ajeno.objeto.reportadoPor).toBeNull();
    expect(ajeno.reclamos).toHaveLength(0); // no ve reclamos de otros
    expect(ajeno.linea.some((e) => e.titulo === "Alguien reclamó este objeto")).toBe(true);
    expect(JSON.stringify(ajeno.linea)).not.toContain(dueno.nombre);
    expect(ajeno.objeto.contacto).toBe("300 123 4567"); // contacto visible solo si quien reporta lo indicó

    const reclamante = await obtenerObjeto(dueno, o.id);
    expect(JSON.stringify(reclamante)).not.toContain("Zacarías");
    expect(reclamante.reclamos).toHaveLength(1);

    expect((await obtenerObjeto(vecina, o.id)).objeto).toMatchObject({ rasgosPrivados: "Cédula a nombre de Zacarías Quintero" });
    expect((await obtenerObjeto(admin, o.id)).objeto).toMatchObject({ rasgosPrivados: "Cédula a nombre de Zacarías Quintero" });

    // Listados, API y búsqueda no exponen ni buscan por rasgos privados
    const lista = await listarObjetos(otro, { vista: "encontrados" });
    expect(JSON.stringify(lista)).not.toContain("Zacarías");
    expect(JSON.stringify(lista.items.map((x) => aPublico(otro, x)))).not.toContain("Zacarías");
    expect((await listarObjetos(otro, { vista: "abiertos", q: "Zacarías" })).total).toBe(0);
    expect((await listarObjetos(admin, { vista: "abiertos", q: "Zacarías" })).total).toBe(0);
    expect(await globalSearch(otro, "Zacarías")).toEqual([]);
    expect((await globalSearch(otro, "Billetera café")).some((h) => h.href === `/objetos-perdidos/${o.id}`)).toBe(true);

    // Sin opt-in, el contacto no se publica
    const sinContacto = await reportarObjeto(otro, { tipo: "PERDIDO", categoria: "GAFAS", titulo: "Gafas de sol", descripcion: "Gafas negras en la cancha" });
    expect(sinContacto.contacto).toBeNull();
    // Solo quien reportó cierra su pérdida
    await expect(marcarAparecio(dueno, sinContacto.id)).rejects.toThrow(/Solo quien/);
    await marcarAparecio(otro, sinContacto.id);
  });

  it("aislamiento entre conjuntos", async () => {
    const o = await reportarObjeto(vecina, { tipo: "ENCONTRADO", categoria: "CELULAR", titulo: "Celular Samsung", descripcion: "Celular con forro negro en el lobby" });
    const { ctx: sys2, roles: roles2 } = await makeConjunto("Objetos B");
    const [x1] = await makeUnidades(sys2.conjuntoId, 1);
    const ajeno = await makeUsuario(sys2.conjuntoId, roles2.PROPIETARIO, x1.id);
    const porteriaAjena = await makeUsuario(sys2.conjuntoId, roles2.PORTERIA);

    await expect(obtenerObjeto(ajeno, o.id)).rejects.toThrow(/no existe/);
    await expect(reclamarObjeto(ajeno, o.id, "Es mi celular Samsung con forro negro")).rejects.toThrow(/no existe/);
    await expect(recibirEnCustodia(porteriaAjena, o.id, "Portería")).rejects.toThrow(/no existe/);
    await expect(entregarObjeto(porteriaAjena, o.id, { entregadoA: "X", entregadoDocumento: "123456", firma: FIRMA })).rejects.toThrow(/no existe/);
    expect((await listarObjetos(ajeno, { vista: "abiertos" })).total).toBe(0);
    expect(await globalSearch(ajeno, "Samsung")).toEqual([]);
    // Las coincidencias tampoco cruzan conjuntos
    const suyo = await reportarObjeto(ajeno, { tipo: "PERDIDO", categoria: "CELULAR", titulo: "Celular Samsung", descripcion: "Celular con forro negro en el lobby" });
    expect(suyo.coincidencias).toBe(0);
    // Y su consecutivo empieza en 1
    expect(suyo.codigo).toMatch(/-0001$/);
  });

  it("job diario: cierra pérdidas vencidas y pide disposición de la custodia vencida", async () => {
    const p = await reportarObjeto(otro, { tipo: "PERDIDO", categoria: "ROPA", titulo: "Saco gris", descripcion: "Saco gris de lana talla M" });
    const e = await reportarObjeto(admin, { tipo: "ENCONTRADO", categoria: "JUGUETE", titulo: "Muñeca de trapo", descripcion: "Muñeca en el parque infantil", custodia: "Administración" });
    const ahora = new Date();
    await prisma.objetoPerdido.update({ where: { id: p.id }, data: { venceEn: new Date(ahora.getTime() - 3_600_000) } });
    await prisma.objetoPerdido.update({ where: { id: e.id }, data: { venceEn: new Date(ahora.getTime() - 3_600_000) } });
    const r = await procesarVencimientos(admin, ahora);
    expect(r.cerrados).toBeGreaterThanOrEqual(1);
    expect(r.disposicion).toBeGreaterThanOrEqual(1);
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: p.id } })).estado).toBe("CERRADO");
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: e.id } })).estado).toBe("EN_CUSTODIA"); // espera decisión humana
    expect(await prisma.notificacion.count({ where: { usuarioId: otro.userId, titulo: "Cerramos tu reporte de pérdida" } })).toBe(1);
    expect(await prisma.notificacion.count({ where: { usuarioId: admin.userId, titulo: { contains: "superaron el plazo" } } })).toBe(1);
    const atender = await listarObjetos(admin, { vista: "atender" });
    expect(atender.items.find((x) => x.id === e.id)?.vencido).toBe(true);
  });
});
