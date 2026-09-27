import type { Prisma } from "@prisma/client";
import { insensitive } from "@/lib/pagination";
import { parseLocal } from "@/lib/format";

type Sp = Record<string, string | undefined>;

const unidadTorre = (torre?: string) => (torre ? (torre === "casas" ? { torreId: null } : { torreId: torre }) : undefined);

/** Filtros de la lista de cuotas (compartidos entre la página y la exportación). */
export function filtroCuotas(sp: Sp): Prisma.CuotaWhereInput {
  const w: Prisma.CuotaWhereInput = {};
  if (sp.q) w.OR = [{ descripcion: insensitive(sp.q) }, { referenciaPago: { contains: sp.q } }, { unidad: { codigo: insensitive(sp.q) } }];
  if (sp.estado === "VENCIDA") {
    w.estado = { in: ["PENDIENTE", "PARCIAL"] };
    w.saldo = { gt: 0 };
    w.fechaVencimiento = { lt: new Date() };
  } else if (sp.estado) w.estado = sp.estado as never;
  if (sp.concepto) w.conceptoId = sp.concepto;
  if (sp.periodo) w.periodo = sp.periodo;
  if (sp.unidad) w.unidadId = sp.unidad;
  const t = unidadTorre(sp.torre);
  if (t) w.unidad = { ...(w.unidad as object), ...t };
  return w;
}

/** Filtros de la lista de pagos. */
export function filtroPagos(sp: Sp): Prisma.PagoWhereInput {
  const w: Prisma.PagoWhereInput = {};
  if (sp.q) {
    const n = Number(sp.q);
    w.OR = [{ referencia: insensitive(sp.q) }, { referenciaExterna: insensitive(sp.q) }, { unidad: { codigo: insensitive(sp.q) } }, ...(Number.isInteger(n) && n > 0 ? [{ numeroRecibo: n }] : [])];
  }
  if (sp.estado) w.estado = sp.estado as never;
  if (sp.medio) w.medio = sp.medio as never;
  if (sp.conciliado) w.conciliado = sp.conciliado === "si";
  if (sp.unidad) w.unidadId = sp.unidad;
  if (sp.desde || sp.hasta) w.fecha = { ...(sp.desde ? { gte: parseLocal(sp.desde) } : {}), ...(sp.hasta ? { lt: new Date(parseLocal(sp.hasta).getTime() + 86_400_000) } : {}) };
  const t = unidadTorre(sp.torre);
  if (t) w.unidad = { ...(w.unidad as object), ...t };
  return w;
}

export function filtroGestiones(sp: Sp): Prisma.GestionCobroWhereInput {
  const w: Prisma.GestionCobroWhereInput = {};
  if (sp.q) w.OR = [{ unidad: { codigo: insensitive(sp.q) } }, { resultado: insensitive(sp.q) }, { notas: insensitive(sp.q) }];
  if (sp.canal) w.canal = sp.canal as never;
  if (sp.unidad) w.unidadId = sp.unidad;
  return w;
}
