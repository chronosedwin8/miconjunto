import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { hora, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { adentroAhora } from "@/lib/porteria/service";
import { calcularTarifaParqueadero } from "@/lib/porteria/reglas";
import { KSection, KTitle } from "../_components/kiosk";
import { AdentroLista } from "../_components/panel";
import { SalidaLibreForm } from "../_components/salida-libre";

export const metadata = { title: "Salida" };

export default async function SalidaPage() {
  const ctx = await requirePage("porteria.registrar");
  const cfg = conjuntoConfig(ctx);
  const ahora = new Date();
  const [adentro, parqs] = await Promise.all([adentroAhora(ctx, ahora), ctx.db.parqueadero.findMany({ where: { tipo: "VISITANTES" }, select: { codigo: true, tarifaHora: true, tarifaDia: true } })]);
  const tarifas = new Map(parqs.map((p) => [p.codigo, { tarifaHora: toNumber(p.tarifaHora), tarifaDia: toNumber(p.tarifaDia) }]));
  return (
    <>
      <KTitle>Registrar salida</KTitle>
      <KSection titulo={`¿Quién sale? (${adentro.length} adentro)`}>
        <AdentroLista
          alertaHoras={cfg.porteria.alertaHorasPermanencia}
          items={adentro.map((a) => {
            const t = a.parqueadero ? tarifas.get(a.parqueadero) : undefined;
            return {
              id: a.id,
              nombre: a.nombre,
              sujetoLabel: label(a.sujeto),
              unidad: a.unidad,
              placa: a.placa,
              parqueadero: a.parqueadero,
              hora: a.hora.toISOString(),
              horaTexto: hora(a.hora),
              minutos: a.minutos,
              alerta: a.alerta,
              fotoUrl: a.fotoUrl,
              valorParqueadero: t ? calcularTarifaParqueadero(t, a.hora, ahora).valor : 0,
            };
          })}
        />
      </KSection>
      <KSection titulo="Salida sin ingreso registrado">
        <div className="max-w-2xl rounded-2xl border-2 p-4">
          <SalidaLibreForm />
        </div>
      </KSection>
    </>
  );
}
