/**
 * Servicio de facturación electrónica: cola (FacturaElectronica PENDIENTE → EN_PROCESO → VALIDADA/ERROR),
 * selección de proveedor por conjunto, archivos PDF/XML, correo al residente y notas crédito.
 * La emisión NUNCA bloquea el pago: el evento `pago.aprobado` solo encola y el job `facturacion-pendiente`
 * (cada 5 min) procesa lo que quede.
 */
import type { FacturaElectronica, Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/context";
import { prisma, withTenant } from "@/lib/db";
import { parseConfig } from "@/lib/conjunto/config";
import { credenciales } from "@/lib/integraciones/service";
import { saveFile, readFileByUrl } from "@/lib/storage";
import { queueBrandedEmail, appUrl } from "@/lib/email";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { emit } from "@/lib/events";
import { audit } from "@/lib/audit";
import { AppError, notFound } from "@/lib/errors";
import { toNumber, fechaHora, nombreCompleto } from "@/lib/format";
import type { ConjuntoPdf } from "@/lib/pdf/kit";
import type { DatosFactura, DatosNotaCredito, ElectronicInvoiceProvider, ResultadoEmision } from "./tipos";
import { FactusProvider } from "./factus";
import { AlanubeProvider } from "./alanube";
import { SimuladoProvider, qrSimulado, renderSimulado } from "./simulado";
import { debeFacturar } from "./payload";

export const MAX_INTENTOS = 6;

/** Opciones de la cola (el seed y las pruebas desactivan el segundo plano para ser deterministas). */
export const opcionesCola = { segundoPlano: true, enviarCorreo: true };

// ─────────────────────────── Proveedor por conjunto ───────────────────────────

export type ProveedorInfo = { provider: ElectronicInvoiceProvider; nombre: "FACTUS" | "ALANUBE" | "SIMULADO"; nota?: string; numberingRangeId?: number | null; numberingRangeNotaCreditoId?: number | null };

export async function datosConjuntoPdf(conjuntoId: string): Promise<ConjuntoPdf & { municipioCodigo?: string | null; config: unknown }> {
  const c = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  return { nombre: c.nombre, nit: c.nit ? `${c.nit}${c.digitoVerificacion ? `-${c.digitoVerificacion}` : ""}` : null, direccion: c.direccion, ciudad: c.ciudad, telefono: c.telefono, email: c.email, municipioCodigo: c.municipioCodigo, config: c.config };
}

/**
 * Proveedor configurado para el conjunto (`config.facturacion.proveedor`). Si el proveedor real no tiene
 * credenciales completas se usa el SIMULADO y se informa en `nota`.
 */
export async function proveedorPara(conjuntoId: string): Promise<ProveedorInfo> {
  const conjunto = await datosConjuntoPdf(conjuntoId);
  const cfg = parseConfig(conjunto.config).facturacion;
  const raw = ((conjunto.config as Record<string, unknown>)?.facturacion ?? {}) as Record<string, unknown>;
  const ncRango = raw.numberingRangeNotaCreditoId ? Number(raw.numberingRangeNotaCreditoId) : null;
  const simulado = (nota?: string): ProveedorInfo => ({ provider: new SimuladoProvider(conjuntoId, conjunto), nombre: "SIMULADO", nota });
  if (cfg.proveedor === "FACTUS") {
    const c = await credenciales(conjuntoId, "FACTUS");
    if (!c?.clientId || !c.clientSecret || !c.username || !c.password) return simulado("Factus no tiene credenciales completas; se usó el simulador.");
    const rango = cfg.numberingRangeId ?? (c.numberingRangeId ? Number(c.numberingRangeId) : null);
    return {
      provider: new FactusProvider(conjuntoId, { baseUrl: c.baseUrl, clientId: c.clientId, clientSecret: c.clientSecret, username: c.username, password: c.password }),
      nombre: "FACTUS",
      numberingRangeId: rango,
      numberingRangeNotaCreditoId: ncRango,
    };
  }
  if (cfg.proveedor === "ALANUBE") {
    const c = await credenciales(conjuntoId, "ALANUBE");
    if (!c?.baseUrl || !c.token) return simulado("Alanube no tiene credenciales completas; se usó el simulador.");
    return { provider: new AlanubeProvider({ baseUrl: c.baseUrl, token: c.token }), nombre: "ALANUBE" };
  }
  return simulado();
}

// ─────────────────────────── Datos de la factura ───────────────────────────

type Snapshot = { datos: DatosFactura; enviado?: unknown; numeroFactura?: string; conceptoCorreccion?: string };

async function clienteDeReserva(conjuntoId: string, r: { personaId: string | null; usuarioId: string | null; unidadId: string }, municipio: string | null | undefined) {
  let persona = r.personaId ? await prisma.persona.findFirst({ where: { id: r.personaId, conjuntoId } }) : null;
  if (!persona && r.usuarioId) persona = await prisma.persona.findFirst({ where: { usuarioId: r.usuarioId, conjuntoId, deletedAt: null } });
  if (!persona) {
    const v = await prisma.vinculoUnidad.findFirst({ where: { conjuntoId, unidadId: r.unidadId, estado: "ACTIVO", deletedAt: null, tipo: { in: ["PROPIETARIO", "ARRENDATARIO", "RESIDENTE"] } }, include: { persona: true }, orderBy: { principal: "desc" } });
    persona = v?.persona ?? null;
  }
  const usuario = r.usuarioId ? await prisma.usuario.findUnique({ where: { id: r.usuarioId }, select: { email: true, telefono: true } }) : null;
  if (!persona) return { tipoDocumento: "CC", numeroDocumento: "222222222222", nombre: "Consumidor final", email: usuario?.email ?? null, municipioCodigo: municipio ?? null };
  return {
    tipoDocumento: persona.tipoDocumento,
    numeroDocumento: persona.numeroDocumento,
    nombre: nombreCompleto(persona),
    email: persona.email ?? usuario?.email ?? null,
    telefono: persona.telefono ?? usuario?.telefono ?? null,
    municipioCodigo: municipio ?? null,
  };
}

/**
 * Encola la factura electrónica del alquiler de una reserva pagada (idempotente por reference_code).
 * Devuelve null si la reserva no es facturable (zona sin tarifa, sin `generaFactura` o sin IVA configurado).
 */
export async function encolarFacturaReserva(conjuntoId: string, reservaId: string, pagoId?: string | null) {
  const referenceCode = `RES-${reservaId}`;
  const existe = await prisma.facturaElectronica.findUnique({ where: { referenceCode } });
  if (existe) return existe;
  const r = await prisma.reserva.findFirst({ where: { id: reservaId, conjuntoId }, include: { zona: true, unidad: true } });
  if (!r) return null;
  const valor = toNumber(r.valor);
  if (!debeFacturar({ conceptoTipo: "ALQUILER_ZONA", valor, generaFactura: r.zona.generaFactura })) return null;
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: conjuntoId } });
  const pago = pagoId || r.pagoId ? await prisma.pago.findFirst({ where: { id: (pagoId ?? r.pagoId)!, conjuntoId } }) : null;
  const iva = toNumber(r.iva);
  const tarifaIva = r.zona.gravaIva && iva > 0 ? toNumber(r.zona.tarifaIva) : 0;
  const datos: DatosFactura = {
    referenceCode,
    medioPago: pago?.medio ?? "TRANSFERENCIA",
    datosPasarela: pago?.datosPasarela ?? null,
    referenciaPago: pago?.referencia ?? null,
    cliente: await clienteDeReserva(conjuntoId, r, conjunto.municipioCodigo),
    items: [{ codigo: `ZONA-${r.zona.categoria}`, nombre: r.zona.nombre, cantidad: 1, precio: valor, tarifaIva, excluido: tarifaIva === 0 }],
    totalPagado: valor + iva,
    observacion: `Alquiler de ${r.zona.nombre} el ${fechaHora(r.inicio)} — unidad ${r.unidad.codigo}`,
    enviarCorreo: false, // MiConjunto envía su propio correo con PDF y XML
  };
  const f = await prisma.facturaElectronica.create({
    data: {
      conjuntoId,
      tipo: "FACTURA",
      proveedor: parseConfig(conjunto.config).facturacion.proveedor,
      reservaId,
      pagoId: pago?.id ?? null,
      referenceCode,
      estado: "PENDIENTE",
      payload: { datos } as unknown as Prisma.InputJsonValue,
      subtotal: valor,
      iva,
      total: valor + iva,
      clienteNombre: datos.cliente.nombre,
      clienteDocumento: `${datos.cliente.tipoDocumento} ${datos.cliente.numeroDocumento}`,
      clienteEmail: datos.cliente.email ?? null,
      descripcion: datos.observacion ?? r.zona.nombre,
    },
  });
  if (opcionesCola.segundoPlano) procesarEnSegundoPlano(f.id);
  return f;
}

