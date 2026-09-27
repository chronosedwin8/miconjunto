import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { unidadOptions } from "@/lib/conjunto/options";
import { can } from "@/lib/permisos";
import { parqueaderoOptions } from "@/lib/porteria/service";
import { Alerta, KTitle } from "../../_components/kiosk";
import { IngresoManualForm } from "../../_components/ingreso-manual";

export const metadata = { title: "Ingreso manual" };

export default async function IngresoManualPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("porteria.registrar");
  const sp = await searchParams;
  const visitanteId = spGet(sp, "visitanteId");
  const [unidades, parqs, visitante] = await Promise.all([
    unidadOptions(ctx),
    parqueaderoOptions(ctx),
    visitanteId ? ctx.db.visitante.findFirst({ where: { id: visitanteId } }) : Promise.resolve(null),
  ]);
  return (
    <>
      <KTitle>Registro manual de ingreso</KTitle>
      {visitante?.listaNegra && (
        <Alerta className="mb-4 text-lg">
          ⛔ {visitante.nombre} tiene orden de no ingreso{can(ctx, ["porteria.ver", "porteria.lista_negra"]) && visitante.motivoListaNegra ? `: ${visitante.motivoListaNegra}` : "."} No permitas el ingreso.
        </Alerta>
      )}
      <div className="max-w-2xl">
        <IngresoManualForm
          unidades={unidades}
          parqueaderos={parqs}
          inicial={
            visitante
              ? { visitanteId: visitante.id, nombre: visitante.nombre, documento: visitante.numeroDocumento, empresa: visitante.empresa, tipo: visitante.tipo === "OTRO" ? "VISITA" : visitante.tipo, fotoUrl: visitante.fotoUrl }
              : { unidadId: spGet(sp, "unidadId"), placa: spGet(sp, "placa"), nombre: spGet(sp, "nombre") }
          }
        />
      </div>
    </>
  );
}
