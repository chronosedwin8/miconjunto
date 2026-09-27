import { describe, expect, it } from "vitest";
import { bloquesParaMostrar, limpiarContenido, parseVideo, resumenDe, sanitizarHtml, textoAHtml, textoPlano, urlArchivoValida, embedUrl } from "@/lib/muro/contenido";
import { describirDef, enRango, esVacia, normalizarDef, numeroUnidad, parseDef, tieneFiltrosUnidad } from "@/lib/segmentos/definicion";
import { aplicarVariables, aplicarVariablesTexto, envolverCorreo } from "@/lib/comunicaciones/correo-masivo";
import { puedeVerDocumento, rolPermitido } from "@/lib/documentos/service";
import { pdfSimple } from "@/lib/documentos/pdf-simple";
import { extraerTextoPdf, textoDeContenido } from "@/lib/documentos/texto-pdf";
import { agruparPorDia, rangoVista } from "@/lib/calendario/service";
import { fichaPublica, primerNombre } from "@/lib/directorio/service";
import { defaultPermsFor } from "@/lib/permisos";

const C = "conj123";

describe("sanitización de contenido del muro", () => {
  it("elimina scripts, eventos, estilos y enlaces javascript:", () => {
    const html = sanitizarHtml(`<p onclick="x()" style="color:red">Hola <b>vecino</b><script>alert(1)</script><img src=x onerror=alert(1)></p><a href="javascript:alert(1)">mal</a><a href="https://ok.co">bien</a><iframe src="https://evil"></iframe>`);
    expect(html).not.toMatch(/script|onclick|onerror|style|iframe|javascript|<img/i);
    expect(html).toContain("<strong>vecino</strong>");
    expect(html).toContain('<a href="https://ok.co" target="_blank" rel="noopener noreferrer nofollow">bien</a>');
    expect(html).not.toContain(">mal<");
  });

  it("convierte texto plano en párrafos escapados y extrae texto plano", () => {
    expect(textoAHtml("Hola <b>\n\nSegundo\nlínea")).toBe("<p>Hola &lt;b&gt;</p><p>Segundo<br />línea</p>");
    expect(textoPlano("<p>Hola&nbsp;<strong>mundo</strong></p>")).toBe("Hola mundo");
  });

  it("valida videos: solo YouTube y Vimeo", () => {
    expect(parseVideo("https://www.youtube.com/watch?v=abcDEF12345")).toEqual({ proveedor: "youtube", videoId: "abcDEF12345" });
    expect(parseVideo("https://youtu.be/abcDEF12345?t=3")).toEqual({ proveedor: "youtube", videoId: "abcDEF12345" });
    expect(parseVideo("https://youtube.com/shorts/abcDEF12345")?.videoId).toBe("abcDEF12345");
    expect(parseVideo("https://vimeo.com/123456789")).toEqual({ proveedor: "vimeo", videoId: "123456789" });
    expect(parseVideo("https://evil.com/watch?v=abcDEF12345")).toBeNull();
    expect(parseVideo("javascript:alert(1)")).toBeNull();
    expect(embedUrl({ proveedor: "youtube", videoId: "abc123def" })).toBe("https://www.youtube-nocookie.com/embed/abc123def");
  });

  it("solo acepta archivos del propio conjunto", () => {
    expect(urlArchivoValida(`/api/files/${C}/muro/a.png`, C)).toBe(true);
    expect(urlArchivoValida(`/api/files/otro/muro/a.png`, C)).toBe(false);
    expect(urlArchivoValida(`/api/files/${C}/../otro/a.png`, C)).toBe(false);
    expect(urlArchivoValida(`https://cdn.x/a.png`, C)).toBe(false);
  });

  it("limpia los bloques del editor", () => {
    const b = limpiarContenido(
      JSON.stringify([
        { tipo: "texto", html: "<p>Hola<script>x</script></p>" },
        { tipo: "texto", html: "<p>  </p>" },
        { tipo: "imagen", url: `/api/files/${C}/muro/f.png`, pie: " Foto " },
        { tipo: "video", url: "https://youtu.be/abcDEF12345" },
        { tipo: "video", url: "" },
        { tipo: "adjunto", url: `/api/files/${C}/muro/0123456789abcdef-acta.pdf` },
        { tipo: "encuesta", encuestaId: "ckabc12345678" },
        { tipo: "meta", subcategoria: "VENTA", contacto: "<b>300</b>" },
      ]),
      C,
    );
    expect(b.map((x) => x.tipo)).toEqual(["texto", "imagen", "video", "adjunto", "encuesta", "meta"]);
    expect(b[0]).toEqual({ tipo: "texto", html: "<p>Hola</p>" });
    expect(b[3]).toMatchObject({ nombre: "acta.pdf" });
    expect(b[5]).toEqual({ tipo: "meta", subcategoria: "VENTA", contacto: "300" });
    expect(() => limpiarContenido([{ tipo: "imagen", url: "https://evil.co/x.png" }], C)).toThrow(/imágenes/);
    expect(() => limpiarContenido([{ tipo: "video", url: "https://evil.co/v" }], C)).toThrow(/YouTube/);
    expect(() => limpiarContenido([{ tipo: "encuesta", encuestaId: "'; drop" }], C)).toThrow(/encuesta/);
    expect(() => limpiarContenido("no es json", C)).toThrow(/formato/);
    expect(limpiarContenido([{ tipo: "meta", subcategoria: "ARMAS" }], C)).toEqual([]);
  });

  it("re-sanitiza al mostrar y genera resumen", () => {
    const b = bloquesParaMostrar([{ tipo: "texto", html: "<p>Hola <img src=x onerror=1> mundo</p>" }, { tipo: "imagen", url: "https://evil.co/x.png" }, { tipo: "video", url: "https://evil.co/x" }]);
    expect(b).toEqual([{ tipo: "texto", html: "<p>Hola  mundo</p>" }]);
    expect(resumenDe([{ tipo: "texto", html: "<p>" + "a".repeat(300) + "</p>" }], 50)).toHaveLength(50);
  });
});

