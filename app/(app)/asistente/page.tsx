import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { iaDisponible } from "@/lib/ia/disponible";
import { historialConsultas } from "@/lib/ia/service";
import { PageHeader } from "@/components/app/page-header";
import { Chat } from "./chat";

export const metadata = { title: "Asistente IA" };

export default async function AsistentePage() {
  const ctx = await requirePage("ia.usar");
  if (!iaDisponible(ctx)) redirect("/inicio");
  const historial = await historialConsultas(ctx);
  return (
    <>
      <PageHeader titulo="Asistente" descripcion="Pregunta sobre el reglamento de propiedad horizontal y el manual de convivencia del conjunto." />
      <Chat historial={historial.filter((h) => h.tipo === "PREGUNTA_REGLAMENTO").reverse().map((h) => ({ pregunta: h.pregunta, respuesta: h.respuesta }))} />
      <p className="mt-4 text-xs text-muted-foreground">Respuestas generadas con IA a partir de los documentos cargados. No reemplazan a la administración ni constituyen asesoría jurídica.</p>
    </>
  );
}
