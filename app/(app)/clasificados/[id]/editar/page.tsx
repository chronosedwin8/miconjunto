import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/guard";
import { toNumber } from "@/lib/format";
import { bloquesParaMostrar, metaDe, textoPlano } from "@/lib/muro/contenido";
import { esModeradorClasificados } from "@/lib/muro/service";
import { Section } from "@/components/app/page-header";
import { ActionForm } from "@/components/form/action-form";
import { CamposClasificado } from "../../_components/campos";
import { guardarClasificadoAction } from "../../actions";

export const metadata = { title: "Editar clasificado" };

export default async function EditarClasificadoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["clasificados.publicar", "clasificados.moderar"]);
  const { id } = await params;
  const p = await ctx.db.publicacion.findUnique({ where: { id } });
  if (!p || p.categoria !== "CLASIFICADO") notFound();
  if (p.autorId !== ctx.userId && !esModeradorClasificados(ctx)) redirect("/sin-permiso");
  const meta = metaDe(p.contenido);
  const descripcion = bloquesParaMostrar(p.contenido)
    .map((b) => (b.tipo === "texto" ? textoPlano(b.html.replace(/<\/p>/g, "\n\n").replace(/<br\s*\/?>/g, "\n")) : ""))
    .filter(Boolean)
    .join("\n\n");
  return (
    <Section titulo="Editar clasificado">
      <div className="max-w-xl">
        <ActionForm action={guardarClasificadoAction} extra={{ id }} successMessage="Enviado a revisión" redirectTo="/muro/{id}" submitClassName="w-full">
          <CamposClasificado
            inicial={{ titulo: p.titulo, subcategoria: meta?.subcategoria ?? null, descripcion, precio: p.precio ? toNumber(p.precio) : null, contacto: meta?.contacto ?? null, imagenes: p.imagenes, permiteComentarios: p.permiteComentarios }}
          />
        </ActionForm>
      </div>
    </Section>
  );
}
