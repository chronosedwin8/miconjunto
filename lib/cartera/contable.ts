import type { Ctx } from "@/lib/auth/context";
import { fecha as fmtFecha, toNumber } from "@/lib/format";
import { titularesPrincipales } from "./comun";
import { round } from "./calculos";

/**
 * Exportación contable de cartera (causación de cuotas, recaudos y descuentos) como comprobantes de partida doble,
 * con formatos compatibles con Siigo, World Office, Alegra y Helisa (plantillas de importación de comprobantes).
 * Los gastos los exporta el módulo de Presupuesto.
 */

export const FORMATOS_CONTABLES = ["GENERICO", "SIIGO", "WORLD_OFFICE", "ALEGRA", "HELISA"] as const;
export type FormatoContable = (typeof FORMATOS_CONTABLES)[number];
export const FORMATO_LABEL: Record<FormatoContable, string> = { GENERICO: "Genérico (CSV/Excel)", SIIGO: "Siigo Nube", WORLD_OFFICE: "World Office", ALEGRA: "Alegra", HELISA: "Helisa" };

export type CuentasContables = { cartera: string; bancos: string; caja: string; iva: string; descuentos: string; anticipos: string };
/** PUC colombiano (Decreto 2650 / práctica en PH). Editables al exportar. */
export const CUENTAS_DEFECTO: CuentasContables = { cartera: "13050501", bancos: "11100501", caja: "11050501", iva: "24080101", descuentos: "53053501", anticipos: "28050501" };

export type Asiento = {
  comprobante: string; // tipo: CC (causación) | RC (recibo de caja) | NC (nota)
  numero: string;
  fecha: Date;
  cuenta: string;
  tercero: string;
  terceroNombre: string;
  descripcion: string;
  debito: number;
  credito: number;
  unidad: string;
};

export type OpcionesContables = { desde: Date; hasta: Date; tipo: "cuotas" | "pagos" | "todo"; cuentas?: Partial<CuentasContables> };

const CONSUMIDOR_FINAL = "222222222222";