/** Procesa sin esperar (no bloquea el pago); la cola programada recoge lo que falle. */
export function procesarEnSegundoPlano(id: string) {
  setTimeout(() => {
    procesarFactura(id).catch((e) => console.error("[facturacion] error en segundo plano:", (e as Error).message));
  }, 50);
}

// ─────────────────────────── Procesamiento ───────────────────────────

async function guardarArchivo(f: FacturaElectronica, nombre: string, contenido: Buffer, mime: string) {
  const { url } = await saveFile({ conjuntoId: f.conjuntoId, folder: "facturas", body: contenido, filename: nombre, mime });
  if (f.pagoId) {
    await prisma.adjunto.create({ data: { conjuntoId: f.conjuntoId, entidad: "Pago", entidadId: f.pagoId, url, nombre, mime, tamano: contenido.length } });
  }
  await prisma.adjunto.create({ data: { conjuntoId: f.conjuntoId, entidad: "FacturaElectronica", entidadId: f.id, url, nombre, mime, tamano: contenido.length } });
  return url;
}

/**
 * Emite (o reintenta) una factura / nota crédito. Idempotente: toma la fila con un "claim" atómico
 * (PENDIENTE|ERROR → EN_PROCESO); si otro proceso ya la tomó, no hace nada.
 */
