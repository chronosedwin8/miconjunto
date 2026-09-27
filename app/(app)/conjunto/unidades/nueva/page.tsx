import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { torreOptions } from "@/lib/conjunto/options";
import { Section } from "@/components/app/page-header";
import { UnidadForm } from "../unidad-form";

export const metadata = { title: "Nueva unidad" };

export default async function NuevaUnidadPage() {
  const ctx = await requirePage("conjunto.crear");
  return (
    <Section titulo="Nueva unidad">
      <UnidadForm torres={await torreOptions(ctx)} puedeCoeficientes={can(ctx, "conjunto.coeficientes")} />
    </Section>
  );
}
