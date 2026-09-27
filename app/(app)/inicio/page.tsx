import { requireCtx } from "@/lib/auth/context";
import { PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Inicio" };

export default async function InicioPage() {
  const ctx = await requireCtx();
  return <PageHeader titulo={`Hola, ${ctx.nombre.split(" ")[0]}`} descripcion={`${ctx.conjunto.nombre} · ${ctx.rolNombre}`} />;
}
