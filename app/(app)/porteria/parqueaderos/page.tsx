import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { cop, hora } from "@/lib/format";
import { label } from "@/lib/labels";
import { parqueaderosVisitantes, textoPermanencia } from "@/lib/porteria/service";
import { MINUTOS_GRACIA_PARQUEADERO } from "@/lib/porteria/reglas";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { KTitle } from "../_components/kiosk";
import { SalidaParqueadero } from "../_components/salida-parqueadero";

export const metadata = { title: "Parqueaderos de visitantes" };

/** Parqueaderos de visitantes: ocupación, tiempo, valor acumulado y liberación en la salida. */
export default async function ParqueaderosPage() {
  const ctx = await requirePage("porteria.ver");
  const ps = await parqueaderosVisitantes(ctx);
  const libres = ps.filter((p) => p.estado === "DISPONIBLE").length;
  return (
    <>
      <KTitle>Parqueaderos de visitantes</KTitle>
      <p className="mb-4 text-base">
        <b>{libres}</b> libres de {ps.length}. Se asignan desde el ingreso del visitante y se liberan en su salida. Gracia de {MINUTOS_GRACIA_PARQUEADERO} min; fracción de hora se cobra como hora completa, con tope diario.
      </p>
      {ps.length === 0 ? (
        <EmptyState titulo="No hay parqueaderos de visitantes" descripcion="La administración los crea en Conjunto → Parqueaderos con tipo Visitantes." />
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {ps.map((p) => (
            <li key={p.id} className={cn("flex flex-col gap-1 rounded-2xl border-2 p-3", p.ocupante ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30" : p.estado === "DISPONIBLE" ? "border-green-700/50" : "opacity-60")}>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black">{p.codigo}</span>
                <StatusBadge value={p.estado} />
              </div>
              <p className="text-sm text-foreground/75">{p.tarifaHora ? `${cop(p.tarifaHora)}/h` : "Sin tarifa por hora"}{p.tarifaDia ? ` · día ${cop(p.tarifaDia)}` : ""}</p>
              {p.ocupante ? (
                <>
                  <p className="font-mono text-lg font-bold">{p.ocupante.placa ?? "—"}</p>
                  <p className="text-sm">
                    {p.ocupante.nombre} → {p.ocupante.unidad ?? "—"}
                  </p>
                  <p className="text-sm font-semibold">
                    Desde {hora(p.ocupante.hora)} · {textoPermanencia(p.ocupante.minutos)} · {cop(p.valorActual)}
                  </p>
                  <SalidaParqueadero
                    item={{ ...p.ocupante, sujetoLabel: label(p.ocupante.sujeto), hora: p.ocupante.hora.toISOString(), horaTexto: hora(p.ocupante.hora), valorParqueadero: p.valorActual }}
                  />
                </>
              ) : p.estado === "OCUPADO" ? (
                <p className="text-sm">Ocupado sin ingreso asociado. <Link className="underline" href="/porteria/bitacora">Revisa la bitácora</Link>.</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