describe("definición de segmentos (puro)", () => {
  it("normaliza, valida y describe", () => {
    expect(normalizarDef({ torres: [], cartera: null, conMascotas: false, roles: ["X", "X"], basura: 1 })).toEqual({ roles: ["X"] });
    expect(normalizarDef("inválido")).toEqual({});
    expect(() => parseDef({ cartera: "QUIZAS" })).toThrow();
    expect(esVacia({ torres: [] })).toBe(true);
    expect(tieneFiltrosUnidad({ roles: ["CONSEJO"] })).toBe(false);
    expect(tieneFiltrosUnidad({ roles: ["CONSEJO"], conMascotas: true })).toBe(true);
    expect(describirDef({})).toEqual(["Todo el conjunto"]);
    expect(describirDef({ torres: ["t1"], pisoMin: 2, pisoMax: 5, cartera: "EN_MORA", conMascotas: true }, { torres: { t1: "Torre 1" } })).toEqual(["Torre 1", "Pisos 2 a 5", "En mora", "Con mascotas"]);
  });

  it("número de unidad y rangos", () => {
    expect(numeroUnidad("T2-501")).toBe(501);
    expect(numeroUnidad("Casa 14")).toBe(14);
    expect(numeroUnidad("Local B")).toBeNull();
    expect(enRango(501, 101, 504)).toBe(true);
    expect(enRango(505, 101, 504)).toBe(false);
    expect(enRango(null, null, null)).toBe(true);
    expect(enRango(null, 1, null)).toBe(false);
  });
});

describe("correo masivo: variables", () => {
  it("escapa valores y convierte {{link_pago}} en enlace", () => {
    const html = aplicarVariables('<p>Hola {{nombre}}, saldo {{ saldo }} de {{unidad}}</p><p>{{link_pago}}</p><a href="{{link_pago}}">Pagar</a>', {
      nombre: "<b>Ana</b>",
      unidad: "T1-101",
      saldo: "$ 100.000",
      link_pago: "http://localhost:3000/cuenta/pagar",
    });
    expect(html).toContain("Hola &lt;b&gt;Ana&lt;/b&gt;");
    expect(html).toContain("saldo $ 100.000 de T1-101");
    expect(html).toContain('<a href="http://localhost:3000/cuenta/pagar">http://localhost:3000/cuenta/pagar</a>');
    expect(html).toContain('<a href="http://localhost:3000/cuenta/pagar">Pagar</a>');
    expect(aplicarVariablesTexto("Aviso para {{unidad}}", { unidad: "T2-302" })).toBe("Aviso para T2-302");
    expect(envolverCorreo({ conjuntoNombre: "A&B", color: "red;x", asunto: "x", cuerpoHtml: "<p>y</p>" })).toContain("#0f766e");
  });
});

