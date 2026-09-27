import type { Ctx } from "@/lib/auth/context";
import { AppError, notFound } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { readFileByUrl } from "@/lib/storage";
import { readSheet } from "@/lib/export/xlsx";
import { parseMoney } from "@/lib/validation";
import { parseLocal, toNumber } from "@/lib/format";
import { registrarPago } from "./core";
import { round } from "./calculos";

// ─────────────── Cuentas bancarias ───────────────

export type CuentaInput = { id?: string | null; banco: string; tipo: string; numero: string; titular: string; convenio?: string | null; activa: boolean };

export async function guardarCuentaBancaria(ctx: Ctx, input: CuentaInput) {
  const { id, ...data } = input;
  if (id) {
    const antes = await ctx.db.cuentaBancaria.findUnique({ where: { id } });
    if (!antes) notFound("La cuenta bancaria");
    const c = await ctx.db.cuentaBancaria.update({ where: { id }, data });
    await audit(ctx, "editar", "CuentaBancaria", id, antes, c);
    return c;
  }
  const c = await ctx.db.cuentaBancaria.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
  await audit(ctx, "crear", "CuentaBancaria", c.id, undefined, c);
  return c;
}

export async function eliminarCuentaBancaria(ctx: Ctx, id: string) {
  const c = await ctx.db.cuentaBancaria.findUnique({ where: { id } });
  if (!c) notFound("La cuenta bancaria");
  await ctx.db.cuentaBancaria.update({ where: { id }, data: { deletedAt: new Date(), activa: false } });
  await audit(ctx, "eliminar", "CuentaBancaria", id, c);
}

// ─────────────── Lectura del extracto (puro) ───────────────

export type LineaLeida = { fecha: Date; descripcion: string | null; referencia: string | null; valor: number };

const pick = (row: Record<string, string>, keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(row).find((h) => h === k || h.startsWith(`${k}_`) || h.endsWith(`_${k}`));
    if (hit && row[hit] !== undefined && row[hit] !== "") return row[hit];
  }
  return undefined;
};

