import QRCode from "qrcode";
import { requirePage } from "@/lib/auth/guard";
import { obtenerAsamblea, quorumAsamblea } from "@/lib/asambleas/service";
import { calcularResultadoActual } from "@/lib/votaciones/service";
import { LiveRefresh } from "@/components/gobierno/live-refresh";
import { QuorumMeter } from "@/components/gobierno/quorum-meter";
import { appUrl } from "@/lib/email";
import { hora, num } from "@/lib/format";

export const metadata = { title: "Quórum en vivo" };

/** Vista para proyector (legible a distancia): quórum, QR de asistencia y votación en curso. */
export default async function ProyectorPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["asambleas.gestionar", "asambleas.asistencia"]);
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const [q, abierta] = await Promise.all([quorumAsamblea(ctx, a), ctx.db.votacion.findFirst({ where: { asambleaId: id, estado: "ABIERTA" }, orderBy: { inicio: "desc" } })]);
  const r = abierta ? await calcularResultadoActual(ctx, abierta) : null;
  const qr = await QRCode.toDataURL(appUrl(`/asambleas/${id}/asistir?c=${a.codigoAsistencia}`), { margin: 1, width: 480 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold lg:text-5xl">{a.titulo}</h1>
        <LiveRefresh canales={[`asamblea:${id}`, ...(abierta ? [`votacion:${abierta.id}`] : [])]} pollMs={10000} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <QuorumMeter grande porcentaje={q.porcentaje} requerido={q.requerido} hayQuorum={q.hayQuorum} unidades={q.unidadesPresentes} totalUnidades={q.totalUnidades} faltante={q.faltante} />
        <div className="rounded-xl border bg-card p-4 text-center">
          <img src={qr} alt="QR para registrar asistencia" className="mx-auto size-56 bg-white p-2 lg:size-72" />
          <p className="mt-2 text-lg font-semibold lg:text-2xl">Escanea para registrar tu asistencia</p>
        </div>
      </div>
      {abierta && r && (
        <div className="rounded-xl border-2 border-primary bg-card p-6 lg:p-10">
          <p className="text-lg text-muted-foreground lg:text-2xl">
            Votación en curso · punto {abierta.puntoOrden} · cierra {hora(abierta.fin)}
          </p>
          <p className="mt-1 text-2xl font-bold lg:text-5xl">{abierta.pregunta}</p>
          <p className="mt-2 text-lg lg:text-3xl">
            Han votado <b>{r.totalVotos}</b> de {q.unidadesPresentes} unidades presentes ({num(r.participacionCoeficiente)} % del coeficiente)
          </p>
          <ul className="mt-6 space-y-4">
            {r.opciones.map((o) => (
              <li key={o.id}>
                <div className="flex justify-between text-xl font-semibold lg:text-4xl">
                  <span>{o.texto}</span>
                  <span className="tabular-nums">{num(o.pctCoeficiente)} %</span>
                </div>
                <div className="mt-2 h-5 overflow-hidden rounded-full bg-muted lg:h-8">
                  <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${Math.min(100, o.pctCoeficiente)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