describe("documentos: visibilidad por rol", () => {
  const sujeto = (rol: string, clave = rol) => ({ esSuperAdmin: false, permisos: new Set<string>(defaultPermsFor(rol)), unidadIds: [], userId: "u", rolBase: rol, rolClave: clave });
  it("vacío = todos; acepta clave del rol o su rol base", () => {
    expect(rolPermitido([], { rolBase: "RESIDENTE", rolClave: "RESIDENTE" })).toBe(true);
    expect(rolPermitido(["CONSEJO"], { rolBase: "RESIDENTE", rolClave: "RESIDENTE" })).toBe(false);
    expect(rolPermitido(["CONSEJO"], { rolBase: "CONSEJO", rolClave: "CONSEJO_AMPLIADO" })).toBe(true);
  });
  it("residente no ve restringidos ni borradores; administración ve todo", () => {
    const doc = { publicado: true, rolesVisibles: ["ADMINISTRADOR", "CONSEJO"], carpeta: null };
    expect(puedeVerDocumento(sujeto("PROPIETARIO"), doc)).toBe(false);
    expect(puedeVerDocumento(sujeto("CONSEJO"), doc)).toBe(true);
    expect(puedeVerDocumento(sujeto("PROPIETARIO"), { publicado: false, rolesVisibles: [], carpeta: null })).toBe(false);
    expect(puedeVerDocumento(sujeto("PROPIETARIO"), { publicado: true, rolesVisibles: [], carpeta: { rolesVisibles: ["CONTADOR"] } })).toBe(false);
    expect(puedeVerDocumento(sujeto("ADMINISTRADOR"), { publicado: false, rolesVisibles: ["CONTADOR"], carpeta: null })).toBe(true);
  });
});

describe("extracción de texto de PDF", () => {
  it("lee el texto de un PDF generado", () => {
    const buf = pdfSimple({ titulo: "Reglamento", secciones: [{ titulo: "Capítulo 1", parrafos: ["Las mascotas circulan con traílla (correa) por zonas comunes."] }] });
    const t = extraerTextoPdf(buf)!;
    expect(t).toContain("Reglamento");
    expect(t).toContain("Capítulo 1");
    expect(t).toContain("traílla (correa)");
  });
  it("devuelve null para archivos que no son PDF o sin texto", () => {
    expect(extraerTextoPdf(Buffer.from("hola"))).toBeNull();
    expect(textoDeContenido("q 1 0 0 1 0 0 cm Q")).toBe("");
    expect(textoDeContenido("BT [(Ho) -300 (la)] TJ ET")).toBe("Ho la");
  });
});

describe("calendario y directorio (puro)", () => {
  it("rango de vistas: semana de lunes a domingo y mes completo", () => {
    const s = rangoVista("semana", "2026-09-30");
    expect(s.dias[0]).toBe("2026-09-28");
    expect(s.dias).toHaveLength(7);
    const m = rangoVista("mes", "2026-09-15");
    expect(m.dias[0]).toBe("2026-08-31");
    expect(m.dias.at(-1)).toBe("2026-10-04");
    expect(m.dias.length % 7).toBe(0);
  });
  it("agrupa eventos de varios días", () => {
    const g = agruparPorDia(
      [{ id: "1", origen: "EVENTO", tipo: "OTRO", titulo: "x", descripcion: null, lugar: null, inicio: new Date("2026-09-28T13:00:00Z"), fin: new Date("2026-09-30T05:00:00Z"), todoElDia: false, editable: false }],
      ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"],
    );
    expect([...g.entries()].map(([d, v]) => [d, v.length])).toEqual([["2026-09-27", 0], ["2026-09-28", 1], ["2026-09-29", 1], ["2026-09-30", 0]]);
  });
  it("la ficha del directorio solo expone lo elegido", () => {
    const f = fichaPublica({ id: "p", nombres: "Ana", apellidos: "Ruiz", telefono: "3001234567", serviciosOfrecidos: "Tortas", directorioCampos: ["unidad", "whatsapp"] }, ["T1-101"]);
    expect(f).toEqual({ personaId: "p", nombre: null, unidades: ["T1-101"], telefono: null, whatsapp: "3001234567", servicios: null });
    expect(primerNombre("Laura Gómez Fontalvo")).toBe("Laura G.");
  });
});