export async function procesarFactura(id: string): Promise<FacturaElectronica | null> {
  const claim = await prisma.facturaElectronica.updateMany({ where: { id, estado: { in: ["PENDIENTE", "ERROR"] }, deletedAt: null }, data: { estado: "EN_PROCESO", intentos: { increment: 1 } } });
  if (claim.count === 0) return prisma.facturaElectronica.findUnique({ where: { id } });
  let f = await prisma.facturaElectronica.findUniqueOrThrow({ where: { id } });
  const snap = (f.payload ?? {}) as unknown as Snapshot;
  let res: ResultadoEmision;
  let info: ProveedorInfo | null = null;
  try {
    if (!snap.datos) throw new Error("La factura no tiene datos para emitir.");
    info = await proveedorPara(f.conjuntoId);
    if (f.tipo === "NOTA_CREDITO") {
      const nc: DatosNotaCredito = { ...snap.datos, numberingRangeId: info.numberingRangeNotaCreditoId ?? null, numeroFactura: snap.numeroFactura ?? "", conceptoCorreccion: (snap.conceptoCorreccion as DatosNotaCredito["conceptoCorreccion"]) ?? "2" };
      res = await info.provider.notaCredito(nc);
    } else {
      res = await info.provider.emitirFactura({ ...snap.datos, numberingRangeId: info.numberingRangeId ?? snap.datos.numberingRangeId ?? null });
    }
  } catch (e) {
    res = { ok: false, validada: false, payload: null, errores: (e as Error).message, mensaje: (e as Error).message, reintentable: true };
  }
  const nuevoSnap = { ...snap, enviado: res.payload ?? snap.enviado } as unknown as Prisma.InputJsonValue;
  if (!res.ok) {
    f = await prisma.facturaElectronica.update({
      where: { id },
      data: {
        estado: "ERROR",
        proveedor: info?.nombre ?? f.proveedor,
        payload: nuevoSnap,
        respuesta: (res.respuesta ?? null) as Prisma.InputJsonValue,
        errores: { mensaje: res.mensaje ?? "Error al emitir", detalle: (res.errores ?? null) as Prisma.InputJsonValue, reintentable: !!res.reintentable } as Prisma.InputJsonValue,
        numero: res.numero ?? f.numero,
        cufe: res.cufe ?? f.cufe,
      },
    });
    if (!res.reintentable || f.intentos >= MAX_INTENTOS) {
      const ids = await usuariosConPermiso(f.conjuntoId, ["facturacion.emitir"]);
      await notify({ conjuntoId: f.conjuntoId, usuarioIds: ids, titulo: "Factura electrónica con error", cuerpo: `${f.referenceCode}: ${res.mensaje ?? "revisa el detalle"}`, enlace: `/facturacion/${f.id}`, tipo: "FACTURACION" });
    }
    return f;
  }
  f = await prisma.facturaElectronica.update({
    where: { id },
    data: {
      estado: "VALIDADA",
      proveedor: info!.nombre,
      numero: res.numero ?? null,
      cufe: res.cufe ?? null,
      validadaEn: res.validadaEn ?? new Date(),
      urlPublica: res.urlPublica ?? null,
      qr: res.qr ?? null,
      errores: res.errores ? ({ advertencias: res.errores } as Prisma.InputJsonValue) : undefined,
      payload: nuevoSnap,
      respuesta: (res.respuesta ?? null) as Prisma.InputJsonValue,
    },
  });
  // Archivos: el simulado los entrega al emitir; Factus/Alanube se descargan (base64).
  try {
    const tipoDoc = f.tipo === "FACTURA" ? "FACTURA" : "NOTA_CREDITO";
    const pdf = res.pdf ? { nombre: `${f.numero}.pdf`, contenido: res.pdf, mime: "application/pdf" } : f.numero ? await info!.provider.descargarPdf(f.numero, tipoDoc) : null;
    const xml = res.xml ? { nombre: `${f.numero}.xml`, contenido: res.xml, mime: "application/xml" } : f.numero ? await info!.provider.descargarXml(f.numero, tipoDoc) : null;
    const data: Prisma.FacturaElectronicaUpdateInput = {};
    if (pdf) data.pdfUrl = await guardarArchivo(f, pdf.nombre, pdf.contenido, pdf.mime);
    if (xml) data.xmlUrl = await guardarArchivo(f, xml.nombre, xml.contenido, xml.mime);
    if (Object.keys(data).length) f = await prisma.facturaElectronica.update({ where: { id }, data });
  } catch (e) {
    console.error("[facturacion] no se pudieron descargar los archivos:", (e as Error).message);
  }
  if (f.tipo === "NOTA_CREDITO" && f.facturaOrigenId && snap.conceptoCorreccion === "2") {
    await prisma.facturaElectronica.update({ where: { id: f.facturaOrigenId }, data: { estado: "ANULADA" } });
  }
  if (opcionesCola.enviarCorreo) await enviarCorreoFactura(f).catch((e) => console.error("[facturacion] correo:", (e as Error).message));
  await emit({ tipo: "factura.validada", conjuntoId: f.conjuntoId, data: { id: f.id, numero: f.numero, reservaId: f.reservaId, tipo: f.tipo, total: toNumber(f.total) } });
  return f;
}

