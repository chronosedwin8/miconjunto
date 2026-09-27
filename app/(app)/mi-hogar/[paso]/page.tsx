import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { PASOS_MI_HOGAR } from "@/lib/residentes/calculos";
import { estadoPanel } from "@/lib/residentes/panel";
import { PageHeader } from "@/components/app/page-header";
import { elegirUnidad, Stepper } from "../_components/comun";
import { PASOS } from "../_components/pasos";

export async function generateMetadata({ params }: { params: Promise<{ paso: string }> }) {
  const n = Number((await params).paso);
  return { title: PASOS_MI_HOGAR.find((p) => p.n === n)?.titulo ?? "Mi hogar" };
}

export default async function PasoPage({ params, searchParams }: { params: Promise<{ paso: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePage("residentes.ver");
  const n = Number((await params).paso);
  const paso = PASOS_MI_HOGAR.find((p) => p.n === n);
  if (!paso) notFound();
  const unidadId = elegirUnidad(ctx, spGet(await searchParams, "u"));
  if (!unidadId) redirect("/mi-hogar");
  const [unidad, panel] = await Promise.all([ctx.db.unidad.findUnique({ where: { id: unidadId }, select: { codigo: true } }), estadoPanel(ctx, unidadId)]);
  const Contenido = PASOS[n];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader titulo={paso.titulo} descripcion={`Paso ${n} de ${PASOS_MI_HOGAR.length} · ${unidad?.codigo ?? ""}`} volver={`/mi-hogar?u=${unidadId}`} />
      <Stepper actual={n} completados={panel.completados} unidadId={unidadId} />
      {await Contenido({ ctx, unidadId, codigo: unidad?.codigo ?? "" })}
    </div>
  );
}
