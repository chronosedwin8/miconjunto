/**
 * Exportación contable de gastos (partida doble) a plantillas de importación de Siigo, World Office,
 * Alegra y Helisa. Funciones puras: el servicio arma las líneas y la ruta las descarga en CSV o Excel.
 *
 * Cada gasto aprobado se causa: débito a la cuenta del gasto (5xxx) contra crédito a cuentas por pagar.
 * Si el gasto ya está PAGADO se genera el egreso: débito a la cuenta del gasto contra crédito a bancos.
 * No calcula retenciones (MiConjunto no es un sistema contable completo): el contador las ajusta.
 */
import { formatInTimeZone } from "date-fns-tz";

export const SOFTWARES = ["SIIGO", "WORLD_OFFICE", "ALEGRA", "HELISA"] as const;
export type Software = (typeof SOFTWARES)[number];

export const SOFTWARE_LABEL: Record<Software, string> = {
  SIIGO: "Siigo Nube",
  WORLD_OFFICE: "World Office",
  ALEGRA: "Alegra",
  HELISA: "Helisa",
};

export type GastoContable = {
  id: string;
  fecha: Date;
  descripcion: string;
  valor: number;
  estado: string;
  cuentaContable: string | null;
  rubroCuenta: string | null;
  rubroNombre: string | null;
  proveedorNit: string | null;
  proveedorNombre: string | null;
};

export type OpcionesContables = {
  nitConjunto: string;
  nombreConjunto: string;
  cuentaBancos: string;
  cuentaPorPagar: string;
  cuentaGastoDefecto: string;
  centroCosto: string;
  comprobanteEgreso: string;
  comprobanteCausacion: string;
  consecutivoInicial: number;
};

export const OPCIONES_DEFECTO: Omit<OpcionesContables, "nitConjunto" | "nombreConjunto"> = {
  cuentaBancos: "111005",
  cuentaPorPagar: "233595",
  cuentaGastoDefecto: "519595",
  centroCosto: "",
  comprobanteEgreso: "CE",
  comprobanteCausacion: "NC",
  consecutivoInicial: 1,
};

export type LineaContable = {
  comprobante: string;
  numero: number;
  fecha: Date;
  cuenta: string;
  nit: string;
  dv: string;
  tercero: string;
  detalle: string;
  centroCosto: string;
  debito: number;
  credito: number;
  referencia: string;
};

const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function nitYDv(valor: string | null | undefined) {
  const v = (valor ?? "").trim();
  const [n, dv] = v.split("-");
  return { nit: soloDigitos(n), dv: soloDigitos(dv) };
}

/** Genera las líneas contables (dos por gasto, cuadradas) de los gastos aprobados o pagados. */
export function asientosDeGastos(gastos: GastoContable[], opts: OpcionesContables): LineaContable[] {
  const out: LineaContable[] = [];
  let numero = opts.consecutivoInicial;
  const ordenados = [...gastos].filter((g) => g.estado === "APROBADO" || g.estado === "PAGADO").sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  for (const g of ordenados) {
    const valor = Math.round(g.valor * 100) / 100;
    if (valor <= 0) continue;
    const pagado = g.estado === "PAGADO";
    const tercero = g.proveedorNit ? nitYDv(g.proveedorNit) : nitYDv(opts.nitConjunto);
    const nombre = g.proveedorNombre ?? opts.nombreConjunto;
    const detalle = g.descripcion.replace(/[\r\n;]+/g, " ").slice(0, 120);
    const base = {
      comprobante: pagado ? opts.comprobanteEgreso : opts.comprobanteCausacion,
      numero,
      fecha: g.fecha,
      nit: tercero.nit,
      dv: tercero.dv,
      tercero: nombre,
      detalle,
      centroCosto: opts.centroCosto,
      referencia: g.id,
    };
    out.push({ ...base, cuenta: g.cuentaContable || g.rubroCuenta || opts.cuentaGastoDefecto, debito: valor, credito: 0 });
    out.push({ ...base, cuenta: pagado ? opts.cuentaBancos : opts.cuentaPorPagar, debito: 0, credito: valor });
    numero++;
  }
  return out;
}

/** Verifica partida doble por comprobante. */
export function cuadra(lineas: LineaContable[]) {
  const por = new Map<string, number>();
  for (const l of lineas) {
    const k = `${l.comprobante}-${l.numero}`;
    por.set(k, Math.round(((por.get(k) ?? 0) + l.debito - l.credito) * 100) / 100);
  }
  return [...por.values()].every((v) => v === 0);
}

type Col = { header: string; valor: (l: LineaContable, f: (d: Date) => string) => string | number };

export type Plantilla = { software: Software; nombre: string; separador: string; formatoFecha: string; columnas: Col[]; nota: string };

const num = (n: number) => (n ? Math.round(n) : 0);
const fmt = (pattern: string) => (d: Date) => formatInTimeZone(d, "America/Bogota", pattern);