/** Envía la factura (PDF + XML adjuntos) al correo del cliente. */
export async function enviarCorreoFactura(f: FacturaElectronica) {
  if (!f.clienteEmail) return false;
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: f.conjuntoId } });
  const doc = f.tipo === "FACTURA" ? "factura electrónica" : "nota crédito electrónica";
  const simulada = f.proveedor === "SIMULADO";
  const attachments = [
    ...(f.pdfUrl ? [{ filename: `${f.numero}.pdf`, url: f.pdfUrl, contentType: "application/pdf" }] : []),
    ...(f.xmlUrl ? [{ filename: `${f.numero}.xml`, url: f.xmlUrl, contentType: "application/xml" }] : []),
  ];
  await queueBrandedEmail(
    f.clienteEmail,
    `Tu ${doc} N.º ${f.numero}`,
    {
      conjuntoNombre: conjunto.nombre,
      color: conjunto.colorPrimario ?? undefined,
      parrafos: [
        `Hola, ${f.clienteNombre}. Adjuntamos la ${doc} N.º ${f.numero} por ${f.descripcion}.`,
        `Total: $ ${toNumber(f.total).toLocaleString("es-CO")} (IVA incluido: $ ${toNumber(f.iva).toLocaleString("es-CO")}).`,
        ...(f.cufe ? [`${f.tipo === "FACTURA" ? "CUFE" : "CUDE"}: ${f.cufe}`] : []),
        ...(simulada ? ["SIMULACIÓN — sin validez fiscal: este documento se generó en modo demostración."] : []),
      ],
      boton: f.reservaId ? { texto: "Ver mi reserva", url: appUrl(`/reservas/detalle/${f.reservaId}`) } : undefined,
    },
    { conjuntoId: f.conjuntoId, attachments },
  );
  return true;
}