/** Genera los asientos contables del rango (causación de cuotas y recaudo). Cuadra débitos = créditos por comprobante. */
export async function asientosCartera(ctx: Pick<Ctx, "db">, o: OpcionesContables): Promise<Asiento[]> {
  const cu = { ...CUENTAS_DEFECTO, ...Object.fromEntries(Object.entries(o.cuentas ?? {}).filter(([, v]) => v)) } as CuentasContables;
  const out: Asiento[] = [];
  const titulares = await titularesPrincipales(ctx);
  const ter = (unidadId: string) => titulares.get(unidadId) ?? { nombre: "Propietario sin registrar", documento: CONSUMIDOR_FINAL, tipoDocumento: "CC" };
  if (o.tipo !== "pagos") {
    const cuotas = await ctx.db.cuota.findMany({
      where: { fechaEmision: { gte: o.desde, lte: o.hasta }, estado: { not: "ANULADA" }, origen: { not: "APERTURA" } },
      include: { concepto: true, unidad: { select: { codigo: true } } },
      orderBy: [{ fechaEmision: "asc" }, { referenciaPago: "asc" }],
    });
    for (const c of cuotas) {
      // Las cuotas de acuerdos de pago no causan ingreso: reclasifican cartera ya causada.
      if (c.acuerdoId && c.concepto.nombre === "Acuerdo de pago") continue;
      const t = ter(c.unidadId);
      const base = toNumber(c.valorBase);
      const iva = toNumber(c.iva);
      const desc = `${c.descripcion ?? c.concepto.nombre} — ${c.unidad.codigo}`;
      const comun = { comprobante: "CC", numero: c.referenciaPago, fecha: c.fechaEmision, tercero: t.documento, terceroNombre: t.nombre, unidad: c.unidad.codigo };
      out.push({ ...comun, cuenta: cu.cartera, descripcion: desc, debito: round(base + iva), credito: 0 });
      out.push({ ...comun, cuenta: c.concepto.cuentaContable || "42509501", descripcion: desc, debito: 0, credito: round(base) });
      if (iva > 0) out.push({ ...comun, cuenta: cu.iva, descripcion: `IVA ${desc}`, debito: 0, credito: round(iva) });
    }
  }
  if (o.tipo !== "cuotas") {
    const pagos = await ctx.db.pago.findMany({
      where: { fecha: { gte: o.desde, lte: o.hasta }, estado: "APROBADO" },
      include: { unidad: { select: { codigo: true } }, aplicaciones: { where: { deletedAt: null }, select: { valor: true } } },
      orderBy: [{ fecha: "asc" }, { numeroRecibo: "asc" }],
    });
    const descuentos = await ctx.db.movimientoCartera.findMany({ where: { pagoId: { in: pagos.map((p) => p.id) }, tipo: "CREDITO", descripcion: { startsWith: "Descuento pronto pago" } } });
    const descPorPago = new Map<string, number>();
    for (const d of descuentos) descPorPago.set(d.pagoId!, (descPorPago.get(d.pagoId!) ?? 0) + toNumber(d.valor));
    for (const p of pagos) {
      const t = ter(p.unidadId);
      const valor = toNumber(p.valor);
      const aplicado = p.aplicaciones.reduce((a, x) => a + toNumber(x.valor), 0);
      const anticipo = round(Math.max(0, valor - aplicado));
      const comun = { comprobante: "RC", numero: String(p.numeroRecibo ?? p.referencia), fecha: p.fecha, tercero: t.documento, terceroNombre: t.nombre, unidad: p.unidad.codigo };
      const desc = `Recaudo ${p.unidad.codigo} (${p.medio.toLowerCase()})`;
      out.push({ ...comun, cuenta: p.medio === "EFECTIVO" ? cu.caja : cu.bancos, descripcion: desc, debito: round(valor), credito: 0 });
      out.push({ ...comun, cuenta: cu.cartera, descripcion: desc, debito: 0, credito: round(valor - anticipo) });
      if (anticipo > 0) out.push({ ...comun, cuenta: cu.anticipos, descripcion: `Anticipo / saldo a favor ${p.unidad.codigo}`, debito: 0, credito: anticipo });
      const d = round(descPorPago.get(p.id) ?? 0);
      if (d > 0) {
        out.push({ ...comun, comprobante: "NC", cuenta: cu.descuentos, descripcion: `Descuento pronto pago ${p.unidad.codigo}`, debito: d, credito: 0 });
        out.push({ ...comun, comprobante: "NC", cuenta: cu.cartera, descripcion: `Descuento pronto pago ${p.unidad.codigo}`, debito: 0, credito: d });
      }
    }
  }
  return out;
}

export type ColumnaContable = { header: string; valor: (a: Asiento, i: number) => string | number };

const fmtFechaSlash = (d: Date) => fmtFecha(d); // dd/MM/yyyy (Bogotá)
const fmtFechaIso = (d: Date) => fmtFecha(d).split("/").reverse().join("-");

