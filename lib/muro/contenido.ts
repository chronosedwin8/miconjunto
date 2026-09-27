import sanitizeHtml from "sanitize-html";
import { z } from "zod";

/**
 * Contenido de publicaciones en BLOQUES (Publicacion.contenido JSON). Todo HTML se sanitiza al guardar
 * y de nuevo al mostrar (defensa en profundidad). Funciones puras: se prueban en tests/unit.
 */
export type BloqueTexto = { tipo: "texto"; html: string };
export type BloqueImagen = { tipo: "imagen"; url: string; alt?: string; pie?: string };
export type BloqueVideo = { tipo: "video"; url: string; proveedor: "youtube" | "vimeo"; videoId: string };
export type BloqueAdjunto = { tipo: "adjunto"; url: string; nombre: string };
export type BloqueEncuesta = { tipo: "encuesta"; encuestaId: string };
/** Metadatos (no se muestran como contenido): subcategoría y contacto de clasificados. */
export type BloqueMeta = { tipo: "meta"; subcategoria?: string; contacto?: string };
export type Bloque = BloqueTexto | BloqueImagen | BloqueVideo | BloqueAdjunto | BloqueEncuesta | BloqueMeta;

export const SUBCATEGORIAS_CLASIFICADO = ["VENTA", "SERVICIOS", "CUIDADO_MASCOTAS", "TUTORIAS", "OTRO"] as const;
export type SubcategoriaClasificado = (typeof SUBCATEGORIAS_CLASIFICADO)[number];

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h3", "h4", "blockquote"];

/** Sanitiza HTML de un bloque de texto: solo etiquetas de formato básico y enlaces http(s)/mailto/tel. */
export function sanitizarHtml(html: string): string {
  return sanitizeHtml(html ?? "", {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" } }),
      b: "strong",
      i: "em",
    },
    exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href,
  }).trim();
}

