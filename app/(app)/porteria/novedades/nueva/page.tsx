import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { unidadOptions } from "@/lib/conjunto/options";
import { KTitle } from "../../_components/kiosk";
import { NovedadForm } from "../../_components/novedad-form";

export const metadata = { title: "Nueva novedad" };

export default async function NuevaNovedadPage() {
  const ctx = await requirePage("porteria.novedades");
  return (
    <>
      <KTitle>Registrar novedad</KTitle>
      <div className="max-w-2xl">
        <NovedadForm unidades={await unidadOptions(ctx)} puedeTicket={can(ctx, ["tickets.crear", "porteria.novedades"])} />
      </div>
    </>
  );
}
