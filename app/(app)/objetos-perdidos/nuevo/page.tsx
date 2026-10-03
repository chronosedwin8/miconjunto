import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { spGet, type SP } from "@/lib/pagination";
import { isoDate } from "@/lib/format";
import { zonaOptions } from "@/lib/conjunto/options";
import { esGestorObjetos } from "@/lib/objetos-perdidos/service";
import { PageHeader } from "@/components/app/page-header";
import { ReporteForm } from "./reporte-form";

export const metadata = { title: "Reportar objeto" };

export default async function NuevoObjetoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["objetos.reportar", "objetos.gestionar"]);
  const sp = await searchParams;
  const tipo = spGet(sp, "tipo") === "ENCONTRADO" ? "ENCONTRADO" : "PERDIDO";
  const [zonas, usuario] = await Promise.all([zonaOptions(ctx), prisma.usuario.findUnique({ where: { id: ctx.userId }, select: { telefono: true } })]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader volver="/objetos-perdidos" titulo="Reportar objeto" descripcion="Entre más detalles, más fácil será encontrarlo o devolverlo." />
      <ReporteForm
        tipoInicial={tipo}
        zonas={zonas}
        telefono={usuario?.telefono ?? null}
        gestor={esGestorObjetos(ctx)}
        custodiaInicial={spGet(sp, "custodia") ?? (esGestorObjetos(ctx) && tipo === "ENCONTRADO" ? "Portería principal" : null)}
        hoy={isoDate(new Date())}
      />
    </div>
  );
}
