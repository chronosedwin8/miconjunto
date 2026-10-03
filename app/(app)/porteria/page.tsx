import Link from "next/link";
import { Car, ClipboardList, LogIn, LogOut, PackageCheck, PackagePlus, PackageSearch, Siren, Users } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { can } from "@/lib/permisos";
import { hora } from "@/lib/format";
import { label } from "@/lib/labels";
import { toNumber } from "@/lib/format";
import { adentroAhora, parqueaderoOptions } from "@/lib/porteria/service";
import { calcularTarifaParqueadero } from "@/lib/porteria/reglas";
import { solicitudesPanel } from "@/lib/porteria/solicitudes";
import { resumenPortero } from "@/lib/porteria/inicio";
import { Alerta, BigAction, KSection } from "./_components/kiosk";
import { AdentroLista, SolicitudesPanel } from "./_components/panel";

export const metadata = { title: "Portería" };

/** Pantalla de trabajo del portero (su Inicio): acciones grandes, solicitudes en tiempo real y "Adentro ahora". */
export default async function PorteriaPage() {
  const ctx = await requirePage("porteria.ver");
  const cfg = conjuntoConfig(ctx);
  const ahora = new Date();
  const objetos = can(ctx, "objetos.gestionar");
  const [adentro, solicitudes, resumen, parqs, parqsVis, enCustodia] = await Promise.all([
    adentroAhora(ctx, ahora),
    solicitudesPanel(ctx, ahora),
    resumenPortero(ctx),
    parqueaderoOptions(ctx),
    ctx.db.parqueadero.findMany({ where: { tipo: "VISITANTES" }, select: { codigo: true, tarifaHora: true, tarifaDia: true } }),
    objetos ? ctx.db.objetoPerdido.count({ where: { tipo: "ENCONTRADO", estado: { in: ["EN_CUSTODIA", "RECLAMADO"] } } }) : Promise.resolve(0),
  ]);
  const tarifas = new Map(parqsVis.map((p) => [p.codigo, { tarifaHora: toNumber(p.tarifaHora), tarifaDia: toNumber(p.tarifaDia) }]));
  const registrar = can(ctx, "porteria.registrar");
  return (
    <>
      {!resumen.turnoAbierto && can(ctx, "porteria.turnos") && (
        <Alerta tono="amber" className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span>No has abierto tu turno. Recibe los elementos y firma la apertura.</span>
          <Link href="/porteria/turno" className="inline-flex h-11 items-center rounded-lg bg-amber-950 px-4 text-amber-50">
            Abrir turno
          </Link>
        </Alerta>
      )}

      {solicitudes.length > 0 && (
        <KSection titulo={`Solicitudes al residente (${solicitudes.length})`}>
          <SolicitudesPanel
            parqueaderos={parqs}
            solicitudes={solicitudes.map((s) => ({ ...s, tipoLabel: label(s.tipo), creada: s.creada.toISOString(), expiraEn: s.expiraEn.toISOString() }))}
          />
        </KSection>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {registrar && <BigAction href="/porteria/ingreso" icon={LogIn} label="Ingreso visitante" hint="QR, código o sin autorización" tono="primary" className="col-span-2 md:col-span-2" />}
        {registrar && <BigAction href="/porteria/salida" icon={LogOut} label="Salida" hint={`${adentro.length} adentro`} tono="dark" badge={resumen.alertasPermanencia || undefined} />}
        {can(ctx, "paqueteria.recibir") && <BigAction href="/porteria/paquetes/recibir" icon={PackagePlus} label="Recibir paquete" tono="blue" />}
        {can(ctx, "paqueteria.entregar") && <BigAction href="/porteria/paquetes/entregar" icon={PackageCheck} label="Entregar paquete" hint={`${resumen.paquetesEnPorteria} en portería`} tono="violet" />}
        {registrar && <BigAction href="/porteria/vehiculo" icon={Car} label="Vehículo" hint="Por placa" tono="slate" />}
        {can(ctx, "porteria.novedades") && <BigAction href="/porteria/novedades/nueva" icon={ClipboardList} label="Novedad" tono="amber" />}
        <BigAction href="/porteria/emergencia" icon={Siren} label="Emergencia" tono="red" badge={resumen.alertasActivas || undefined} />
        {objetos && <BigAction href={`/objetos-perdidos/nuevo?tipo=ENCONTRADO&custodia=${encodeURIComponent("Portería principal")}`} icon={PackageSearch} label="Objeto encontrado" hint={enCustodia ? `${enCustodia} en custodia` : "Recibir y guardar"} tono="outline" />}
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-base">
        <span className="rounded-full border-2 px-3 py-1 font-semibold">Ingresos hoy: {resumen.ingresosHoy}</span>
        <span className="rounded-full border-2 px-3 py-1 font-semibold">Salidas hoy: {resumen.salidasHoy}</span>
        <span className="rounded-full border-2 px-3 py-1 font-semibold">Paquetes en portería: {resumen.paquetesEnPorteria}</span>
      </div>

      <KSection
        titulo={
          <span className="inline-flex items-center gap-2">
            <Users className="size-6" /> Adentro ahora ({adentro.length})
          </span>
        }
      >
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
    </>
  );
}
