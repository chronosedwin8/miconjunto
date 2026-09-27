import Link from "next/link";
import { CircleX, ShieldCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { verificarComprobante } from "@/lib/votaciones/service";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { spGet, type SP } from "@/lib/pagination";

export const metadata = { title: "Verificar comprobante de voto" };

export default async function ComprobantePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("votaciones.ver");
  const hash = (spGet(await searchParams, "hash") ?? "").trim();
  const r = hash ? await verificarComprobante(ctx, hash) : null;
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader titulo="Verificar comprobante de voto" volver="/votaciones" descripcion="Pega el comprobante que recibiste al votar para confirmar que tu voto quedó registrado." />
      <form method="get" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="hash" className="sr-only">
          Comprobante
        </label>
        <Input id="hash" name="hash" defaultValue={hash} placeholder="64 caracteres (letras y números)" className="font-mono text-xs" autoComplete="off" />
        <Button type="submit">
          <ShieldCheck /> Verificar
        </Button>
      </form>
      {r && !r.valido && (
        <div className="mt-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4" role="alert">
          <CircleX className="size-6 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Comprobante no encontrado</p>
            <p className="text-sm text-muted-foreground">Revisa que lo hayas copiado completo. Si el problema continúa, comunícate con la administración.</p>
          </div>
        </div>
      )}
      {r && r.valido && (
        <div className="mt-4 rounded-xl border border-success/40 bg-success/5 p-4" role="status">
          <p className="flex items-center gap-2 font-semibold text-success">
            <ShieldCheck className="size-6" /> Voto registrado y válido
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Votación</dt>
              <dd>
                <Link href={`/votaciones/${r.votacionId}`} className="underline">
                  {r.pregunta}
                </Link>{" "}
                ({label(r.estado)})
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Registrado</dt>
              <dd>{fechaHora(r.emitidoEn)}</dd>
            </div>
            {r.unidad && (
              <div>
                <dt className="text-xs text-muted-foreground">Unidad</dt>
                <dd>
                  {r.unidad}
                  {r.porPoder ? " (por poder)" : ""}
                </dd>
              </div>
            )}
            {r.opcion && (
              <div>
                <dt className="text-xs text-muted-foreground">Opción registrada</dt>
                <dd className="font-medium">{r.opcion}</dd>
              </div>
            )}
          </dl>
          {!r.unidad && <p className="mt-3 text-xs text-muted-foreground">Por privacidad, la unidad y la opción solo las ve quien votó.</p>}
        </div>
      )}
    </div>
  );
}
