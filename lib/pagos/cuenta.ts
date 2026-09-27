import type { Ctx } from "@/lib/auth/context";
import { saldoUnidad } from "@/lib/cartera/core";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { diffDays, toNumber } from "@/lib/format";
import { assertVerCuenta } from "./acceso";
import { descuentoVigente, valorHoy } from "./calculos";
import { cuotasPagables, pagosDeUnidad } from "./service";

/** Vista del residente/propietario de la cuenta de una unidad (/cuenta). */
export async function estadoCuentaResidente(ctx: Ctx, unidadId: string) {
  await assertVerCuenta(ctx, unidadId);
  const hoy = new Date();
  const [unidad, saldo, pagos, movimientos, certificados] = await Promise.all([
    ctx.db.unidad.findUniqueOrThrow({ where: { id: unidadId }, select: { id: true, codigo: true, cuotaAdministracion: true } }),
    saldoUnidad(ctx, unidadId, hoy),
    pagosDeUnidad(ctx, unidadId, 20),
    ctx.db.movimientoCartera.findMany({ where: { unidadId }, orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], take: 30 }),
    ctx.db.certificadoPazYSalvo.findMany({ where: { unidadId, estado: "VIGENTE", vigenteHasta: { gte: hoy } }, orderBy: { fecha: "desc" }, take: 3 }),
  ]);
  const cuotas = cuotasPagables(saldo)
    .map((c) => {
      const original = saldo.cuotas.find((x) => x.id === c.id)!;
      return {
        ...c,
        periodo: original.periodo,
        referenciaPago: original.referenciaPago,
        estado: original.estado,
        diasMora: Math.max(0, diffDays(hoy, c.fechaVencimiento)),
        descuento: descuentoVigente(c, hoy),
        valorHoy: valorHoy(c, hoy),
      };
    })
    .sort((a, b) => a.fechaVencimiento.getTime() - b.fechaVencimiento.getTime());
  const totalHoy = cuotas.reduce((a, c) => a + c.valorHoy, 0);
  const descuentoTotal = cuotas.reduce((a, c) => a + c.descuento, 0);
  const proximoProntoPago =
    cuotas.filter((c) => c.descuento > 0 && c.fechaProntoPago).sort((a, b) => a.fechaProntoPago!.getTime() - b.fechaProntoPago!.getTime())[0] ?? null;
  return {
    unidad: { id: unidad.id, codigo: unidad.codigo, cuotaAdministracion: toNumber(unidad.cuotaAdministracion) },
    saldo,
    totalHoy,
    descuentoTotal,
    proximoProntoPago,
    cuotas,
    pagos,
    pagoEnProceso: pagos.find((p) => p.estado === "PENDIENTE" && hoy.getTime() - new Date(p.fecha).getTime() < 24 * 3600_000) ?? null,
    movimientos: movimientos.map((m) => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, valor: toNumber(m.valor), descripcion: m.descripcion })),
    certificados: certificados.map((c) => ({ id: c.id, codigo: c.codigo, fecha: c.fecha, vigenteHasta: c.vigenteHasta })),
    permitirAbonos: conjuntoConfig(ctx).pagos.permitirAbonos,
  };
}
