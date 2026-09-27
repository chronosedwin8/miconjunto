import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { cop, tiempoRelativo } from "@/lib/format";
import { label } from "@/lib/labels";
import { bloquesParaMostrar, metaDe, resumenDe } from "@/lib/muro/contenido";
import { pendientesModeracion } from "@/lib/muro/service";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { TextAreaField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moderarPublicacionAction } from "@/app/(app)/muro/actions";

export const metadata = { title: "Moderación" };

export default async function ModeracionPage() {
  const ctx = await requirePage(["clasificados.moderar", "comunicaciones.moderar"]);
  const pendientes = await pendientesModeracion(ctx);
  if (!pendientes.length) return <EmptyState titulo="Todo al día" descripcion="No hay publicaciones pendientes de moderación." />;
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {pendientes.map((p) => {
        const meta = metaDe(p.contenido);
        return (
          <li key={p.id} className="overflow-hidden rounded-2xl border bg-card">
            {p.imagenes[0] && (
              <img src={p.imagenes[0]} alt="" className="h-40 w-full object-cover" />
            )}
            <div className="space-y-2 p-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="warning">{label(p.categoria)}</Badge>
                {meta?.subcategoria && <Badge variant="outline">{label(meta.subcategoria)}</Badge>}
              </div>
              <Link href={`/muro/${p.id}`} className="block font-semibold hover:underline">
                {p.titulo}
              </Link>
              {p.precio !== null && <p className="font-bold text-primary">{cop(p.precio)}</p>}
              <p className="line-clamp-4 text-sm text-muted-foreground">{resumenDe(bloquesParaMostrar(p.contenido), 400)}</p>
              <p className="text-xs text-muted-foreground">
                {p.autor.nombre} · {tiempoRelativo(p.createdAt)}
              </p>
              <div className="flex gap-2 pt-1">
                <ActionButton action={moderarPublicacionAction} input={{ id: p.id, decision: "APROBAR" }} successMessage="Publicado" className="flex-1">
                  Aprobar
                </ActionButton>
                <FormDialog
                  titulo="Rechazar publicación"
                  descripcion="El autor recibirá el motivo."
                  action={moderarPublicacionAction}
                  extra={{ id: p.id, decision: "RECHAZAR" }}
                  submitLabel="Rechazar"
                  successMessage="Rechazado"
                  trigger={
                    <Button variant="outline" className="flex-1">
                      Rechazar
                    </Button>
                  }
                >
                  <TextAreaField name="motivo" label="Motivo" required maxLength={300} placeholder="Ej.: No se permiten ventas de medicamentos." />
                </FormDialog>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