/** Plantillas de columnas por software (orden y nombres de las plantillas de importación de cada uno). */
export const PLANTILLAS: Record<Software, Plantilla> = {
  SIIGO: {
    software: "SIIGO",
    nombre: "Siigo Nube · Importación de comprobantes contables",
    separador: ";",
    formatoFecha: "dd/MM/yyyy",
    nota: "Reemplaza el tipo de comprobante por el código configurado en Siigo (p. ej. L-1) antes de importar.",
    columnas: [
      { header: "Tipo de comprobante", valor: (l) => l.comprobante },
      { header: "Consecutivo comprobante", valor: (l) => l.numero },
      { header: "Fecha de elaboración", valor: (l, f) => f(l.fecha) },
      { header: "Sigla moneda", valor: () => "" },
      { header: "Tasa de cambio", valor: () => "" },
      { header: "Código cuenta contable", valor: (l) => l.cuenta },
      { header: "Identificación tercero", valor: (l) => l.nit },
      { header: "Sucursal", valor: () => 0 },
      { header: "Descripción", valor: (l) => l.detalle },
      { header: "Código centro/subcentro de costos", valor: (l) => l.centroCosto },
      { header: "Débito", valor: (l) => num(l.debito) },
      { header: "Crédito", valor: (l) => num(l.credito) },
      { header: "Observaciones", valor: (l) => `MiConjunto ${l.referencia}` },
    ],
  },
  WORLD_OFFICE: {
    software: "WORLD_OFFICE",
    nombre: "World Office · Plantilla de documentos contables",
    separador: ";",
    formatoFecha: "dd/MM/yyyy",
    nota: "Ajusta «Encab: Empresa» al nombre de la empresa creada en World Office.",
    columnas: [
      { header: "Encab: Empresa", valor: () => "" },
      { header: "Encab: Tipo Documento", valor: (l) => l.comprobante },
      { header: "Encab: Prefijo", valor: () => "" },
      { header: "Encab: Documento Número", valor: (l) => l.numero },
      { header: "Encab: Fecha", valor: (l, f) => f(l.fecha) },
      { header: "Encab: Tercero Interno", valor: (l) => l.nit },
      { header: "Encab: Tercero Externo", valor: (l) => l.nit },
      { header: "Encab: Nota", valor: (l) => l.detalle },
      { header: "Doc Contable: Cuenta Contable", valor: (l) => l.cuenta },
      { header: "Doc Contable: Nota", valor: (l) => l.detalle },
      { header: "Doc Contable: Tercero", valor: (l) => l.nit },
      { header: "Doc Contable: Centro costos", valor: (l) => l.centroCosto },
      { header: "Doc Contable: Débito", valor: (l) => num(l.debito) },
      { header: "Doc Contable: Crédito", valor: (l) => num(l.credito) },
    ],
  },
  ALEGRA: {
    software: "ALEGRA",
    nombre: "Alegra · Importación de comprobantes contables",
    separador: ",",
    formatoFecha: "yyyy-MM-dd",
    nota: "Alegra identifica el tercero por su número de identificación; créalo antes si no existe.",
    columnas: [
      { header: "Fecha", valor: (l, f) => f(l.fecha) },
      { header: "Número de comprobante", valor: (l) => `${l.comprobante}-${l.numero}` },
      { header: "Tipo de comprobante", valor: (l) => (l.comprobante === "CE" ? "Comprobante de egreso" : "Nota contable") },
      { header: "Código cuenta contable", valor: (l) => l.cuenta },
      { header: "Identificación tercero", valor: (l) => l.nit },
      { header: "Nombre tercero", valor: (l) => l.tercero },
      { header: "Descripción", valor: (l) => l.detalle },
      { header: "Centro de costo", valor: (l) => l.centroCosto },
      { header: "Débito", valor: (l) => num(l.debito) },
      { header: "Crédito", valor: (l) => num(l.credito) },
    ],
  },
  HELISA: {
    software: "HELISA",
    nombre: "Helisa · Interfaz de movimiento contable",
    separador: ";",
    formatoFecha: "yyyyMMdd",
    nota: "Helisa espera la fecha como AAAAMMDD y el NIT sin dígito de verificación.",
    columnas: [
      { header: "Tipo comprobante", valor: (l) => l.comprobante },
      { header: "Número comprobante", valor: (l) => l.numero },
      { header: "Fecha", valor: (l, f) => f(l.fecha) },
      { header: "Cuenta", valor: (l) => l.cuenta },
      { header: "NIT", valor: (l) => l.nit },
      { header: "DV", valor: (l) => l.dv },
      { header: "Detalle", valor: (l) => l.detalle },
      { header: "Centro de costo", valor: (l) => l.centroCosto },
      { header: "Débito", valor: (l) => num(l.debito) },
      { header: "Crédito", valor: (l) => num(l.credito) },
      { header: "Base", valor: () => 0 },
    ],
  },
};

/** Encabezados y filas de la plantilla del software elegido. */
export function tablaContable(software: Software, lineas: LineaContable[]) {
  const p = PLANTILLAS[software];
  const f = fmt(p.formatoFecha);
  return { headers: p.columnas.map((c) => c.header), rows: lineas.map((l) => p.columnas.map((c) => c.valor(l, f))), separador: p.separador };
}

function csvCell(v: string | number, sep: string) {
  const s = String(v ?? "");
  return s.includes(sep) || s.includes('"') || /[\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con BOM UTF-8 (Excel lo abre con tildes) y fin de línea CRLF. */
export function toCsv(headers: string[], rows: (string | number)[][], sep = ";") {
  const lines = [headers, ...rows].map((r) => r.map((c) => csvCell(c, sep)).join(sep));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** Presupuesto mensualizado para importar en el módulo de presupuesto del software contable. */
export function presupuestoMensualizado(rubros: { tipo: string; nombre: string; cuentaContable: string | null; valorAnual: number }[], centroCosto = "") {
  const headers = ["Cuenta", "Nombre", "Tipo", "Centro de costo", ...["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"], "Total"];
  const rows = rubros.map((r) => {
    const base = Math.floor(r.valorAnual / 12);
    const meses = Array.from({ length: 12 }, (_, i) => (i === 11 ? Math.round(r.valorAnual - base * 11) : base));
    return [r.cuentaContable ?? "", r.nombre, r.tipo === "INGRESO" ? "Ingreso" : "Gasto", centroCosto, ...meses, Math.round(r.valorAnual)];
  });
  return { headers, rows };
}
