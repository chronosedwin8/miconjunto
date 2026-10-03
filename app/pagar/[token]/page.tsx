import { headers } from "next/headers";
import { Building2, CheckCircle2, LinkIcon } from "lucide-react";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { datosLinkPago } from "@/lib/pagos/publico";
import { cuotasPagables } from "@/lib/pagos/service";
import { valorHoy, descuentoVigente } from "@/lib/pagos/calculos";
import { cop, fecha } from "@/lib/format";
import { PagoPublicoForm } from "./pago-publico-form";

export const metadata = { title: "Pagar administración", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Página pública (sin sesión) del link de pago enviado en el correo de cobro. */
export default async function PagoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = clientIp(await headers());
  const permitido = rateLimit(`pagar-link:${ip}`, 30, 60_000).ok;
  const datos = permitido ? await datosLinkPago(token) : null;

  if (!datos) {
    return (
      <div className="mt-16 rounded-2xl border bg-card p-6 text-center">
        <LinkIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">{permitido ? "Este link de pago no es válido o ya venció" : "Demasiadas consultas"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {permitido ? "Pide un nuevo link a la administración o ingresa a Conjunto360 para pagar desde tu cuenta." : "Espera un minuto e inténtalo de nuevo."}
        </p>
        <a href="/login" className="mt-4 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Iniciar sesión
        </a>
      </div>
    );
  }

  const hoy = new Date();
  const cuotas = cuotasPagables(datos.saldo);
  const total = cuotas.reduce((a, c) => a + valorHoy(c, hoy), 0);
  const ahorro = cuotas.reduce((a, c) => a + descuentoVigente(c, hoy), 0);

  return (
    <>
      <header className="mb-5 flex items-center gap-3">
        <div
          className="grid size-12 place-items-center rounded-2xl text-white shadow-sm"
          style={{ backgroundColor: datos.conjunto.colorPrimario ?? "#0f766e" }}
        >
          <Building2 className="size-7" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight">{datos.conjunto.nombre}</p>
          <p className="text-sm text-muted-foreground">Pago de administración · Unidad {datos.unidad.codigo}</p>
        </div>
      </header>

      {total <= 0 ? (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 size-12 text-success" />
          <h1 className="text-xl font-bold">¡La unidad {datos.unidad.codigo} está al día!</h1>
          <p className="mt-1 text-sm text-muted-foreground">No hay saldo pendiente por pagar.</p>
        </div>
      ) : (
        <>
          <section className="mb-5 rounded-2xl border bg-card p-5">
            <p className="text-sm text-muted-foreground">Saldo a pagar hoy</p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">{cop(total)}</p>
            {datos.saldo.vencido > 0 && <p className="mt-1 text-sm text-destructive">Incluye {cop(datos.saldo.vencido)} vencido</p>}
            {ahorro > 0 && <p className="mt-1 text-sm font-medium text-success">Incluye descuento por pronto pago de {cop(ahorro)}</p>}
            <ul className="mt-3 divide-y border-t text-sm">
              {cuotas.map((c) => (
                <li key={c.id} className="flex justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">
                    {c.descripcion}
                    <span className="block text-xs text-muted-foreground">Vence {fecha(c.fechaVencimiento)}</span>
                  </span>
                  <span className="font-medium tabular-nums">{cop(valorHoy(c, hoy))}</span>
                </li>
              ))}
            </ul>
          </section>
          <PagoPublicoForm token={token} total={total} permitirAbonos={datos.permitirAbonos} />
        </>
      )}
    </>
  );
}