/**
 * Cola programada (cada 5 min): PENDIENTE, ERROR reintentable con backoff exponencial (2^intentos min)
 * y EN_PROCESO atascadas (> 10 min).
 */
export async function procesarPendientes(opts?: { conjuntoId?: string; limite?: number; ahora?: Date }) {
  const ahora = opts?.ahora ?? new Date();
  await prisma.facturaElectronica.updateMany({
    where: { estado: "EN_PROCESO", updatedAt: { lt: new Date(ahora.getTime() - 10 * 60_000) }, ...(opts?.conjuntoId ? { conjuntoId: opts.conjuntoId } : {}) },
    data: { estado: "ERROR" },
  });
  const candidatas = await prisma.facturaElectronica.findMany({
    where: { deletedAt: null, ...(opts?.conjuntoId ? { conjuntoId: opts.conjuntoId } : {}), OR: [{ estado: "PENDIENTE" }, { estado: "ERROR", intentos: { lt: MAX_INTENTOS } }] },
    orderBy: { createdAt: "asc" },
    take: opts?.limite ?? 50,
  });
  let ok = 0;
  let errores = 0;
  for (const f of candidatas) {
    if (f.estado === "ERROR") {
      const e = (f.errores ?? {}) as { reintentable?: boolean };
      if (e.reintentable === false) continue;
      if (f.updatedAt.getTime() > ahora.getTime() - 2 ** f.intentos * 60_000) continue;
    }
    const r = await procesarFactura(f.id);
    if (r?.estado === "VALIDADA") ok++;
    else errores++;
  }
  return { procesadas: ok + errores, validadas: ok, errores };
}

// ─────────────────────────── Acciones del panel ───────────────────────────

/** Reintento manual (reinicia el contador si ya agotó los intentos). */
export async function reintentarFactura(ctx: Ctx, id: string) {
  const f = await ctx.db.facturaElectronica.findUnique({ where: { id } });
  if (!f) notFound("La factura");
  if (!["ERROR", "PENDIENTE"].includes(f.estado)) throw new AppError("Solo se reintentan facturas pendientes o con error.");
  if (f.intentos >= MAX_INTENTOS) await ctx.db.facturaElectronica.update({ where: { id }, data: { intentos: 0 } });
  await audit(ctx, "reintentar", "FacturaElectronica", id);
  return procesarFactura(id);
}

export async function reenviarCorreo(ctx: Ctx, id: string, email?: string | null) {
  const f = await ctx.db.facturaElectronica.findUnique({ where: { id } });
  if (!f) notFound("La factura");
  if (f.estado !== "VALIDADA" && f.estado !== "ANULADA") throw new AppError("La factura aún no está validada.");
  const destino = email || f.clienteEmail;
  if (!destino) throw new AppError("La factura no tiene correo del cliente. Escribe uno.");
  await enviarCorreoFactura({ ...f, clienteEmail: destino });
  await audit(ctx, "reenviar_correo", "FacturaElectronica", id, undefined, { email: destino });
  return true;
}

