import Link from "next/link";
import { Car, KeyRound, Package } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { fichaPorteriaUnidad } from "@/lib/porteria/service";
import { textoVigencia } from "@/lib/porteria/autorizaciones";
import { diasEnPorteria } from "@/lib/porteria/reglas";
import { Foto, KSection, KTitle } from "../../_components/kiosk";
import { FrecuentesLista, NotificarResidente } from "../../_components/frecuentes";

export const metadata = { title: "Unidad · Portería" };

/** Ficha de portería de una unidad: frecuentes (1 toque), notificar al residente, autorizaciones de hoy y paquetes. */
export default async function UnidadPorteriaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("porteria.ver");
  const { id } = await params;
  const f = await fichaPorteriaUnidad(ctx, id);
  return (
    <>
      <KTitle
        acciones={
          <Link href={`/porteria/ingreso/manual?unidadId=${f.unidad.id}`} className="inline-flex h-12 items-center rounded-xl border-2 px-4 text-base font-bold">
            Registro manual
          </Link>
        }
      >
        <span className="rounded-xl bg-foreground px-3 text-background">{f.unidad.codigo}</span>
        {f.unidad.torre && <span className="ml-2 text-lg font-semibold text-muted-foreground">{f.unidad.torre}</span>}
        {f.unidad.movilidad && <span className="ml-2 text-lg">♿</span>}
      </KTitle>

      {f.autorizaciones.length > 0 && (
        <KSection titulo={`Autorizaciones vigentes (${f.autorizaciones.length})`}>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {f.autorizaciones.map((a) => (
              <li key={a.id}>
                <Link href={`/porteria/ingreso?codigo=${a.codigo}`} className={`flex items-center gap-3 rounded-2xl border-2 p-3 ${a.evaluacion.ok ? "border-green-700/60" : "opacity-70"}`}>
                  <KeyRound className="size-7 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">{a.nombreVisitante}</span>
                    <span className="block text-sm text-foreground/75">
                      {label(a.tipo)} · {textoVigencia(a)}
                    </span>
                    {!a.evaluacion.ok && <span className="block text-sm font-semibold text-amber-800 dark:text-amber-300">{a.evaluacion.motivo}</span>}
                  </span>
                  <span className="font-mono text-lg font-black">{a.codigo}</span>
                </Link>
              </li>
            ))}
          </ul>
        </KSection>
      )}

      <KSection titulo="Frecuentes (ingreso con un toque)">
        <FrecuentesLista items={f.frecuentes.map((x) => ({ ...x, tipoLabel: label(x.tipo) }))} />
      </KSection>

      <KSection titulo="Visitante sin autorización">
        <div className="max-w-2xl rounded-2xl border-2 p-4">
          <NotificarResidente unidadId={f.unidad.id} unidad={f.unidad.codigo} />
        </div>
      </KSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <KSection titulo="Residentes">
          <ul className="grid gap-2">
            {f.residentes.map((r) => (
              <li key={r.vinculoId} className="flex items-center gap-3 rounded-xl border-2 p-2">
                <Foto src={r.fotoUrl} alt={r.nombre} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.nombre}</span>
                  <span className="text-sm text-foreground/75">
                    {label(r.tipo)}
                    {r.menor && " · menor de edad"}
                    {r.telefono && ` · ${r.telefono}`}
                  </span>
                </span>
              </li>
            ))}
            {!f.residentes.length && <li className="text-muted-foreground">Sin residentes registrados.</li>}
          </ul>
        </KSection>
        <div>
          <KSection titulo="Vehículos">
            <ul className="flex flex-wrap gap-2">
              {f.vehiculos.map((v) => (
                <li key={v.id} className="inline-flex items-center gap-2 rounded-xl border-2 px-3 py-2">
                  <Car className="size-5" /> <span className="font-mono text-lg font-bold">{v.placa}</span>
                  <span className="text-sm text-foreground/75">{[v.marca, v.color].filter(Boolean).join(" ")}</span>
                </li>
              ))}
              {!f.vehiculos.length && <li className="text-muted-foreground">Sin vehículos.</li>}
            </ul>
          </KSection>
          <KSection titulo={`Paquetes en portería (${f.paquetes.length})`}>
            <ul className="grid gap-2">
              {f.paquetes.map((p) => (
                <li key={p.id}>
                  <Link href={`/porteria/paquetes/entregar?unidadId=${f.unidad.id}`} className="flex items-center gap-3 rounded-xl border-2 p-3 hover:bg-muted">
                    <Package className="size-6" />
                    <span className="flex-1">
                      {label(p.tipo)} {p.transportadora && `· ${p.transportadora}`} · {fechaHora(p.llegadaEn)}
                    </span>
                    <span className="text-sm font-semibold">{diasEnPorteria(p.llegadaEn)} d</span>
                  </Link>
                </li>
              ))}
              {!f.paquetes.length && <li className="text-muted-foreground">No hay paquetes pendientes.</li>}
            </ul>
          </KSection>
        </div>
      </div>
    </>
  );
}