/** Texto plano sin etiquetas (para resúmenes, notificaciones y búsqueda). */
export function textoPlano(html: string): string {
  return sanitizeHtml(html ?? "", { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convierte texto plano (con saltos de línea) en párrafos HTML seguros. */
export function textoAHtml(texto: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return texto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/** Extrae proveedor e id de un enlace de YouTube o Vimeo. Otros dominios se rechazan (null). */
export function parseVideo(url: string): { proveedor: "youtube" | "vimeo"; videoId: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const idOk = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null);
  if (host === "youtu.be") {
    const id = idOk(u.pathname.slice(1).split("/")[0]);
    return id ? { proveedor: "youtube", videoId: id } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const id = idOk(u.searchParams.get("v") ?? (["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : null));
    return id ? { proveedor: "youtube", videoId: id } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((p) => /^\d{5,12}$/.test(p));
    return id ? { proveedor: "vimeo", videoId: id } : null;
  }
  return null;
}

export function embedUrl(b: Pick<BloqueVideo, "proveedor" | "videoId">) {
  return b.proveedor === "youtube" ? `https://www.youtube-nocookie.com/embed/${b.videoId}` : `https://player.vimeo.com/video/${b.videoId}`;
}

/** URL de archivo permitida: almacenamiento propio del conjunto (o https para imágenes externas si se permite). */
export function urlArchivoValida(url: string, conjuntoId: string, opts?: { permitirHttps?: boolean }) {
  if (typeof url !== "string" || url.length > 500 || url.includes("..")) return false;
  if (url.startsWith(`/api/files/${conjuntoId}/`)) return true;
  if (opts?.permitirHttps && /^https:\/\/[^\s"'<>]+$/.test(url)) return true;
  return false;
}

const bloqueEntrada = z.object({
  tipo: z.enum(["texto", "imagen", "video", "adjunto", "encuesta", "meta"]),
  html: z.string().max(20000).optional(),
  texto: z.string().max(20000).optional(),
  url: z.string().max(500).optional(),
  alt: z.string().max(200).optional(),
  pie: z.string().max(300).optional(),
  nombre: z.string().max(200).optional(),
  encuestaId: z.string().max(40).optional(),
  subcategoria: z.string().max(40).optional(),
  contacto: z.string().max(200).optional(),
});

export class ContenidoInvalido extends Error {}

/**
 * Valida y limpia los bloques que llegan del editor. Descarta bloques vacíos, sanitiza HTML y
 * valida URLs (archivos del propio conjunto; videos solo YouTube/Vimeo). Lanza ContenidoInvalido.
 */
export function limpiarContenido(raw: unknown, conjuntoId: string, opts?: { maxBloques?: number }): Bloque[] {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = raw.trim() ? JSON.parse(raw) : [];
    } catch {
      throw new ContenidoInvalido("El contenido no tiene un formato válido.");
    }
  }
  const parsed = z.array(bloqueEntrada).max(opts?.maxBloques ?? 40).safeParse(data ?? []);
  if (!parsed.success) throw new ContenidoInvalido("El contenido no tiene un formato válido.");
  const out: Bloque[] = [];
  for (const b of parsed.data) {
    switch (b.tipo) {
      case "texto": {
        const html = sanitizarHtml(b.html ?? (b.texto ? textoAHtml(b.texto) : ""));
        if (textoPlano(html)) out.push({ tipo: "texto", html });
        break;
      }
      case "imagen":
        if (!b.url) break;
        if (!urlArchivoValida(b.url, conjuntoId)) throw new ContenidoInvalido("Una de las imágenes no es válida. Súbela desde el editor.");
        out.push({ tipo: "imagen", url: b.url, alt: b.alt?.trim() || undefined, pie: b.pie?.trim() || undefined });
        break;
      case "video": {
        if (!b.url?.trim()) break;
        const v = parseVideo(b.url);
        if (!v) throw new ContenidoInvalido("Solo se pueden insertar videos de YouTube o Vimeo.");
        out.push({ tipo: "video", url: b.url.trim(), ...v });
        break;
      }
      case "adjunto":
        if (!b.url) break;
        if (!urlArchivoValida(b.url, conjuntoId)) throw new ContenidoInvalido("Uno de los adjuntos no es válido. Súbelo desde el editor.");
        out.push({ tipo: "adjunto", url: b.url, nombre: (b.nombre?.trim() || b.url.split("/").pop()?.replace(/^[a-f0-9]{16}-/, "") || "Adjunto").slice(0, 200) });
        break;
      case "encuesta":
        if (!b.encuestaId?.trim()) break;
        if (!/^[a-z0-9]{8,40}$/i.test(b.encuestaId.trim())) throw new ContenidoInvalido("La encuesta enlazada no es válida.");
        out.push({ tipo: "encuesta", encuestaId: b.encuestaId.trim() });
        break;
      case "meta": {
        const sub = (SUBCATEGORIAS_CLASIFICADO as readonly string[]).includes(b.subcategoria ?? "") ? b.subcategoria : undefined;
        const contacto = b.contacto ? textoPlano(b.contacto).slice(0, 200) : undefined;
        if (sub || contacto) out.push({ tipo: "meta", subcategoria: sub, contacto: contacto || undefined });
        break;
      }
    }
  }
  return out;
}

/** Lee bloques guardados (tolerante a datos antiguos) y re-sanitiza el HTML para mostrarlo. */
export function bloquesParaMostrar(contenido: unknown): Bloque[] {
  if (!Array.isArray(contenido)) return typeof contenido === "string" && contenido ? [{ tipo: "texto", html: sanitizarHtml(textoAHtml(contenido)) }] : [];
  const out: Bloque[] = [];
  for (const b of contenido as Bloque[]) {
    if (!b || typeof b !== "object") continue;
    if (b.tipo === "texto") out.push({ tipo: "texto", html: sanitizarHtml(b.html) });
    else if (b.tipo === "video") {
      const v = parseVideo(b.url);
      if (v) out.push({ tipo: "video", url: b.url, ...v });
    } else if (b.tipo === "imagen" && typeof b.url === "string" && b.url.startsWith("/api/files/")) out.push(b);
    else if (b.tipo === "adjunto" && typeof b.url === "string" && b.url.startsWith("/api/files/")) out.push(b);
    else if (b.tipo === "encuesta" || b.tipo === "meta") out.push(b);
  }
  return out;
}

export function metaDe(contenido: unknown): BloqueMeta | null {
  return (Array.isArray(contenido) ? (contenido as Bloque[]).find((b) => b?.tipo === "meta") : null) as BloqueMeta | null;
}

/** Resumen en texto plano de los bloques de texto (máx. `max` caracteres). */
export function resumenDe(bloques: Bloque[], max = 220): string {
  const t = bloques
    .filter((b): b is BloqueTexto => b.tipo === "texto")
    .map((b) => textoPlano(b.html))
    .join(" ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

export function primeraImagen(bloques: Bloque[]): string | null {
  return (bloques.find((b) => b.tipo === "imagen") as BloqueImagen | undefined)?.url ?? null;
}
