import crypto from "node:crypto";
import type { CategoriaDocumento, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notificaciones";
import { insensitive } from "@/lib/pagination";
import { mimeFromName, readFileByUrl } from "@/lib/storage";
import { extraerTextoPdf } from "./texto-pdf";

/**
 * Gestión documental: carpetas, versionado, visibilidad por rol (vacío = todos),
 * acuse de lectura por versión, vencimientos y texto extraído para el asistente IA.
 */
export const CATEGORIAS_DOCUMENTO = ["REGLAMENTO", "MANUAL_CONVIVENCIA", "ACTA", "PRESUPUESTO", "ESTADO_FINANCIERO", "POLIZA", "CONTRATO", "CIRCULAR", "OTRO"] as const;

type Sujeto = Pick<Ctx, "esSuperAdmin" | "permisos" | "unidadIds" | "userId" | "rolBase" | "rolClave">;

/** Gestiona documentos (ve todo, incluso borradores y restringidos). */
export function esGestorDocumentos(ctx: Sujeto) {
  return can(ctx, ["documentos.crear", "documentos.editar", "documentos.eliminar"]);
}

/** ¿El rol del usuario está en la lista? (vacía = todos). Acepta la clave del rol o su rol base. */
export function rolPermitido(roles: string[] | null | undefined, ctx: Pick<Ctx, "rolBase" | "rolClave">) {
  if (!roles || roles.length === 0) return true;
  return roles.includes(ctx.rolClave) || roles.includes(ctx.rolBase);
}

export function puedeVerDocumento(ctx: Sujeto, doc: { publicado: boolean; rolesVisibles: string[]; carpeta?: { rolesVisibles: string[] } | null }) {
  if (esGestorDocumentos(ctx)) return true;
  return doc.publicado && rolPermitido(doc.rolesVisibles, ctx) && rolPermitido(doc.carpeta?.rolesVisibles, ctx);
}

/** Filtro Prisma equivalente a `puedeVerDocumento` para listas. */
export function whereVisible(ctx: Sujeto): Prisma.DocumentoWhereInput {
  if (esGestorDocumentos(ctx)) return {};
  const roles = [...new Set([ctx.rolClave, ctx.rolBase])];
  return {
    publicado: true,
    AND: [
      { OR: [{ rolesVisibles: { isEmpty: true } }, { rolesVisibles: { hasSome: roles } }] },
      { OR: [{ carpetaId: null }, { carpeta: { OR: [{ rolesVisibles: { isEmpty: true } }, { rolesVisibles: { hasSome: roles } }] } }] },
    ],
  };
}

export function whereCarpetaVisible(ctx: Sujeto): Prisma.CarpetaDocumentoWhereInput {
  if (esGestorDocumentos(ctx)) return {};
  const roles = [...new Set([ctx.rolClave, ctx.rolBase])];
  return { OR: [{ rolesVisibles: { isEmpty: true } }, { rolesVisibles: { hasSome: roles } }] };
}

export type FiltrosDocumentos = { q?: string | null; carpetaId?: string | null; categoria?: string | null; pendientes?: boolean; skip?: number; take?: number };

export async function listarDocumentos(ctx: Ctx, f: FiltrosDocumentos = {}) {
  const categoria = (CATEGORIAS_DOCUMENTO as readonly string[]).includes(f.categoria ?? "") ? (f.categoria as CategoriaDocumento) : undefined;
  const where: Prisma.DocumentoWhereInput = {
    AND: [
      whereVisible(ctx),
      f.carpetaId ? { carpetaId: f.carpetaId === "sin" ? null : f.carpetaId } : {},
      categoria ? { categoria } : {},
      f.q
        ? {
            OR: [
              { titulo: insensitive(f.q) },
              { descripcion: insensitive(f.q) },
              { versiones: { some: { deletedAt: null, OR: [{ textoExtraido: insensitive(f.q) }, { nombreArchivo: insensitive(f.q) }] } } },
            ],
          }
        : {},
      f.pendientes ? { requiereAcuse: true } : {},
    ],
  };
  const [docs, total] = await Promise.all([
    ctx.db.documento.findMany({
      where,
      include: {
        carpeta: { select: { nombre: true } },
        versiones: { where: { deletedAt: null }, orderBy: { version: "desc" }, take: 1, select: { version: true, archivoUrl: true, nombreArchivo: true, mime: true, tamano: true, createdAt: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      skip: f.skip ?? 0,
      take: f.take ?? 50,
    }),
    ctx.db.documento.count({ where }),
  ]);
  const acuses = await ctx.db.acuseDocumento.findMany({ where: { usuarioId: ctx.userId, documentoId: { in: docs.map((d) => d.id) } }, select: { documentoId: true, version: true } });
  const items = docs.map((d) => ({
    ...d,
    ultima: d.versiones[0] ?? null,
    acusado: acuses.some((a) => a.documentoId === d.id && a.version === d.versionActual),
  }));
  return { total, items: f.pendientes ? items.filter((i) => !i.acusado) : items };
}

export async function obtenerDocumento(ctx: Ctx, id: string) {
  const d = await ctx.db.documento.findUnique({
    where: { id },
    include: { carpeta: true, versiones: { where: { deletedAt: null }, orderBy: { version: "desc" }, select: { id: true, version: true, archivoUrl: true, nombreArchivo: true, mime: true, tamano: true, notas: true, createdAt: true, subidoPorId: true, textoExtraido: false } } },
  });
  if (!d || !puedeVerDocumento(ctx, d)) notFound("El documento");
  const acuse = await ctx.db.acuseDocumento.findFirst({ where: { documentoId: id, usuarioId: ctx.userId, version: d.versionActual } });
  return { ...d, acusado: !!acuse, acusadoEn: acuse?.leidoEn ?? null };
}

// ── Archivos ──

/** Metadatos y texto de un archivo ya subido a /api/upload. Valida que pertenezca al conjunto. */
export async function infoArchivo(ctx: Pick<Ctx, "conjuntoId">, url: string) {
  if (!url.startsWith(`/api/files/${ctx.conjuntoId}/`) || url.includes("..")) throw new AppError("El archivo no es válido. Súbelo de nuevo.", 400, { archivoUrl: "Archivo no válido" });
  const buf = await readFileByUrl(url);
  if (!buf) throw new AppError("No encontramos el archivo subido. Intenta de nuevo.", 400, { archivoUrl: "Archivo no encontrado" });
  const nombreArchivo = decodeURIComponent(url.split("/").pop() ?? "archivo").replace(/^[a-f0-9]{16}-/, "");
  const mime = mimeFromName(nombreArchivo);
  const textoExtraido = mime === "application/pdf" ? extraerTextoPdf(buf) : null;
  return { nombreArchivo, mime, tamano: buf.length, textoExtraido };
}

// ── Escritura ──

export type DocumentoInput = {
  id?: string | null;
  titulo: string;
  descripcion?: string | null;
  categoria: CategoriaDocumento;
  carpetaId?: string | null;
  rolesVisibles?: string[];
  requiereAcuse?: boolean;
  vence?: Date | null;
  publicado?: boolean;
  generarCodigo?: boolean;
  /** Solo al crear: archivo de la versión 1. */
  archivoUrl?: string | null;
  notas?: string | null;
  notificar?: boolean;
};

function codigo() {
  return crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "X").toUpperCase().slice(0, 10);
}

export async function guardarDocumento(ctx: Ctx, input: DocumentoInput) {
  if (input.carpetaId) {
    const c = await ctx.db.carpetaDocumento.findUnique({ where: { id: input.carpetaId } });
    if (!c) notFound("La carpeta");
  }
  const roles = [...new Set((input.rolesVisibles ?? []).filter(Boolean))];
  const base = {
    titulo: input.titulo.trim(),
    descripcion: input.descripcion ?? null,
    categoria: input.categoria,
    carpetaId: input.carpetaId ?? null,
    rolesVisibles: roles,
    requiereAcuse: !!input.requiereAcuse,
    vence: input.vence ?? null,
    publicado: input.publicado ?? true,
  };
  if (input.id) {
    const antes = await ctx.db.documento.findUnique({ where: { id: input.id } });
    if (!antes) notFound("El documento");
    const d = await ctx.db.documento.update({
      where: { id: input.id },
      data: { ...base, codigoVerificacion: input.generarCodigo && !antes.codigoVerificacion ? codigo() : antes.codigoVerificacion },
    });
    await audit(ctx, "editar", "Documento", d.id, antes, d);
    if (!antes.publicado && d.publicado) await notificarDocumento(ctx, d.id, "nuevo");
    return d;
  }
  if (!input.archivoUrl) throw new AppError("Adjunta el archivo del documento.", 400, { archivoUrl: "Obligatorio" });
  const info = await infoArchivo(ctx, input.archivoUrl);
  const d = await ctx.db.documento.create({
    data: {
      ...base,
      conjuntoId: ctx.conjuntoId,
      versionActual: 1,
      codigoVerificacion: input.generarCodigo ? codigo() : null,
    },
  });
  await ctx.db.versionDocumento.create({
    data: { conjuntoId: ctx.conjuntoId, documentoId: d.id, version: 1, archivoUrl: input.archivoUrl, ...info, subidoPorId: ctx.userId, notas: input.notas ?? null },
  });
  await audit(ctx, "crear", "Documento", d.id, undefined, { titulo: d.titulo, categoria: d.categoria, rolesVisibles: d.rolesVisibles, requiereAcuse: d.requiereAcuse });
  await emit({ tipo: "documento.publicado", conjuntoId: ctx.conjuntoId, data: { id: d.id, version: 1 }, actorId: ctx.userId });
  if (d.publicado && (input.notificar ?? d.requiereAcuse)) await notificarDocumento(ctx, d.id, "nuevo");
  return d;
}

export async function nuevaVersion(ctx: Ctx, documentoId: string, input: { archivoUrl: string; notas?: string | null; notificar?: boolean }) {
  const d = await ctx.db.documento.findUnique({ where: { id: documentoId } });
  if (!d) notFound("El documento");
  const info = await infoArchivo(ctx, input.archivoUrl);
  const ultima = await ctx.db.versionDocumento.findFirst({ where: { documentoId, deletedAt: undefined }, orderBy: { version: "desc" } });
  const version = Math.max(d.versionActual, ultima?.version ?? 0) + 1;
  await ctx.db.versionDocumento.create({
    data: { conjuntoId: ctx.conjuntoId, documentoId, version, archivoUrl: input.archivoUrl, ...info, subidoPorId: ctx.userId, notas: input.notas ?? null },
  });
  await ctx.db.documento.update({ where: { id: documentoId }, data: { versionActual: version } });
  await audit(ctx, "nueva_version", "Documento", documentoId, { version: d.versionActual }, { version, archivo: info.nombreArchivo });
  await emit({ tipo: "documento.publicado", conjuntoId: ctx.conjuntoId, data: { id: documentoId, version }, actorId: ctx.userId });
  if (d.publicado && (input.notificar ?? d.requiereAcuse)) await notificarDocumento(ctx, documentoId, "version");
  return { version };
}

export async function eliminarDocumento(ctx: Ctx, id: string) {
  const d = await ctx.db.documento.findUnique({ where: { id } });
  if (!d) notFound("El documento");
  await ctx.db.documento.update({ where: { id }, data: { deletedAt: new Date(), codigoVerificacion: null } });
  await audit(ctx, "eliminar", "Documento", id, { titulo: d.titulo });
  return true;
}

/** Usuarios que pueden ver el documento (membresías activas con rol permitido). */
export async function usuariosConAcceso(ctx: Pick<Ctx, "db">, doc: { rolesVisibles: string[]; carpeta?: { rolesVisibles: string[] } | null }) {
  const ms = await ctx.db.membresiaConjunto.findMany({
    where: { estado: "ACTIVA" },
    select: { usuarioId: true, rol: { select: { clave: true, basadoEnClave: true } }, usuario: { select: { nombre: true } } },
  });
  return ms.filter((m) => {
    const c = { rolClave: m.rol.clave, rolBase: m.rol.basadoEnClave ?? m.rol.clave };
    return rolPermitido(doc.rolesVisibles, c) && rolPermitido(doc.carpeta?.rolesVisibles, c);
  });
}

async function notificarDocumento(ctx: Ctx, id: string, motivo: "nuevo" | "version") {
  const d = await ctx.db.documento.findUnique({ where: { id }, include: { carpeta: true } });
  if (!d) return;
  const usuarios = (await usuariosConAcceso(ctx, d)).map((m) => m.usuarioId).filter((u) => u !== ctx.userId);
  await notify({
    conjuntoId: ctx.conjuntoId,
    usuarioIds: usuarios,
    titulo: motivo === "nuevo" ? `Nuevo documento: ${d.titulo}` : `Documento actualizado: ${d.titulo}`,
    cuerpo: d.requiereAcuse ? "Por favor léelo y confirma la lectura en la aplicación." : "Ya está disponible en Documentos.",
    enlace: `/documentos/${d.id}`,
    tipo: "DOCUMENTO",
    canales: d.requiereAcuse ? ["push", "email"] : ["push"],
  });
}

/** El residente confirma "Leí el documento" para la versión vigente. Idempotente. */
export async function confirmarLectura(ctx: Ctx, documentoId: string) {
  const d = await ctx.db.documento.findUnique({ where: { id: documentoId }, include: { carpeta: true } });
  if (!d || !puedeVerDocumento(ctx, d)) notFound("El documento");
  if (!d.requiereAcuse) throw new AppError("Este documento no requiere confirmación de lectura.");
  const a = await ctx.db.acuseDocumento.upsert({
    where: { documentoId_usuarioId_version: { documentoId, usuarioId: ctx.userId, version: d.versionActual } },
    create: { conjuntoId: ctx.conjuntoId, documentoId, usuarioId: ctx.userId, version: d.versionActual },
    update: {},
  });
  await audit(ctx, "acuse_lectura", "Documento", documentoId, undefined, { version: d.versionActual });
  return { version: a.version, leidoEn: a.leidoEn };
}

/** Quién leyó la versión vigente y quién falta (para la administración). */
export async function acusesDocumento(ctx: Ctx, documentoId: string, version?: number) {
  const d = await ctx.db.documento.findUnique({ where: { id: documentoId }, include: { carpeta: true } });
  if (!d) notFound("El documento");
  const v = version ?? d.versionActual;
  const [acuses, conAcceso] = await Promise.all([
    ctx.db.acuseDocumento.findMany({ where: { documentoId, version: v }, orderBy: { leidoEn: "desc" } }),
    usuariosConAcceso(ctx, d),
  ]);
  const nombres = new Map(conAcceso.map((m) => [m.usuarioId, m.usuario.nombre]));
  const leyeron = new Set(acuses.map((a) => a.usuarioId));
  // Solo cuentan como pendientes los roles residenciales y del consejo (el personal no suele tener que acusar).
  const pendientes = conAcceso.filter((m) => !leyeron.has(m.usuarioId) && ["PROPIETARIO", "RESIDENTE", "CONVIVIENTE", "CONSEJO"].includes(m.rol.basadoEnClave ?? m.rol.clave));
  return {
    version: v,
    leidos: acuses.map((a) => ({ usuarioId: a.usuarioId, nombre: nombres.get(a.usuarioId) ?? "Usuario retirado", leidoEn: a.leidoEn })),
    pendientes: pendientes.map((m) => ({ usuarioId: m.usuarioId, nombre: m.usuario.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    total: acuses.length + pendientes.length,
  };
}

// ── Carpetas ──

export async function guardarCarpeta(ctx: Ctx, input: { id?: string | null; nombre: string; padreId?: string | null; rolesVisibles?: string[] }) {
  if (input.padreId && input.padreId === input.id) throw new AppError("Una carpeta no puede contenerse a sí misma.");
  const data = { nombre: input.nombre.trim(), padreId: input.padreId ?? null, rolesVisibles: [...new Set(input.rolesVisibles ?? [])] };
  const c = input.id ? await ctx.db.carpetaDocumento.update({ where: { id: input.id }, data }) : await ctx.db.carpetaDocumento.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, input.id ? "editar" : "crear", "CarpetaDocumento", c.id, undefined, data);
  return c;
}

export async function eliminarCarpeta(ctx: Ctx, id: string) {
  const n = await ctx.db.documento.count({ where: { carpetaId: id } });
  if (n) throw new AppError("La carpeta tiene documentos. Muévelos o elimínalos primero.");
  await ctx.db.carpetaDocumento.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(ctx, "eliminar", "CarpetaDocumento", id);
  return true;
}

// ── Vencimientos ──

export async function documentosPorVencer(ctx: Pick<Ctx, "db">, dias = 30, hoy = new Date()) {
  return ctx.db.documento.findMany({
    where: { vence: { not: null, lte: new Date(hoy.getTime() + dias * 86_400_000) } },
    orderBy: { vence: "asc" },
    select: { id: true, titulo: true, categoria: true, vence: true },
  });
}

/** Texto de la versión vigente de documentos visibles (para el asistente IA). */
export async function textoParaIA(ctx: Ctx, categorias: CategoriaDocumento[] = ["REGLAMENTO", "MANUAL_CONVIVENCIA"]) {
  const docs = await ctx.db.documento.findMany({ where: { AND: [whereVisible(ctx), { categoria: { in: categorias } }] }, select: { id: true, titulo: true, versionActual: true } });
  const out: { documentoId: string; titulo: string; texto: string }[] = [];
  for (const d of docs) {
    const v = await ctx.db.versionDocumento.findFirst({ where: { documentoId: d.id, version: d.versionActual }, select: { textoExtraido: true } });
    if (v?.textoExtraido) out.push({ documentoId: d.id, titulo: d.titulo, texto: v.textoExtraido });
  }
  return out;
}
