import { requirePage } from "@/lib/auth/guard";
import { Section } from "@/components/app/page-header";
import { ZonaForm } from "../zona-form";

export const metadata = { title: "Nueva zona común" };

export default async function NuevaZonaPage() {
  await requirePage("zonas.crear");
  return (
    <Section titulo="Nueva zona común">
      <ZonaForm />
    </Section>
  );
}
