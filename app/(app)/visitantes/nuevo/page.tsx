import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { unidadOptions } from "@/lib/conjunto/options";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AutorizacionForm } from "../_components/autorizacion-form";

export const metadata = { title: "Autorizar visitante" };

export default async function NuevaAutorizacionPage() {
  const ctx = await requirePage("visitantes.autorizar");
  const unidades = await unidadOptions(ctx, { soloPropias: true });
  const cfg = conjuntoConfig(ctx);
  return (
    <>
      <PageHeader titulo="Autorizar visitante" descripcion="Genera un código de 6 dígitos y un QR para compartir." volver="/visitantes" />
      {unidades.length === 0 ? (
        <EmptyState titulo="No tienes unidades vinculadas" descripcion="Pide a la administración que te vincule a tu unidad." />
      ) : (
        <div className="max-w-xl">
          <AutorizacionForm unidades={unidades} exigirSeguridadSocial={cfg.porteria.exigirSeguridadSocialContratistas} />
        </div>
      )}
    </>
  );
}