/** Nota crédito (anulación) de una factura validada — p. ej. cancelación de reserva con reembolso. */
export async function emitirNotaCredito(conjuntoId: string, facturaId: string, motivo: string, actor?: Ctx) {
  const f = await prisma.facturaElectronica.findFirst({ where: { id: facturaId, conjuntoId, deletedAt: null } });
  if (!f) notFound("La factura");
  if (f.tipo !== "FACTURA") throw new AppError("Solo se emiten notas crédito sobre facturas.");
  if (f.estado !== "VALIDADA") throw new AppError("La factura debe estar validada por la DIAN para emitir una nota crédito.");
  const referenceCode = `NC-${f.referenceCode}`;
  const ya = await prisma.facturaElectronica.findUnique({ where: { referenceCode } });
  if (ya) return ya;
  const snap = (f.payload ?? {}) as unknown as Snapshot;
  const datos: DatosFactura = { ...snap.datos, referenceCode, observacion: motivo.slice(0, 240) };
  const nc = await prisma.facturaElectronica.create({
    data: {
      conjuntoId,
      tipo: "NOTA_CREDITO",
      proveedor: f.proveedor,
      reservaId: f.reservaId,
      pagoId: f.pagoId,
      facturaOrigenId: f.id,
      referenceCode,
      estado: "PENDIENTE",
      payload: { datos, numeroFactura: f.numero, conceptoCorreccion: "2" } as unknown as Prisma.InputJsonValue,
      subtotal: f.subtotal,
      iva: f.iva,
      total: f.total,
      clienteNombre: f.clienteNombre,
      clienteDocumento: f.clienteDocumento,
      clienteEmail: f.clienteEmail,
      descripcion: `Nota crédito: ${motivo}`.slice(0, 300),
    },
  });
  if (actor) await audit(actor, "nota_credito", "FacturaElectronica", f.id, undefined, { notaCreditoId: nc.id, motivo });
  if (opcionesCola.segundoPlano) procesarEnSegundoPlano(nc.id);
  return nc;
}

/** Si la reserva se cancela antes de emitir su factura, la factura pendiente se anula. */
export async function anularFacturaPendiente(conjuntoId: string, reservaId: string) {
  const f = await prisma.facturaElectronica.findUnique({ where: { referenceCode: `RES-${reservaId}` } });
  if (!f || f.conjuntoId !== conjuntoId || !["PENDIENTE", "ERROR"].includes(f.estado)) return f;
  if (f.estado === "ERROR") {
    const info = await proveedorPara(conjuntoId).catch(() => null);
    await info?.provider.eliminarPendiente(f.referenceCode).catch(() => false);
  }
  return prisma.facturaElectronica.update({ where: { id: f.id }, data: { estado: "ANULADA" } });
}

// ─────────────────────────── Consultas ───────────────────────────

/** Filtro de visibilidad: residentes solo ven facturas de sus unidades. */
export async function whereFacturasVisibles(ctx: Pick<Ctx, "rolBase" | "unidadIds" | "esSuperAdmin" | "db">): Promise<Prisma.FacturaElectronicaWhereInput> {
  if (ctx.esSuperAdmin || !["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"].includes(ctx.rolBase)) return {};
  const reservas = await ctx.db.reserva.findMany({ where: { unidadId: { in: ctx.unidadIds } }, select: { id: true } });
  return { reservaId: { in: reservas.map((r) => r.id) } };
}

export async function facturaVisible(ctx: Ctx, id: string) {
  const f = await ctx.db.facturaElectronica.findUnique({ where: { id } });
  if (!f) return null;
  const residencial = !ctx.esSuperAdmin && ["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"].includes(ctx.rolBase);
  if (!residencial) return f;
  if (!f.reservaId) return null;
  const r = await ctx.db.reserva.findUnique({ where: { id: f.reservaId }, select: { unidadId: true } });
  return r && ctx.unidadIds.includes(r.unidadId) ? f : null;
}

/** Archivo PDF/XML de una factura desde el almacenamiento (o descargado del proveedor si falta). */
export async function archivoFactura(f: FacturaElectronica, formato: "pdf" | "xml") {
  const url = formato === "pdf" ? f.pdfUrl : f.xmlUrl;
  if (url) {
    const buf = await readFileByUrl(url);
    if (buf) return buf;
  }
  if (!f.numero) return null;
  if (f.proveedor === "SIMULADO") {
    // El seed (tsx) no puede renderizar @react-pdf: el PDF simulado se genera la primera vez que se descarga.
    if (formato !== "pdf" || !f.cufe) return null;
    const snap = (f.payload ?? {}) as unknown as Snapshot;
    if (!snap.datos) return null;
    const conjunto = await datosConjuntoPdf(f.conjuntoId);
    const pdf = await renderSimulado({
      conjunto,
      tipo: f.tipo,
      numero: f.numero,
      cufe: f.cufe,
      fecha: f.validadaEn ?? f.createdAt,
      datos: snap.datos,
      qrDataUrl: f.qr ? await qrSimulado(f.qr) : null,
      simulada: true,
      facturaReferencia: snap.numeroFactura ?? null,
    });
    if (!pdf) return null;
    const url = await guardarArchivo(f, `${f.numero}.pdf`, pdf, "application/pdf");
    await prisma.facturaElectronica.update({ where: { id: f.id }, data: { pdfUrl: url } });
    return pdf;
  }
  const info = await proveedorPara(f.conjuntoId);
  const a = formato === "pdf" ? await info.provider.descargarPdf(f.numero, f.tipo) : await info.provider.descargarXml(f.numero, f.tipo);
  if (!a) return null;
  const nuevaUrl = await guardarArchivo(f, a.nombre, a.contenido, a.mime);
  await prisma.facturaElectronica.update({ where: { id: f.id }, data: formato === "pdf" ? { pdfUrl: nuevaUrl } : { xmlUrl: nuevaUrl } });
  return a.contenido;
}

