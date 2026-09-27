import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { autorizadosRecoger } from "@/lib/paqueteria/service";
import { diasEnPorteria } from "@/lib/porteria/reglas";
import { EmptyState } from "@/components/app/empty-state";
import { KTitle } from "../../_components/kiosk";
import { EntregarPaqueteForm } from "../../_components/paquetes";
import { UnidadPicker } from "../../_components/ingreso";

export const metadata = { title: "Entregar paquete" };

export default async function EntregarPaquetePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("paqueteria.entregar");
  const sp = await searchParams;
  const unidadId = spGet(sp, "unidadId");
  if (!unidadId) {
    return (
      <>
        <KTitle>Entregar paquete</KTitle>
        <div className="max-w-xl">
          <UnidadPicker unidades={await unidadOptions(ctx)} destino="/porteria/paquetes/entregar?unidadId=" label="Unidad que recoge" />
        </div>
      </>
    );
  }
  const [unidad, paquetes, autorizados] = await Promise.all([
    ctx.db.unidad.findFirst({ where: { id: unidadId }, select: { codigo: true } }),
    ctx.db.paquete.findMany({ where: { unidadId, estado: "EN_PORTERIA" }, orderBy: { llegadaEn: "asc" } }),
    autorizadosRecoger(ctx, unidadId),
  ]);
  return (
    <>
      <KTitle>Entregar paquetes · {unidad?.codigo}</KTitle>
      {paquetes.length === 0 ? (
        <EmptyState titulo="Sin paquetes pendientes" descripcion="Esta unidad no tiene paquetes en portería." />
      ) : (
        <div className="max-w-3xl">
          <EntregarPaqueteForm
            paquetes={paquetes.map((p) => ({
              id: p.id,
              titulo: `${label(p.tipo)}${p.transportadora ? ` · ${p.transportadora}` : ""}`,
              detalle: `${fechaHora(p.llegadaEn)} · ${diasEnPorteria(p.llegadaEn)} día(s)${p.destinatario ? ` · para ${p.destinatario}` : ""}`,
              fotoUrl: p.fotoUrl,
            }))}
            autorizados={autorizados.map((a) => ({ ...a, tipoLabel: label(a.tipo) }))}
          />
        </div>
      )}
    </>
  );
}
