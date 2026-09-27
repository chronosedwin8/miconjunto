import QRCode from "qrcode";
import { CheckCircle2 } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { detalleAutorizacion } from "@/lib/porteria/autorizaciones";
import { PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { revocarAutorizacionAction } from "../actions";
import { CompartirPase } from "../_components/compartir";

export const metadata = { title: "Autorización de ingreso" };

export default async function AutorizacionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePage(["visitantes.autorizar", "visitantes.ver_todos"]);
  const { id } = await params;
  const sp = await searchParams;
  const { autorizacion: a, compartir, ingresos, evaluacion } = await detalleAutorizacion(ctx, id);
  const qr = await QRCode.toDataURL(compartir.url, { width: 480, margin: 1, errorCorrectionLevel: "M" });
  const activa = a.estado === "ACTIVA";
  return (
    <>
      <PageHeader titulo={a.nombreVisitante} descripcion={`${label(a.tipo)} · ${a.unidad.codigo}`} volver="/visitantes" acciones={<StatusBadge value={a.estado} />} />
      {spGet(sp, "nuevo") && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm font-medium text-success">
          <CheckCircle2 className="size-5" /> ¡Listo! Comparte el código con tu visitante.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">Código de ingreso</p>
          <p className="font-mono text-5xl font-black tracking-[0.2em]">{a.codigo}</p>
          <img src={qr} alt={`QR de ingreso para ${a.nombreVisitante}`} className={`mx-auto mt-3 aspect-square w-full max-w-64 rounded-lg bg-white p-2 ${activa ? "" : "opacity-30"}`} />
          <p className="mt-2 text-sm font-medium">{compartir.vigencia}</p>
          {!evaluacion.ok && activa && <p className="mt-1 text-xs text-muted-foreground">{evaluacion.motivo}</p>}
        </div>
        <div className="space-y-4">
          {activa && <CompartirPase whatsapp={compartir.whatsapp} mensaje={compartir.mensaje} url={compartir.url} />}
          <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Ingresos</dt>
              <dd className="font-medium">{a.usosPermitidos === 0 ? `${a.usos} (sin límite)` : `${a.usos} de ${a.usosPermitidos}`}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Placa</dt>
              <dd className="font-medium">{a.placa ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Documento</dt>
              <dd className="font-medium">{a.documentoVisitante ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Creada</dt>
              <dd className="font-medium">{fechaHora(a.createdAt)}</dd>
            </div>
            {a.observaciones && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Nota para portería</dt>
                <dd>{a.observaciones}</dd>
              </div>
            )}
          </dl>
          {activa && ctx.unidadIds.includes(a.unidadId) && (
            <ActionButton action={revocarAutorizacionAction} input={{ id: a.id }} variant="destructive" confirm="¿Revocar esta autorización? El código dejará de funcionar." successMessage="Autorización revocada" className="w-full">
              Revocar autorización
            </ActionButton>
          )}
        </div>
      </div>
      {ingresos.length > 0 && (
        <Section titulo="Ingresos con este código" className="mt-6">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {ingresos.map((r) => (
              <li key={r.id} className="flex justify-between p-3">
                <span>{r.nombre}</span>
                <span className="text-muted-foreground">
                  {fechaHora(r.hora)} · {label(r.medio)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