/** Columnas por software contable (plantillas de importación de comprobantes contables). */
export function columnasFormato(f: FormatoContable): ColumnaContable[] {
  switch (f) {
    case "SIIGO":
      return [
        { header: "Tipo de comprobante", valor: (a) => (a.comprobante === "RC" ? "R-1" : a.comprobante === "NC" ? "N-1" : "L-1") },
        { header: "Consecutivo comprobante", valor: (a) => a.numero },
        { header: "Fecha de elaboración", valor: (a) => fmtFechaSlash(a.fecha) },
        { header: "Sigla moneda", valor: () => "COP" },
        { header: "Código cuenta contable", valor: (a) => a.cuenta },
        { header: "Identificación tercero", valor: (a) => a.tercero },
        { header: "Sucursal", valor: () => 0 },
        { header: "Descripción", valor: (a) => a.descripcion },
        { header: "Código centro/subcentro de costos", valor: () => "" },
        { header: "Débito", valor: (a) => a.debito },
        { header: "Crédito", valor: (a) => a.credito },
        { header: "Observaciones", valor: (a) => `Unidad ${a.unidad}` },
      ];
    case "WORLD_OFFICE":
      return [
        { header: "Empresa", valor: () => "" },
        { header: "Tipo Documento", valor: (a) => (a.comprobante === "RC" ? "RC" : a.comprobante === "NC" ? "NC" : "CC") },
        { header: "Prefijo", valor: () => "" },
        { header: "Documento Número", valor: (a) => a.numero },
        { header: "Fecha", valor: (a) => fmtFechaSlash(a.fecha) },
        { header: "Tercero Interno", valor: (a) => a.tercero },
        { header: "Tercero Externo", valor: (a) => a.tercero },
        { header: "Nota", valor: (a) => a.descripcion },
        { header: "Cuenta Contable", valor: (a) => a.cuenta },
        { header: "Débito", valor: (a) => a.debito },
        { header: "Crédito", valor: (a) => a.credito },
      ];
    case "ALEGRA":
      return [
        { header: "Fecha", valor: (a) => fmtFechaIso(a.fecha) },
        { header: "Número", valor: (a) => `${a.comprobante}-${a.numero}` },
        { header: "Tipo de comprobante", valor: (a) => (a.comprobante === "RC" ? "Recibo de caja" : a.comprobante === "NC" ? "Nota contable" : "Causación") },
        { header: "Cuenta contable", valor: (a) => a.cuenta },
        { header: "Identificación del tercero", valor: (a) => a.tercero },
        { header: "Nombre del tercero", valor: (a) => a.terceroNombre },
        { header: "Descripción", valor: (a) => a.descripcion },
        { header: "Débito", valor: (a) => a.debito },
        { header: "Crédito", valor: (a) => a.credito },
      ];
    case "HELISA":
      return [
        { header: "TIPO", valor: (a) => a.comprobante },
        { header: "NUMERO", valor: (a) => a.numero },
        { header: "FECHA", valor: (a) => fmtFechaSlash(a.fecha) },
        { header: "CUENTA", valor: (a) => a.cuenta },
        { header: "NIT", valor: (a) => a.tercero },
        { header: "DETALLE", valor: (a) => a.descripcion.slice(0, 60) },
        { header: "DEBITO", valor: (a) => a.debito },
        { header: "CREDITO", valor: (a) => a.credito },
        { header: "BASE", valor: () => 0 },
        { header: "CENTRO", valor: () => "" },
      ];
    default:
      return [
        { header: "Comprobante", valor: (a) => a.comprobante },
        { header: "Número", valor: (a) => a.numero },
        { header: "Fecha", valor: (a) => fmtFechaSlash(a.fecha) },
        { header: "Cuenta", valor: (a) => a.cuenta },
        { header: "Tercero (documento)", valor: (a) => a.tercero },
        { header: "Tercero (nombre)", valor: (a) => a.terceroNombre },
        { header: "Unidad", valor: (a) => a.unidad },
        { header: "Descripción", valor: (a) => a.descripcion },
        { header: "Débito", valor: (a) => a.debito },
        { header: "Crédito", valor: (a) => a.credito },
      ];
  }
}

/** CSV con separador `;` (Excel en español) y BOM UTF-8. Números sin separador de miles. */
export function asientosCsv(asientos: Asiento[], f: FormatoContable) {
  const cols = columnasFormato(f);
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.header)).join(";"), ...asientos.map((a, i) => cols.map((c) => esc(c.valor(a, i))).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export function totalesAsientos(asientos: Asiento[]) {
  const debito = round(asientos.reduce((s, a) => s + a.debito, 0));
  const credito = round(asientos.reduce((s, a) => s + a.credito, 0));
  return { debito, credito, cuadra: debito === credito, lineas: asientos.length };
}
