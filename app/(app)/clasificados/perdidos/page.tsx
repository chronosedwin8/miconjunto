import Link from "next/link";
import { MapPin, Phone } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha } from "@/lib/format";
import { spGet, type SP } from "@/lib/pagination";
import { listarObjetos, puedeGestionarObjeto } from "@/lib/clasificados/service";
import { FormDialog } from "@/components/app/form-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ListToolbar } from "@/components/app/list-toolbar";
import { ActionButton } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CamposObjeto } from "../_components/campos";
import { cerrarObjetoAction, devolverObjetoAction, reportarObjetoAction } from "../actions";

export const metadata = { title: "Perdidos y encontrados" };

export default async function PerdidosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage(["clasificados.ver", "clasificados.moderar"]);
  const sp = await searchParams;
  const tipo = spGet(sp, "tipo");
  const estado = spGet(sp, "estado");
  const objetos = await listarObjetos(ctx, { tipo, estado, q: spGet(sp, "q") });
  const chip = (params: Record<string, string>, text: string, on: boolean) => (
    <Link key={text} href={`/clasificados/perdidos?${new URLSearchParams(params)}`} aria-current={on ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
      {text}
    </Link>
  );
  return (
    <>
      {can(ctx, "clasificados.publicar") && (
        <div className="mb-3">
          <FormDialog titulo="Reportar objeto" action={reportarObjetoAction} triggerLabel="Reportar perdido o encontrado" successMessage="Reporte publicado">
            <CamposObjeto />
          </FormDialog>
        </div>
      )}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:mx-0 lg:px-0">
        {chip({}, "Abiertos", !tipo && (!estado || estado === "ABIERTO"))}
        {chip({ tipo: "PERDIDO" }, "Se perdió", tipo === "PERDIDO")}
        {chip({ tipo: "ENCONTRADO" }, "Se encontró", tipo === "ENCONTRADO")}
        {chip({ estado: "DEVUELTO" }, "Devueltos", estado === "DEVUELTO")}
      </div>
      <ListToolbar placeholder="Buscar por descripción o lugar…" />
      {objetos.length === 0 ? (
        <EmptyState titulo="No hay reportes" descripcion="Si perdiste o encontraste algo, repórtalo para que los vecinos te ayuden." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {objetos.map((o) => (
            <li key={o.id} className="overflow-hidden rounded-2xl border bg-card">
              {o.fotoUrl && (
                <img src={o.fotoUrl} alt="" loading="lazy" className="h-40 w-full object-cover" />
              )}
              <div className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", o.tipo === "PERDIDO" ? "bg-destructive/10 text-destructive" : "bg-success/15 text-success")}>
                    {o.tipo === "PERDIDO" ? "Se perdió" : "Se encontró"}
                  </span>
                  <StatusBadge value={o.estado} />
                  <span className="ml-auto text-xs text-muted-foreground">{fecha(o.fecha)}</span>
                </div>
                <p className="font-medium">{o.descripcion}</p>
                {o.lugar && (
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5" /> {o.lugar}
                  </p>
                )}
                {o.contacto && (
                  <p className="flex items-center gap-1 text-sm">
                    <Phone className="size-3.5 text-primary" /> {o.contacto}
                  </p>
                )}
                {o.estado === "DEVUELTO" && o.entregadoA && <p className="text-sm text-muted-foreground">Entregado a: {o.entregadoA}</p>}
                {o.estado === "ABIERTO" && puedeGestionarObjeto(ctx, o) && (
                  <div className="flex gap-2 pt-1">
                    <FormDialog
                      titulo="Marcar como devuelto"
                      action={devolverObjetoAction}
                      extra={{ id: o.id }}
                      submitLabel="Confirmar entrega"
                      successMessage="Marcado como devuelto"
                      trigger={
                        <Button size="sm" className="flex-1">
                          Devuelto
                        </Button>
                      }
                    >
                      <TextField name="entregadoA" label="¿A quién se entregó?" required maxLength={120} placeholder="Nombre y unidad" />
                    </FormDialog>
                    <ActionButton action={cerrarObjetoAction} input={{ id: o.id }} variant="outline" size="sm" className="flex-1" confirm="¿Cerrar el reporte sin devolución?">
                      Cerrar
                    </ActionButton>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
