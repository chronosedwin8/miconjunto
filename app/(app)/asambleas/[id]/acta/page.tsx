import { requirePage } from "@/lib/auth/guard";
import { generarTextoActa, obtenerAsamblea } from "@/lib/asambleas/service";
import { ActaEditor } from "./acta-editor";

export const metadata = { title: "Acta de la asamblea" };

export default async function ActaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.gestionar");
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const texto = a.actaTexto ?? (await generarTextoActa(ctx, id));
  return (
    <ActaEditor
      key={`${a.updatedAt.getTime()}`}
      asambleaId={id}
      texto={texto}
      presidente={a.presidenteNombre ?? ""}
      secretario={a.secretarioNombre ?? ""}
      firmaPresidente={a.firmaPresidente}
      firmaSecretario={a.firmaSecretario}
      finalizada={a.estado === "FINALIZADA"}
      publicada={!!a.actaPublicadaEn}
      codigo={a.actaCodigo}
    />
  );
}
