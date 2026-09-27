import type { Ctx } from "@/lib/auth/context";
import { saldoUnidad } from "@/lib/cartera/core";
import { toNumber } from "@/lib/format";
import { cuentasAccesibles } from "./acceso";
import { descuentoVigente, valorHoy } from "./calculos";
import { cuotasPagables } from "./service";

/**
 * Widget "Mi cuenta" del Inicio del residente/propietario: saldo, próximo vencimiento (con descuento de
 * pronto pago) y último pago, por cada unidad cuya cuenta puede ver. El botón Pagar enlaza a `pagarHref`.
 */
export type ResumenPagoResidente = {
  unidades: {
    unidadId: string;
    codigo: string;
    saldo: number;
    vencido: number;
    saldoAFavor: number;
    alDia: boolean;
    puedePagar: boolean;
    pagarHref: string;
    proximoVencimiento: { fecha: Date; descripcion: string; valor: number; valorConDescuento: number; descuento: number; fechaProntoPago: Date | null } | null;
    ultimoPago: { fecha: Date; valor: number; estado: string; referencia: string; numeroRecibo: number | null } | null;
  }[];
};

export async function resumenPagoResidente(ctx: Ctx): Promise<ResumenPagoResidente> {
  const cuentas = await cuentasAccesibles(ctx);
  const hoy = new Date();
  const unidades = await Promise.all(
    cuentas.map(async (c) => {
      const [saldo, ultimo] = await Promise.all([
        saldoUnidad(ctx, c.unidadId),
        ctx.db.pago.findFirst({ where: { unidadId: c.unidadId, estado: { in: ["APROBADO", "PENDIENTE"] } }, orderBy: { fecha: "desc" } }),
      ]);
      const proxima = cuotasPagables(saldo)
        .filter((q) => q.fechaVencimiento.getTime() >= hoy.getTime() - 86_400_000)
        .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime())[0];
      return {
        unidadId: c.unidadId,
        codigo: c.codigo,
        saldo: saldo.neto,
        vencido: saldo.vencido,
        saldoAFavor: saldo.saldoAFavor,
        alDia: saldo.vencido - saldo.saldoAFavor <= 0,
        puedePagar: c.puedePagar && saldo.total > 0,
        pagarHref: `/cuenta/pagar?unidad=${c.unidadId}`,
        proximoVencimiento: proxima
          ? {
              fecha: proxima.fechaVencimiento,
              descripcion: proxima.descripcion,
              valor: proxima.saldo,
              valorConDescuento: valorHoy(proxima, hoy),
              descuento: descuentoVigente(proxima, hoy),
              fechaProntoPago: proxima.fechaProntoPago,
            }
          : null,
        ultimoPago: ultimo
          ? { fecha: ultimo.fecha, valor: toNumber(ultimo.valor), estado: ultimo.estado, referencia: ultimo.referencia, numeroRecibo: ultimo.numeroRecibo }
          : null,
      };
    }),
  );
  return { unidades };
}
