import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { Section } from "@/components/app/page-header";
import { ActionButton } from "@/components/form/action-form";
import { ZonaForm } from "../zona-form";
import { eliminarAction } from "../../actions";

export const metadata = { title: "Zona común" };

export default async function ZonaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("zonas.ver");
  const { id } = await params;
  const zona = await ctx.db.zonaComun.findUnique({ where: { id } });
  if (!zona) notFound();
  return (
    <>
      <Link href="/conjunto/zonas" className="text-sm text-muted-foreground">
        ← Zonas comunes
      </Link>
      <Section titulo={zona.nombre} acciones={<Link className="text-sm text-primary" href={`/reservas/${zona.id}`}>Ver calendario</Link>}>
        {can(ctx, "zonas.editar") ? <ZonaForm zona={zona} /> : <p className="text-sm">{zona.descripcion}</p>}
      </Section>
      {can(ctx, "zonas.eliminar") && (
        <ActionButton action={eliminarAction} input={{ modelo: "zonaComun", id: zona.id }} variant="destructive" confirm={`¿Eliminar ${zona.nombre}?`} redirectTo="/conjunto/zonas" successMessage="Zona eliminada">
          Eliminar zona
        </ActionButton>
      )}
    </>
  );
}
