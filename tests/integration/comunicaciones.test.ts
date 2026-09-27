import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { defaultPermsFor } from "@/lib/permisos";
import { saveFile } from "@/lib/storage";
import { pdfSimple } from "@/lib/documentos/pdf-simple";
import { acusesDocumento, confirmarLectura, guardarDocumento, listarDocumentos, nuevaVersion, obtenerDocumento } from "@/lib/documentos/service";
import { comentar, detallePublicacion, feedMuro, guardarPublicacion, moderarComentario, moderarPublicacion, reaccionar } from "@/lib/muro/service";
import { guardarCampana } from "@/lib/comunicaciones/correo-masivo";
import { crearCargo } from "@/lib/cartera/core";
import { calificarProveedor } from "@/lib/directorio/service";
import { marcarDevuelto, reportarObjeto } from "@/lib/clasificados/service";
import { makeConjunto, makeUnidades } from "../helpers/db";

let admin: Ctx;
let unidades: { id: string; codigo: string; torreId: string | null }[];

/** Contexto de un usuario con rol base y vínculo a una unidad. */
async function usuario(rol: string, unidadId?: string, tipo: "PROPIETARIO" | "ARRENDATARIO" = "PROPIETARIO"): Promise<Ctx> {
  const email = `${rol.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@com.co`;
  const u = await prisma.usuario.create({ data: { email, nombre: `${rol} Prueba` } });
  const r = await prisma.rol.findFirstOrThrow({ where: { conjuntoId: admin.conjuntoId, clave: rol } });
  await prisma.membresiaConjunto.create({ data: { usuarioId: u.id, conjuntoId: admin.conjuntoId, rolId: r.id } });
  let personaIds: string[] = [];
  if (unidadId) {
    const p = await prisma.persona.create({ data: { conjuntoId: admin.conjuntoId, usuarioId: u.id, numeroDocumento: `${Date.now()}${Math.floor(Math.random() * 1000)}`, nombres: rol, apellidos: "Prueba", email } });
    await prisma.vinculoUnidad.create({ data: { conjuntoId: admin.conjuntoId, personaId: p.id, unidadId, tipo, principal: true } });
    personaIds = [p.id];
  }
  return {
    ...admin,
    userId: u.id,
    nombre: u.nombre,
    email,
    esSuperAdmin: false,
    rolClave: rol,
    rolBase: rol,
    rolNombre: rol,
    permisos: new Set(defaultPermsFor(rol)),
    unidadIds: unidadId ? [unidadId] : [],
    unidadesPropias: unidadId && tipo === "PROPIETARIO" ? [unidadId] : [],
    personaIds,
  };
}

async function pdf(titulo: string) {
  const body = pdfSimple({ titulo, secciones: [{ parrafos: [`Contenido de ${titulo}: horario de silencio desde las diez de la noche.`] }] });
  return (await saveFile({ conjuntoId: admin.conjuntoId, folder: "documentos", body, filename: `${titulo}.pdf`, mime: "application/pdf" })).url;
}

