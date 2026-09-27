import { notFound } from "next/navigation";
import { Building2, CreditCard, FlaskConical, QrCode, Smartphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { cop } from "@/lib/format";
import { label } from "@/lib/labels";
import { simuladorVerificarTokenCheckout } from "@/lib/pagos/firmas";
import { simuladorHabilitado } from "@/lib/pagos/providers/simulador";
import { MEDIOS_EN_LINEA } from "@/lib/pagos/types";

export const metadata = { title: "Pasarela de prueba", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ICONOS = { PSE: Building2, TARJETA: CreditCard, NEQUI: Smartphone, BANCOLOMBIA_QR: QrCode } as const;

/**
 * Checkout SIMULADO (demo y pruebas). Imita una pasarela: el pagador elige el medio y aprueba o rechaza;
 * el servidor envía un webhook firmado a /api/webhooks/simulador, igual que una pasarela real.
 */
export default async function SimuladorPage({ params, searchParams }: { params: Promise<{ referencia: string }>; searchParams: Promise<{ t?: string }> }) {
  if (!simuladorHabilitado()) notFound();
  const { referencia } = await params;
  const { t } = await searchParams;
  const ref = decodeURIComponent(referencia);
  if (!simuladorVerificarTokenCheckout(ref, t)) notFound();
  const pago = await prisma.pago.findUnique({
    where: { referencia: ref },
    include: { unidad: { select: { codigo: true } }, conjunto: { select: { nombre: true } } },
  });
  if (!pago || pago.pasarela !== "SIMULADOR") notFound();
  const datos = (pago.datosPasarela ?? {}) as Record<string, unknown>;
  const medioSolicitado = (datos.medioSolicitado as string) ?? pago.medio;
  const cerrado = pago.estado !== "PENDIENTE";

  return (
    <div className="mt-2">
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-warning bg-warning/10 p-3 text-sm text-warning">
        <FlaskConical className="size-5 shrink-0" />
        <span>
          Pasarela de <b>prueba</b>: no se mueve dinero real.
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="bg-zinc-900 p-5 text-white">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Pagar a</p>
          <p className="font-semibold">{pago.conjunto.nombre}</p>
          <p className="mt-3 text-xs text-zinc-400">
            Unidad {pago.unidad.codigo} · Ref. {pago.referencia}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{cop(pago.valor)}</p>
        </div>
        {cerrado ? (
          <div className="p-5 text-center">
            <p className="font-semibold">Esta transacción ya fue procesada ({label(pago.estado).toLowerCase()}).</p>
            <a
              href={`/cuenta/pagos/${pago.referencia}`}
              className="mt-3 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Ver estado
            </a>
          </div>
        ) : (
          <form action="/api/pagos/simulador" method="post" className="space-y-4 p-5">
            <input type="hidden" name="referencia" value={pago.referencia} />
            <input type="hidden" name="t" value={t} />
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Medio de pago</legend>
              <div className="grid grid-cols-2 gap-2">
                {MEDIOS_EN_LINEA.map((m) => {
                  const Icon = ICONOS[m];
                  return (
                    <label
                      key={m}
                      className="flex min-h-14 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    >
                      <input type="radio" name="medio" value={m} defaultChecked={m === medioSolicitado} className="sr-only" />
                      <Icon className="size-4" /> {m === "BANCOLOMBIA_QR" ? "Bancolombia" : label(m)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="submit"
                name="decision"
                value="RECHAZADO"
                className="h-12 rounded-lg border border-destructive/40 bg-destructive/10 font-semibold text-destructive"
              >
                Rechazar
              </button>
              <button type="submit" name="decision" value="APROBADO" className="h-12 rounded-lg bg-success font-semibold text-white dark:text-zinc-950">
                Aprobar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
