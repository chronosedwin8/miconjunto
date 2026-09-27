import { requirePage } from "@/lib/auth/guard";
import { misUnidadesAsamblea, obtenerAsamblea, ventanaAsistencia } from "@/lib/asambleas/service";
import { EmptyState } from "@/components/app/empty-state";
import { spGet, type SP } from "@/lib/pagination";
import { AsistenciaPropia } from "../asistencia-propia";

export const metadata = { title: "Registrar asistencia" };

/** Destino del QR proyectado en la sala: /asambleas/<id>/asistir?c=<código>. Un toque para registrar. */
export default async function AsistirPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePage("asambleas.ver");
  const { id } = await params;
  const codigo = spGet(await searchParams, "c") ?? null;
  const a = await obtenerAsamblea(ctx, id);
  const mias = await misUnidadesAsamblea(ctx, id);
  const v = ventanaAsistencia(a);
  if (!mias.length) {
    return (
      <EmptyState
        titulo="No tienes unidades para registrar"
        descripcion="Solo los propietarios (o quienes tengan un poder aprobado) registran asistencia. Si te otorgaron un poder, pide a la administración que lo apruebe."
      />
    );
  }
  return (
    <div className="mx-auto max-w-lg">
      <AsistenciaPropia asambleaId={id} modalidad={a.modalidad} unidades={mias} codigoInicial={codigo} habilitado={v.ok} motivo={v.motivo} />
    </div>
  );
}