describe("comunicaciones (integración)", () => {
  let jefe: Ctx; // administrador
  let laura: Ctx; // propietaria unidad 0
  let andres: Ctx; // arrendatario unidad 1
  let ricardo: Ctx; // consejo (sin unidad)

  beforeAll(async () => {
    ({ ctx: admin } = await makeConjunto("Comunicaciones"));
    unidades = await makeUnidades(admin.conjuntoId, 3);
    jefe = await usuario("ADMINISTRADOR");
    laura = await usuario("PROPIETARIO", unidades[0].id);
    andres = await usuario("RESIDENTE", unidades[1].id, "ARRENDATARIO");
    ricardo = await usuario("CONSEJO");
  });

  afterAll(() => prisma.$disconnect());

  it("muro: audiencia por segmento aplicada en el servidor", async () => {
    const todos = await guardarPublicacion(jefe, { titulo: "Aviso general", categoria: "AVISO", contenido: [{ tipo: "texto", html: "<p>Para todos</p>" }] });
    const segmentado = await guardarPublicacion(jefe, { titulo: "Solo unidad 2", categoria: "AVISO", contenido: [{ tipo: "texto", html: "<p>Hola</p>" }], audiencia: { unidades: [unidades[1].id] } });
    const idsLaura = (await feedMuro(laura)).items.map((p) => p.id);
    const idsAndres = (await feedMuro(andres)).items.map((p) => p.id);
    expect(idsLaura).toContain(todos.id);
    expect(idsLaura).not.toContain(segmentado.id);
    expect(idsAndres).toContain(segmentado.id);
    await expect(detallePublicacion(laura, segmentado.id)).rejects.toThrow(/no existe/);
    // La administración ve todo
    expect((await feedMuro(jefe)).items.map((p) => p.id)).toContain(segmentado.id);
  });

  it("muro: residentes no publican avisos oficiales y el HTML se sanitiza", async () => {
    await expect(guardarPublicacion(laura, { titulo: "Aviso falso", categoria: "AVISO", contenido: [{ tipo: "texto", html: "x" }] })).rejects.toThrow(/administración/);
    const p = await guardarPublicacion(jefe, { titulo: "Con script", categoria: "NOTICIA", contenido: [{ tipo: "texto", html: '<p onmouseover="x()">ok<script>alert(1)</script></p>' }] });
    expect(JSON.stringify(p.contenido)).not.toMatch(/script|onmouseover/);
  });

  it("clasificados: quedan pendientes de moderación hasta aprobarse", async () => {
    const c = await guardarPublicacion(laura, { titulo: "Vendo bicicleta", categoria: "CLASIFICADO", contenido: [{ tipo: "texto", texto: "Rin 20" }, { tipo: "meta", subcategoria: "VENTA" }], precio: 200000, fijada: true, audiencia: { unidades: [unidades[0].id] } });
    expect(c.estado).toBe("PENDIENTE_MODERACION");
    expect(c.fijada).toBe(false); // un residente no puede fijar
    expect(c.audiencia).toBeNull(); // ni segmentar
    expect((await feedMuro(andres, { categoria: "CLASIFICADO" })).items.map((p) => p.id)).not.toContain(c.id);
    await expect(moderarPublicacion(andres, c.id, "APROBAR")).rejects.toThrow(/permiso/);
    await expect(moderarPublicacion(jefe, c.id, "RECHAZAR")).rejects.toThrow(/motivo/);
    await moderarPublicacion(jefe, c.id, "APROBAR");
    expect((await feedMuro(andres, { categoria: "CLASIFICADO" })).items.map((p) => p.id)).toContain(c.id);
    const notif = await prisma.notificacion.findFirst({ where: { usuarioId: laura.userId, tipo: "MODERACION" } });
    expect(notif?.titulo).toMatch(/publicado/);
  });

  it("comentarios moderables y reacciones alternables", async () => {
    const p = await guardarPublicacion(jefe, { titulo: "Evento", categoria: "EVENTO", contenido: [{ tipo: "texto", html: "<p>Fiesta</p>" }] });
    const c = await comentar(andres, p.id, "<b>spam</b> compra aquí");
    expect(c.contenido).toBe("spam compra aquí");
    await expect(moderarComentario(laura, c.id, true)).rejects.toThrow(/permiso/);
    await moderarComentario(jefe, c.id, true);
    expect((await detallePublicacion(laura, p.id)).comentarios).toHaveLength(0);
    expect((await detallePublicacion(andres, p.id)).comentarios).toHaveLength(1); // el autor ve su comentario oculto
    expect((await reaccionar(laura, p.id, "LIKE")).tipo).toBe("LIKE");
    expect((await reaccionar(laura, p.id, "GRACIAS")).tipo).toBe("GRACIAS");
    expect((await reaccionar(laura, p.id, "GRACIAS")).tipo).toBeNull();
    expect((await reaccionar(laura, p.id, "LIKE")).tipo).toBe("LIKE");
    expect(await prisma.reaccionPublicacion.count({ where: { publicacionId: p.id } })).toBe(1);
  });

  it("documentos: visibilidad por rol y acuse de lectura por versión", async () => {
    const reglamento = await guardarDocumento(jefe, { titulo: "Reglamento", categoria: "REGLAMENTO", requiereAcuse: true, archivoUrl: await pdf("Reglamento") });
    const contrato = await guardarDocumento(jefe, { titulo: "Contrato vigilancia", categoria: "CONTRATO", rolesVisibles: ["ADMINISTRADOR", "CONSEJO"], archivoUrl: await pdf("Contrato") });
    const borrador = await guardarDocumento(jefe, { titulo: "Borrador", categoria: "OTRO", publicado: false, archivoUrl: await pdf("Borrador") });

    const ver = await prisma.versionDocumento.findFirstOrThrow({ where: { documentoId: reglamento.id } });
    expect(ver.textoExtraido).toContain("horario de silencio");

    const deLaura = (await listarDocumentos(laura)).items.map((d) => d.id);
    expect(deLaura).toContain(reglamento.id);
    expect(deLaura).not.toContain(contrato.id);
    expect(deLaura).not.toContain(borrador.id);
    expect((await listarDocumentos(ricardo)).items.map((d) => d.id)).toContain(contrato.id);
    await expect(obtenerDocumento(laura, contrato.id)).rejects.toThrow(/no existe/);
    await expect(confirmarLectura(laura, contrato.id)).rejects.toThrow(/no existe/);
    // Búsqueda por texto extraído del PDF
    expect((await listarDocumentos(laura, { q: "horario de silencio" })).items.map((d) => d.id)).toContain(reglamento.id);

    // Acuse de la versión 1
    await confirmarLectura(laura, reglamento.id);
    await confirmarLectura(laura, reglamento.id); // idempotente
    let a = await acusesDocumento(jefe, reglamento.id);
    expect(a.version).toBe(1);
    expect(a.leidos.map((x) => x.usuarioId)).toEqual([laura.userId]);
    expect(a.pendientes.map((x) => x.usuarioId)).toEqual(expect.arrayContaining([andres.userId, ricardo.userId]));

    // Nueva versión: el acuse anterior no cuenta
    const r = await nuevaVersion(jefe, reglamento.id, { archivoUrl: await pdf("Reglamento v2") });
    expect(r.version).toBe(2);
    expect((await obtenerDocumento(laura, reglamento.id)).acusado).toBe(false);
    a = await acusesDocumento(jefe, reglamento.id);
    expect(a.leidos).toHaveLength(0);
    await confirmarLectura(andres, reglamento.id);
    a = await acusesDocumento(jefe, reglamento.id);
    expect(a.leidos.map((x) => x.usuarioId)).toEqual([andres.userId]);
    expect((await acusesDocumento(jefe, reglamento.id, 1)).leidos.map((x) => x.usuarioId)).toEqual([laura.userId]);
    // No se aceptan archivos de otro conjunto
    await expect(nuevaVersion(jefe, reglamento.id, { archivoUrl: "/api/files/otro/documentos/x.pdf" })).rejects.toThrow(/no es válido/);
  });

  it("correo masivo: encola con variables y no revela saldo a arrendatarios", async () => {
    await crearCargo(admin, { unidadId: unidades[1].id, conceptoTipo: "ADMINISTRACION", valorBase: 350000, fechaVencimiento: new Date(Date.now() - 20 * 86400000), origen: "MANUAL" });
    const dueno = await usuario("PROPIETARIO", unidades[1].id, "PROPIETARIO");
    const r = await guardarCampana(jefe, {
      asunto: "Saldo de {{unidad}}",
      plantilla: "<p>Hola {{nombre}}, saldo {{saldo}}. {{link_pago}}</p>",
      definicion: { unidades: [unidades[1].id] },
      accion: "ENVIAR",
    });
    expect(r.encolados).toBe(2);
    const correos = await prisma.correoSaliente.findMany({ where: { campanaId: r.id } });
    const paraDueno = correos.find((c) => c.para === dueno.email)!;
    const paraAndres = correos.find((c) => c.para === andres.email)!;
    expect(paraDueno.asunto).toBe(`Saldo de ${unidades[1].codigo}`);
    expect(paraDueno.html).toMatch(/350\.000/);
    expect(paraAndres.html).not.toMatch(/350\.000/);
    expect(paraDueno.html).toContain("/api/track/click/"); // seguimiento de clics al link de pago
    const camp = await prisma.campanaCorreo.findUniqueOrThrow({ where: { id: r.id } });
    expect(camp.estado).toBe("ENVIADA");
    expect(camp.totalDestinatarios).toBe(2);
    await expect(guardarCampana(jefe, { id: r.id, asunto: "x", plantilla: "<p>y</p>", accion: "BORRADOR" })).rejects.toThrow(/ya fue enviada/);
  });

  it("objetos perdidos y calificación de proveedores", async () => {
    const o = await reportarObjeto(andres, { tipo: "PERDIDO", descripcion: "Llaves con llavero rojo" });
    await expect(marcarDevuelto(laura, o.id, "Andrés")).rejects.toThrow(/Solo quien/);
    await marcarDevuelto(andres, o.id, "Andrés, T2");
    expect((await prisma.objetoPerdido.findUniqueOrThrow({ where: { id: o.id } })).estado).toBe("DEVUELTO");

    const prov = await prisma.proveedor.create({ data: { conjuntoId: admin.conjuntoId, nit: "900", razonSocial: "Plomería Ya", categoria: "Plomería", directorioComunitario: true } });
    await calificarProveedor(laura, prov.id, { puntaje: 5, comentario: "Excelente" });
    await calificarProveedor(andres, prov.id, { puntaje: 3 });
    const r = await calificarProveedor(laura, prov.id, { puntaje: 4 }); // actualiza, no duplica
    expect(r.promedio).toBe(3.5);
    expect(await prisma.calificacionProveedor.count({ where: { proveedorId: prov.id } })).toBe(2);
    await expect(calificarProveedor(laura, prov.id, { puntaje: 7 })).rejects.toThrow(/entre 1 y 5/);
  });
});
