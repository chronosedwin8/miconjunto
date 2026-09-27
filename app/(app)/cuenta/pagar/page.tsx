import Link from "next/link";
import { Wallet } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { cuentasAccesibles } from "@/lib/pagos/acceso";
import { estadoCuentaResidente } from "@/lib/pagos/cuenta";
import { parseConfig } from "@/lib/conjunto/config";
import { credenciales } from "@/lib/integraciones/service";
import { simuladorHabilitado } from "@/lib/pagos/providers";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import { PagarForm } from "./pagar-form";

export const metadata = { title: "Pagar" };

/**
 * CONTRATO: /cuenta/pagar?unidad=<id>&cuotas=<id1,id2>[&origen=reservas&volver=/reservas/123]
 * Otros módulos (reservas, multas) enlazan aquí con cuotas preseleccionadas. Si no llega `unidad`,
 * se toma de la primera cuota.
 */
export default async function PagarPage({ searchParams }: { searchParams: Promise<{ unidad?: string; cuotas?: string; origen?: string; volver?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const pre = (sp.cuotas ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cuentas = (await cuentasAccesibles(ctx)).filter((c) => c.puedePagar);
  let unidadId = sp.unidad;
  if (!unidadId && pre.length) unidadId = (await ctx.db.cuota.findFirst({ where: { id: { in: pre } }, select: { unidadId: true } }))?.unidadId;
  const cuenta = cuentas.find((c) => c.unidadId === unidadId) ?? (unidadId ? undefined : cuentas[0]);

  if (!cuenta) {
    return (
      <>
        <PageHeader titulo="Pagar" volver="/cuenta" />
        <EmptyState
          icon={Wallet}
          titulo="No puedes pagar esta cuenta"
          descripcion="Solo el propietario o quien él autorice puede pagar la cuenta de la unidad."
          accion={<Button render={<Link href="/cuenta" />}>Ir a mi cuenta</Button>}
        />
      </>
    );
  }

  const e = await estadoCuentaResidente(ctx, cuenta.unidadId);
  if (e.cuotas.length === 0) {
    return (
      <>
        <PageHeader titulo="Pagar" volver="/cuenta" />
        <EmptyState
          icon={Wallet}
          titulo="¡Estás al día!"
          descripcion={`La unidad ${e.unidad.codigo} no tiene saldo pendiente.`}
          accion={<Button render={<Link href="/cuenta" />}>Ver mi cuenta</Button>}
        />
      </>
    );
  }

  const disponibles = new Set(e.cuotas.map((c) => c.id));
  const preValidas = pre.filter((id) => disponibles.has(id));
  const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId }, select: { config: true } });
  const pasarela = parseConfig(conjunto.config).pagos.pasarela;
  const real = pasarela !== "SIMULADOR" && !!(await credenciales(ctx.conjuntoId, pasarela));
  const nombrePasarela = real ? (pasarela === "WOMPI" ? "Wompi" : "Mercado Pago") : simuladorHabilitado() ? "pasarela de prueba" : "la pasarela del conjunto";
  const volver = sp.volver && sp.volver.startsWith("/") && !sp.volver.startsWith("//") ? sp.volver : null;

  return (
    <>
      <PageHeader titulo={`Pagar ${e.unidad.codigo}`} descripcion="Elige qué pagar y el medio de pago." volver={volver ?? `/cuenta?unidad=${e.unidad.id}`} />
      {pre.length > 0 && preValidas.length < pre.length && (
        <p className="mb-4 rounded-lg bg-warning/15 p-3 text-sm text-warning">Alguna de las cuotas indicadas ya fue pagada o no está pendiente.</p>
      )}
      <PagarForm
        unidadId={e.unidad.id}
        cuotas={e.cuotas.map((c) => ({
          id: c.id,
          descripcion: c.descripcion,
          vence: c.fechaVencimiento.toISOString(),
          saldo: c.saldo,
          valorHoy: c.valorHoy,
          descuento: c.descuento,
          diasMora: c.diasMora,
          prontoPago: c.fechaProntoPago ? c.fechaProntoPago.toISOString() : null,
        }))}
        preseleccion={preValidas.length ? preValidas : e.cuotas.map((c) => c.id)}
        permitirAbonos={e.permitirAbonos}
        pasarela={nombrePasarela}
        origen={sp.origen?.slice(0, 60) ?? null}
      />
    </>
  );
}
