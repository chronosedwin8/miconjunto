/**
 * Tablas de referencia DIAN/Factus cacheadas en BD (`TablaReferencia`, fuente FACTUS).
 * Fuente: https://developers.factus.com.co/tablas-de-referencia/tablas/ y /municipios/ (consultadas 2026-09).
 */
import type { PrismaClient } from "@prisma/client";

type Fila = { tipo: string; codigo: string; nombre: string; extra?: Record<string, unknown> };

export const TABLAS_FACTUS: Fila[] = [
  // Métodos de pago
  ...[
    ["10", "Efectivo"],
    ["42", "Consignación"],
    ["20", "Cheque"],
    ["47", "Transferencia"],
    ["71", "Bonos"],
    ["72", "Vales"],
    ["1", "Medio de pago no definido"],
    ["49", "Tarjeta débito"],
    ["48", "Tarjeta crédito"],
    ["ZZZ", "Otro"],
  ].map(([codigo, nombre]) => ({ tipo: "metodo_pago", codigo, nombre })),
  // Formas de pago
  { tipo: "forma_pago", codigo: "1", nombre: "Pago de contado" },
  { tipo: "forma_pago", codigo: "2", nombre: "Pago a crédito" },
  // Unidades de medida (las usadas por MiConjunto)
  { tipo: "unidad_medida", codigo: "94", nombre: "Unidad" },
  { tipo: "unidad_medida", codigo: "HUR", nombre: "Hora" },
  { tipo: "unidad_medida", codigo: "DAY", nombre: "Día" },
  // Tributos del cliente
  { tipo: "tributo_cliente", codigo: "01", nombre: "IVA" },
  { tipo: "tributo_cliente", codigo: "ZZ", nombre: "No aplica" },
  // Impuestos
  { tipo: "impuesto", codigo: "01", nombre: "Impuesto sobre las ventas (IVA)" },
  { tipo: "impuesto", codigo: "04", nombre: "Impuesto Nacional al Consumo" },
  // Estándar de producto
  { tipo: "estandar_producto", codigo: "999", nombre: "Estándar de adopción del contribuyente" },
  // Tipos de organización
  { tipo: "organizacion", codigo: "1", nombre: "Persona jurídica" },
  { tipo: "organizacion", codigo: "2", nombre: "Persona natural" },
  // Responsabilidades fiscales
  { tipo: "responsabilidad", codigo: "R-99-PN", nombre: "No responsable" },
  { tipo: "responsabilidad", codigo: "O-13", nombre: "Gran contribuyente" },
  { tipo: "responsabilidad", codigo: "O-15", nombre: "Autorretenedor" },
  { tipo: "responsabilidad", codigo: "O-23", nombre: "Agente de retención de IVA" },
  { tipo: "responsabilidad", codigo: "O-47", nombre: "Régimen simple de tributación" },
  // Documentos de identidad
  ...[
    ["11", "Registro civil", "RC"],
    ["12", "Tarjeta de identidad", "TI"],
    ["13", "Cédula de ciudadanía", "CC"],
    ["21", "Tarjeta de extranjería", ""],
    ["22", "Cédula de extranjería", "CE"],
    ["31", "NIT", "NIT"],
    ["41", "Pasaporte", "PA"],
    ["42", "Documento de identificación extranjero", ""],
    ["47", "PEP", "PEP"],
    ["48", "PPT (Permiso de Protección Temporal)", "PPT"],
  ].map(([codigo, nombre, local]) => ({ tipo: "documento_identidad", codigo, nombre, extra: local ? { tipoDocumento: local } : undefined })),
  // Conceptos de corrección de notas crédito
  { tipo: "correccion_nota_credito", codigo: "1", nombre: "Devolución parcial / no aceptación parcial del servicio" },
  { tipo: "correccion_nota_credito", codigo: "2", nombre: "Anulación de factura electrónica" },
  { tipo: "correccion_nota_credito", codigo: "3", nombre: "Rebaja o descuento parcial o total" },
  { tipo: "correccion_nota_credito", codigo: "4", nombre: "Ajuste de precio" },
  // Municipios (DIVIPOLA) principales
  { tipo: "municipio", codigo: "08001", nombre: "Barranquilla", extra: { departamento: "Atlántico" } },
  { tipo: "municipio", codigo: "11001", nombre: "Bogotá, D.C.", extra: { departamento: "Bogotá, D.C." } },
  { tipo: "municipio", codigo: "05001", nombre: "Medellín", extra: { departamento: "Antioquia" } },
  { tipo: "municipio", codigo: "76001", nombre: "Cali", extra: { departamento: "Valle del Cauca" } },
  { tipo: "municipio", codigo: "13001", nombre: "Cartagena de Indias", extra: { departamento: "Bolívar" } },
  { tipo: "municipio", codigo: "68001", nombre: "Bucaramanga", extra: { departamento: "Santander" } },
  { tipo: "municipio", codigo: "08758", nombre: "Soledad", extra: { departamento: "Atlántico" } },
  { tipo: "municipio", codigo: "08573", nombre: "Puerto Colombia", extra: { departamento: "Atlántico" } },
];

/** Carga/actualiza las tablas de referencia de Factus (idempotente). */
export async function sincronizarTablasReferencia(db: Pick<PrismaClient, "tablaReferencia">, filas: Fila[] = TABLAS_FACTUS) {
  for (const f of filas) {
    await db.tablaReferencia.upsert({
      where: { fuente_tipo_codigo: { fuente: "FACTUS", tipo: f.tipo, codigo: f.codigo } },
      create: { fuente: "FACTUS", tipo: f.tipo, codigo: f.codigo, nombre: f.nombre, extra: f.extra as object | undefined },
      update: { nombre: f.nombre, extra: f.extra as object | undefined, deletedAt: null },
    });
  }
  return filas.length;
}
