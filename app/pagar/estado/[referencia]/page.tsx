import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { estadoPagoPublico } from "@/lib/pagos/publico";
import { sincronizarPago } from "@/lib/pagos/service";
import { EstadoPagoPoller, ResultadoPago } from "@/components/pagos/estado-pago";

export const metadata = { title: "Estado del pago", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Retorno público de la pasarela para pagos hechos desde el link del correo (firma `f` obligatoria). */
export default async function EstadoPagoPublicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ referencia: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  const { referencia } = await params;
  const { f } = await searchParams;
  const ref = decodeURIComponent(referencia);
  const ip = clientIp(await headers());
  let p = rateLimit(`pagar-estado:${ip}`, 60, 60_000).ok ? await estadoPagoPublico(ref, f) : null;
  if (p?.estado === "PENDIENTE" && Date.now() - new Date(p.fecha).getTime() > 60_000 && rateLimit(`pago-sync:${p.id}`, 1, 20_000).ok) {
    await sincronizarPago(p.id).catch(() => null);
    p = await estadoPagoPublico(ref, f);
  }
  if (!p) {
    return (
      <div className="mt-16 rounded-2xl border bg-card p-6 text-center">
        <h1 className="text-xl font-bold">No encontramos este pago</h1>
        <p className="mt-2 text-sm text-muted-foreground">Si pagaste, la administración verá el pago en unos minutos. Guarda el comprobante de la pasarela.</p>
      </div>
    );
  }
  return (
    <div className="mt-6">
      <p className="mb-3 text-center text-sm text-muted-foreground">{p.conjunto}</p>
      <EstadoPagoPoller pendiente={p.estado === "PENDIENTE"} />
      <ResultadoPago estado={p.estado} valor={p.valor} unidad={p.unidad} referencia={p.referencia} recibo={p.numeroRecibo} />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        ¿Tienes cuenta en MiConjunto?{" "}
        <a href="/cuenta" className="font-medium text-primary underline">
          Ver mi cuenta
        </a>
      </p>
    </div>
  );
}
