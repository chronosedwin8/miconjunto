/**
 * Contrato de los proveedores de facturación electrónica (Factus, Alanube, simulado).
 * Solo se facturan alquileres gravados de zonas comunes / parqueadero de visitantes (DIAN).
 */

export type ClienteFactura = {
  tipoDocumento: string; // CC | CE | TI | RC | PA | NIT | PEP | PPT
  numeroDocumento: string;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  /** Código DIVIPOLA del municipio (p. ej. 08001 Barranquilla). */
  municipioCodigo?: string | null;
};

export type ItemFactura = {
  codigo: string;
  nombre: string;
  cantidad: number;
  /** Precio unitario sin IVA. */
  precio: number;
  /** Tarifa de IVA en % (0 si excluido). */
  tarifaIva: number;
  excluido?: boolean;
};

export type DatosFactura = {
  referenceCode: string;
  numberingRangeId?: number | null;
  medioPago: string; // MedioPago de Prisma
  datosPasarela?: unknown;
  referenciaPago?: string | null;
  cliente: ClienteFactura;
  items: ItemFactura[];
  /** Total cobrado (base + IVA) según cartera — para el ajuste de redondeo. */
  totalPagado: number;
  observacion?: string | null;
  enviarCorreo?: boolean;
};

export type DatosNotaCredito = DatosFactura & {
  /** Número de la factura que se anula/corrige. */
  numeroFactura: string;
  /** 1 devolución parcial · 2 anulación · 3 rebaja · 4 ajuste de precio. */
  conceptoCorreccion: "1" | "2" | "3" | "4";
};

export type ResultadoEmision = {
  ok: boolean;
  numero?: string | null;
  cufe?: string | null;
  validada: boolean;
  validadaEn?: Date | null;
  urlPublica?: string | null;
  qr?: string | null;
  errores?: unknown;
  payload: unknown;
  respuesta?: unknown;
  /** PDF/XML generados localmente (proveedor simulado). */
  pdf?: Buffer | null;
  xml?: Buffer | null;
  /** Error transitorio (se reintenta en la cola). */
  reintentable?: boolean;
  mensaje?: string;
};

export type Archivo = { nombre: string; contenido: Buffer; mime: string };

export interface ElectronicInvoiceProvider {
  readonly nombre: "FACTUS" | "ALANUBE" | "SIMULADO";
  emitirFactura(datos: DatosFactura): Promise<ResultadoEmision>;
  notaCredito(datos: DatosNotaCredito): Promise<ResultadoEmision>;
  descargarPdf(numero: string, tipo?: "FACTURA" | "NOTA_CREDITO"): Promise<Archivo | null>;
  descargarXml(numero: string, tipo?: "FACTURA" | "NOTA_CREDITO"): Promise<Archivo | null>;
  eliminarPendiente(referenceCode: string, tipo?: "FACTURA" | "NOTA_CREDITO"): Promise<boolean>;
}
