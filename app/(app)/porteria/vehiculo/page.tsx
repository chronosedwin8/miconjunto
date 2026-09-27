import Link from "next/link";
import { Car } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { hora, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { adentroAhora } from "@/lib/porteria/service";
import { calcularTarifaParqueadero } from "@/lib/porteria/reglas";
import { Alerta, KSection, KTitle } from "../_components/kiosk";
import { AdentroLista } from "../_components/panel";
import { PlacaBuscar, VehiculoResidente } from "../_components/vehiculo";
import { SalidaLibreForm } from "../_components/salida-libre";

export const metadata = { title: "Vehículo · Portería" };

/** Control vehicular por placa: vehículos de residentes (ingreso/salida) y de visitantes (con parqueadero). */
export default async function VehiculoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("porteria.registrar");
  const sp = await searchParams;
  const placa = (spGet(sp, "placa") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const ahora = new Date();
  const [vehiculo, adentro, parqs] = placa
    ? await Promise.all([
        ctx.db.vehiculo.findFirst({ where: { placa }, include: { unidad: { select: { id: true, codigo: true } } } }),
        adentroAhora(ctx, ahora),
        ctx.db.parqueadero.findMany({ where: { tipo: "VISITANTES" }, select: { codigo: true, tarifaHora: true, tarifaDia: true } }),
      ])
    : [null, [], []];
  const dentro = adentro.filter((a) => a.placa === placa);
  const tarifas = new Map(parqs.map((p) => [p.codigo, { tarifaHora: toNumber(p.tarifaHora), tarifaDia: toNumber(p.tarifaDia) }]));
  return (
    <>
      <KTitle>Vehículo</KTitle>
      <div className="mb-6 max-w-xl">
        <PlacaBuscar inicial={placa} />
      </div>
      {placa && (
        <>
          {vehiculo && (
            <KSection titulo="Vehículo de residente">
              <div className="max-w-xl rounded-2xl border-2 p-4">
                <p className="flex items-center gap-2 text-2xl font-black">
                  <Car className="size-7" /> <span className="font-mono">{vehiculo.placa}</span>
                  <Link href={`/porteria/unidad/${vehiculo.unidad.id}`} className="rounded-lg bg-foreground px-2 text-lg text-background">
                    {vehiculo.unidad.codigo}
                  </Link>
                </p>
                <p className="mb-3 text-base text-foreground/80">
                  {label(vehiculo.tipo)} · {[vehiculo.marca, vehiculo.modelo, vehiculo.color].filter(Boolean).join(" ")}
                  {!vehiculo.activo && " · INACTIVO"}
                </p>
                {vehiculo.soatVence && vehiculo.soatVence < ahora && <Alerta tono="amber" className="mb-3">SOAT vencido: informa a la administración.</Alerta>}
                <VehiculoResidente placa={vehiculo.placa} unidadId={vehiculo.unidad.id} unidad={vehiculo.unidad.codigo} />
              </div>
            </KSection>
          )}
          {dentro.length > 0 && (
            <KSection titulo="Visitante adentro con esta placa">
              <AdentroLista
                alertaHoras={0}
                items={dentro.map((a) => {
                  const t = a.parqueadero ? tarifas.get(a.parqueadero) : undefined;
                  return { ...a, sujetoLabel: label(a.sujeto), hora: a.hora.toISOString(), horaTexto: hora(a.hora), valorParqueadero: t ? calcularTarifaParqueadero(t, a.hora, ahora).valor : 0 };
                })}
              />
            </KSection>
          )}
          {!vehiculo && !dentro.length && (
            <KSection titulo="Vehículo de visitante">
              <p className="mb-3 text-base">La placa {placa} no pertenece a un residente.</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/porteria/ingreso/manual?placa=${placa}`} className="inline-flex h-16 items-center rounded-xl bg-primary px-6 text-lg font-bold text-primary-foreground">
                  Registrar ingreso de visitante
                </Link>
              </div>
              <div className="mt-6 max-w-2xl rounded-2xl border-2 p-4">
                <p className="mb-2 font-bold">¿Está saliendo?</p>
                <SalidaLibreForm placa={placa} />
              </div>
            </KSection>
          )}
        </>
      )}
    </>
  );
}