export type FilaIngreso = { fecha: Date; zona: string; unidad: string; cliente: string; base: number; iva: number; total: number; factura: string; estadoFactura: string; tipo: "ALQUILER" | "NOTA_CREDITO" };

/** Reporte mensual de ingresos por alquiler (base gravable e IVA generado) para el contador. */
export async function reporteIngresosAlquiler(ctx: Pick<Ctx, "db" | "conjuntoId">, mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const desde = new Date(`${mes}-01T00:00:00-05:00`);
  const hasta = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-05:00`);
  const reservas = await ctx.db.reserva.findMany({
    where: { pagada: true, valor: { gt: 0 } },
    include: { zona: { select: { nombre: true, gravaIva: true } }, unidad: { select: { codigo: true } } },
  });
  const pagoIds = reservas.map((r) => r.pagoId).filter(Boolean) as string[];
  const [pagos, facturas, notas] = await Promise.all([
    ctx.db.pago.findMany({ where: { id: { in: pagoIds } }, select: { id: true, fecha: true } }),
    ctx.db.facturaElectronica.findMany({ where: { tipo: "FACTURA", reservaId: { in: reservas.map((r) => r.id) } } }),
    ctx.db.facturaElectronica.findMany({ where: { tipo: "NOTA_CREDITO", estado: "VALIDADA", validadaEn: { gte: desde, lt: hasta } } }),
  ]);
  const fechaPago = new Map(pagos.map((p) => [p.id, p.fecha]));
  const facturaDe = new Map(facturas.map((f) => [f.reservaId, f]));
  const filas: FilaIngreso[] = [];
  for (const r of reservas) {
    const fecha = (r.pagoId && fechaPago.get(r.pagoId)) || r.createdAt;
    if (fecha < desde || fecha >= hasta) continue;
    const f = facturaDe.get(r.id);
    const base = toNumber(r.valor);
    const iva = toNumber(r.iva);
    filas.push({ fecha, zona: r.zona.nombre, unidad: r.unidad.codigo, cliente: f?.clienteNombre ?? "", base, iva, total: base + iva, factura: f?.numero ?? "", estadoFactura: f?.estado ?? (r.zona.gravaIva ? "SIN_FACTURA" : "NO_APLICA"), tipo: "ALQUILER" });
  }
  for (const n of notas) {
    filas.push({ fecha: n.validadaEn!, zona: n.descripcion, unidad: "", cliente: n.clienteNombre, base: -toNumber(n.subtotal), iva: -toNumber(n.iva), total: -toNumber(n.total), factura: n.numero ?? "", estadoFactura: n.estado, tipo: "NOTA_CREDITO" });
  }
  filas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const totales = filas.reduce((a, f) => ({ base: a.base + f.base, iva: a.iva + f.iva, total: a.total + f.total }), { base: 0, iva: 0, total: 0 });
  const porZona = new Map<string, { zona: string; base: number; iva: number; total: number; cantidad: number }>();
  for (const f of filas.filter((x) => x.tipo === "ALQUILER")) {
    const z = porZona.get(f.zona) ?? { zona: f.zona, base: 0, iva: 0, total: 0, cantidad: 0 };
    z.base += f.base;
    z.iva += f.iva;
    z.total += f.total;
    z.cantidad++;
    porZona.set(f.zona, z);
  }
  return { mes, filas, totales, porZona: [...porZona.values()].sort((a, b) => b.total - a.total) };
}

/** Cliente aislado por conjunto para jobs. */
export const dbDe = (conjuntoId: string) => withTenant(prisma, conjuntoId);