/** Fecha de extracto: dd/mm/aaaa, aaaa-mm-dd, dd-mm-aaaa o aaaammdd. */
export function parseFechaExtracto(v: string | undefined): Date | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return parseLocal(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T12:00`);
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return parseLocal(`${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T12:00`);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return parseLocal(`${m[1]}-${m[2]}-${m[3]}T12:00`);
  return null;
}

/**
 * Normaliza las filas del extracto (CSV/Excel con encabezados libres). Toma solo abonos (créditos):
 * columnas `valor`/`monto`/`credito`/`abono`; si hay `debito` con valor, la fila se ignora.
 */
export function normalizarExtracto(rows: Record<string, string>[]): { lineas: LineaLeida[]; ignoradas: number } {
  const lineas: LineaLeida[] = [];
  let ignoradas = 0;
  for (const r of rows) {
    const fecha = parseFechaExtracto(pick(r, ["fecha", "fecha_transaccion", "fecha_movimiento", "date"]));
    const credito = pick(r, ["credito", "creditos", "abono", "abonos", "valor_credito"]);
    const debito = pick(r, ["debito", "debitos", "cargo", "valor_debito"]);
    const valorTxt = credito ?? pick(r, ["valor", "monto", "importe", "value"]);
    const valor = parseMoney(valorTxt ?? "");
    if (!fecha || !Number.isFinite(valor) || valor <= 0 || (debito && parseMoney(debito) > 0 && !credito)) {
      ignoradas++;
      continue;
    }
    lineas.push({
      fecha,
      descripcion: pick(r, ["descripcion", "detalle", "concepto", "description"]) ?? null,
      referencia: pick(r, ["referencia", "ref", "referencia_1", "documento", "numero_documento", "reference"]) ?? null,
      valor: round(valor),
    });
  }
  return { lineas, ignoradas };
}

/** Referencias de 14 dígitos (Cuota.referenciaPago) que aparecen en un texto. */
export function referenciasEnTexto(...textos: (string | null | undefined)[]) {
  const out = new Set<string>();
  for (const t of textos) for (const m of (t ?? "").replace(/[\s-]/g, "").matchAll(/\d{14}/g)) out.add(m[0]);
  return [...out];
}

// ─────────────── Carga y emparejamiento ───────────────

export async function cargarExtracto(ctx: Ctx, input: { cuentaId?: string | null; archivoUrl: string; archivoNombre?: string | null; periodo?: string | null }) {
  const buf = await readFileByUrl(input.archivoUrl);
  if (!buf) throw new AppError("No se pudo leer el archivo cargado.");
  const nombre = input.archivoNombre || input.archivoUrl.split("/").pop() || "extracto";
  const lower = input.archivoUrl.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) throw new AppError("El extracto debe ser un archivo .csv o .xlsx.");
  const rows = await readSheet(buf, lower.endsWith(".csv") ? "extracto.csv" : "extracto.xlsx");
  const { lineas, ignoradas } = normalizarExtracto(rows);
  if (!lineas.length) throw new AppError("No se encontraron abonos en el extracto. Revisa que tenga columnas fecha, descripción, referencia y valor.");
  const conc = await ctx.db.conciliacionBancaria.create({
    data: { conjuntoId: ctx.conjuntoId, cuentaId: input.cuentaId ?? null, archivoNombre: nombre.replace(/^[0-9a-f]{16}-/, ""), periodo: input.periodo ?? null, totalLineas: lineas.length, creadoPorId: ctx.userId },
  });
  await ctx.db.lineaExtracto.createMany({ data: lineas.map((l) => ({ conjuntoId: ctx.conjuntoId, conciliacionId: conc.id, fecha: l.fecha, descripcion: l.descripcion, referencia: l.referencia, valor: l.valor })) });
  const r = await emparejarAutomatico(ctx, conc.id);
  await audit(ctx, "cargar_extracto", "ConciliacionBancaria", conc.id, undefined, { lineas: lineas.length, ignoradas, ...r });
  return { id: conc.id, lineas: lineas.length, ignoradas, ...r };
}

const DIA = 86_400_000;

/**
 * Emparejamiento automático de líneas PENDIENTES:
 * 1) referencia de pago de la cuota (14 dígitos) o referencia del Pago en la descripción → unidad; si existe un pago
 *    aprobado sin conciliar de esa unidad por el mismo valor (±3 días) se empareja; si no, queda sugerida la unidad.
 * 2) valor exacto + fecha (±2 días) con un único pago aprobado sin conciliar (transferencias/consignaciones/PSE).
 */
export async function emparejarAutomatico(ctx: Pick<Ctx, "db" | "conjuntoId">, conciliacionId: string) {
  const lineas = await ctx.db.lineaExtracto.findMany({ where: { conciliacionId, estado: "PENDIENTE" }, orderBy: { fecha: "asc" } });
  if (!lineas.length) return { emparejadas: 0, sugeridas: 0 };
  const minF = new Date(Math.min(...lineas.map((l) => l.fecha.getTime())) - 10 * DIA);
  const maxF = new Date(Math.max(...lineas.map((l) => l.fecha.getTime())) + 10 * DIA);
  const pagos = await ctx.db.pago.findMany({
    where: { estado: "APROBADO", conciliado: false, fecha: { gte: minF, lte: maxF }, medio: { not: "EFECTIVO" } },
    select: { id: true, unidadId: true, valor: true, fecha: true, referencia: true, referenciaExterna: true },
  });
  const usados = new Set<string>();
  let emparejadas = 0;
  let sugeridas = 0;
  for (const l of lineas) {
    const valor = toNumber(l.valor);
    const cerca = (p: (typeof pagos)[number], dias: number) => !usados.has(p.id) && Math.abs(toNumber(p.valor) - valor) < 1 && Math.abs(p.fecha.getTime() - l.fecha.getTime()) <= dias * DIA;
    let pago: (typeof pagos)[number] | undefined;
    let unidadSugeridaId: string | null = null;
    // 1a) Referencia del Pago o referencia externa en el texto.
    const texto = `${l.referencia ?? ""} ${l.descripcion ?? ""}`.toUpperCase();
    pago = pagos.find((p) => !usados.has(p.id) && (texto.includes(p.referencia.toUpperCase()) || (!!p.referenciaExterna && p.referenciaExterna.length >= 5 && texto.includes(p.referenciaExterna.toUpperCase()))));
    // 1b) Referencia de pago de la cuota (14 dígitos).
    if (!pago) {
      const refs = referenciasEnTexto(l.referencia, l.descripcion);
      if (refs.length) {
        const cuota = await ctx.db.cuota.findFirst({ where: { referenciaPago: { in: refs } }, select: { unidadId: true } });
        if (cuota) {
          unidadSugeridaId = cuota.unidadId;
          pago = pagos.find((p) => p.unidadId === cuota.unidadId && cerca(p, 3));
        }
      }
    }
    // 2) Valor + fecha con candidato único.
    if (!pago && !unidadSugeridaId) {
      const cands = pagos.filter((p) => cerca(p, 2));
      if (cands.length === 1) pago = cands[0];
    }
    if (pago) {
      usados.add(pago.id);
      await ctx.db.lineaExtracto.update({ where: { id: l.id }, data: { estado: "EMPAREJADA", pagoId: pago.id, unidadSugeridaId: pago.unidadId } });
      await ctx.db.pago.update({ where: { id: pago.id }, data: { conciliado: true } });
      emparejadas++;
    } else if (unidadSugeridaId) {
      await ctx.db.lineaExtracto.update({ where: { id: l.id }, data: { unidadSugeridaId } });
      sugeridas++;
    }
  }
  await actualizarContadores(ctx, conciliacionId);
  return { emparejadas, sugeridas };
}

async function actualizarContadores(ctx: Pick<Ctx, "db">, conciliacionId: string) {
  const [total, ok] = await Promise.all([
    ctx.db.lineaExtracto.count({ where: { conciliacionId } }),
    ctx.db.lineaExtracto.count({ where: { conciliacionId, estado: { in: ["EMPAREJADA", "CREADA", "IGNORADA"] } } }),
  ]);
  await ctx.db.conciliacionBancaria.update({ where: { id: conciliacionId }, data: { totalLineas: total, emparejadas: ok } });
}

async function lineaPendiente(ctx: Pick<Ctx, "db">, lineaId: string) {
  const l = await ctx.db.lineaExtracto.findUnique({ where: { id: lineaId }, include: { conciliacion: true } });
  if (!l) notFound("La línea del extracto");
  if (l.conciliacion.estado === "CERRADA") throw new AppError("La conciliación está cerrada.");
  if (l.estado !== "PENDIENTE") throw new AppError("La línea ya fue procesada.");
  return l;
}

/** Crea y aplica un pago a partir de una línea no identificada (consignación/transferencia recibida). */
export async function crearPagoDesdeLinea(ctx: Ctx, input: { lineaId: string; unidadId: string; medio?: "CONSIGNACION" | "TRANSFERENCIA" | "PSE" }) {
  const l = await lineaPendiente(ctx, input.lineaId);
  const unidad = await ctx.db.unidad.findUnique({ where: { id: input.unidadId }, select: { id: true } });
  if (!unidad) notFound("La unidad");
  const refs = referenciasEnTexto(l.referencia, l.descripcion);
  const cuotas = refs.length ? await ctx.db.cuota.findMany({ where: { referenciaPago: { in: refs }, unidadId: input.unidadId, saldo: { gt: 0 } }, select: { id: true } }) : [];
  const pago = await registrarPago(ctx, {
    unidadId: input.unidadId,
    valor: toNumber(l.valor),
    fecha: l.fecha,
    medio: input.medio ?? "CONSIGNACION",
    referenciaExterna: l.referencia ?? null,
    observaciones: `Conciliación bancaria: ${l.descripcion ?? ""}`.trim(),
    cuotasSeleccionadas: cuotas.map((c) => c.id),
    estado: "APROBADO",
  });
  await ctx.db.pago.update({ where: { id: pago.id }, data: { conciliado: true } });
  await ctx.db.lineaExtracto.update({ where: { id: l.id }, data: { estado: "CREADA", pagoId: pago.id, unidadSugeridaId: input.unidadId } });
  await actualizarContadores(ctx, l.conciliacionId);
  await audit(ctx, "pago_desde_extracto", "LineaExtracto", l.id, undefined, { pagoId: pago.id, unidadId: input.unidadId });
  return pago;
}

export async function emparejarManual(ctx: Ctx, lineaId: string, pagoId: string) {
  const l = await lineaPendiente(ctx, lineaId);
  const p = await ctx.db.pago.findUnique({ where: { id: pagoId } });
  if (!p || p.estado !== "APROBADO") notFound("El pago aprobado");
  if (p.conciliado) throw new AppError("Ese pago ya está conciliado.");
  await ctx.db.lineaExtracto.update({ where: { id: l.id }, data: { estado: "EMPAREJADA", pagoId, unidadSugeridaId: p.unidadId } });
  await ctx.db.pago.update({ where: { id: pagoId }, data: { conciliado: true } });
  await actualizarContadores(ctx, l.conciliacionId);
  await audit(ctx, "emparejar", "LineaExtracto", l.id, undefined, { pagoId });
}

export async function ignorarLinea(ctx: Ctx, lineaId: string, motivo?: string | null) {
  const l = await lineaPendiente(ctx, lineaId);
  await ctx.db.lineaExtracto.update({ where: { id: l.id }, data: { estado: "IGNORADA", descripcion: motivo ? `${l.descripcion ?? ""} [Ignorada: ${motivo}]`.trim() : l.descripcion } });
  await actualizarContadores(ctx, l.conciliacionId);
  await audit(ctx, "ignorar", "LineaExtracto", l.id, undefined, { motivo });
}

/** Deshace un emparejamiento (la línea vuelve a pendiente y el pago deja de estar conciliado). */
export async function deshacerLinea(ctx: Ctx, lineaId: string) {
  const l = await ctx.db.lineaExtracto.findUnique({ where: { id: lineaId }, include: { conciliacion: true } });
  if (!l) notFound("La línea del extracto");
  if (l.conciliacion.estado === "CERRADA") throw new AppError("La conciliación está cerrada.");
  if (l.estado === "CREADA") throw new AppError("El pago se creó desde esta línea: anúlalo desde Pagos si fue un error.");
  if (l.pagoId) await ctx.db.pago.update({ where: { id: l.pagoId }, data: { conciliado: false } });
  await ctx.db.lineaExtracto.update({ where: { id: l.id }, data: { estado: "PENDIENTE", pagoId: null } });
  await actualizarContadores(ctx, l.conciliacionId);
  await audit(ctx, "deshacer_emparejamiento", "LineaExtracto", l.id, l);
}

export async function cerrarConciliacion(ctx: Ctx, id: string) {
  const c = await ctx.db.conciliacionBancaria.findUnique({ where: { id } });
  if (!c) notFound("La conciliación");
  const pend = await ctx.db.lineaExtracto.count({ where: { conciliacionId: id, estado: "PENDIENTE" } });
  if (pend > 0) throw new AppError(`Quedan ${pend} línea(s) pendientes por identificar. Créales el pago o ignóralas antes de cerrar.`);
  await ctx.db.conciliacionBancaria.update({ where: { id }, data: { estado: "CERRADA" } });
  await audit(ctx, "cerrar", "ConciliacionBancaria", id);
}
