import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { fechaHora, hora } from "@/lib/format";
import { label } from "@/lib/labels";
import { minutaTurno, turnoAbierto, turnosRecientes, type ItemChecklist } from "@/lib/porteria/turnos";
import { StatusBadge } from "@/components/app/status-badge";
import { KSection, KTitle } from "../_components/kiosk";
import { TurnoForm } from "../_components/turno-form";

export const metadata = { title: "Turno" };

export default async function TurnoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("porteria.ver");
  const sp = await searchParams;
  const cfg = conjuntoConfig(ctx);
  const actual = await turnoAbierto(ctx);
  const verId = spGet(sp, "id") ?? actual?.id;
  const [minuta, recientes] = await Promise.all([verId ? minutaTurno(ctx, verId) : Promise.resolve(null), turnosRecientes(ctx)]);
  const puede = can(ctx, "porteria.turnos");
  const checklist = (minuta?.turno.checklistApertura ?? []) as ItemChecklist[];
  const checklistCierre = (minuta?.turno.checklistCierre ?? []) as ItemChecklist[];
  return (
    <>
      <KTitle>Turno</KTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {puede && !actual && (
            <KSection titulo="Abrir turno">
              <div className="rounded-2xl border-2 p-4">
                <TurnoForm modo="abrir" elementos={cfg.porteria.checklistTurno} />
              </div>
            </KSection>
          )}
          {puede && actual && (
            <KSection titulo={`Turno abierto desde las ${hora(actual.apertura)}`}>
              <div className="rounded-2xl border-2 p-4">
                <TurnoForm modo="cerrar" elementos={cfg.porteria.checklistTurno} />
              </div>
            </KSection>
          )}
        </div>
        <div>
          {minuta && (
            <KSection titulo={`Minuta del turno · ${minuta.turno.portero.nombre}`}>
              <div className="space-y-3 rounded-2xl border-2 p-4 text-base">
                <p>
                  <StatusBadge value={minuta.turno.estado} /> {fechaHora(minuta.turno.apertura)} → {minuta.turno.cierre ? fechaHora(minuta.turno.cierre) : "en curso"}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Ingresos", minuta.resumen.ingresos],
                    ["Salidas", minuta.resumen.salidas],
                    ["Novedades", minuta.resumen.novedades],
                    ["Paquetes recibidos", minuta.resumen.paquetesRecibidos],
                    ["Paquetes entregados", minuta.resumen.paquetesEntregados],
                    ["Anulaciones", minuta.resumen.anulaciones],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-xl bg-muted p-2">
                      <p className="text-2xl font-black">{v}</p>
                      <p className="text-xs font-medium">{k}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="font-bold">Checklist de apertura</p>
                  <ul className="text-sm">
                    {checklist.map((c) => (
                      <li key={c.elemento}>
                        {c.ok ? "✅" : "❌"} {c.elemento} {c.nota && `· ${c.nota}`}
                      </li>
                    ))}
                  </ul>
                  {minuta.turno.novedadesApertura && <p className="mt-1 text-sm">📝 {minuta.turno.novedadesApertura}</p>}
                </div>
                {checklistCierre.length > 0 && (
                  <div>
                    <p className="font-bold">Checklist de cierre</p>
                    <ul className="text-sm">
                      {checklistCierre.map((c) => (
                        <li key={c.elemento}>
                          {c.ok ? "✅" : "❌"} {c.elemento} {c.nota && `· ${c.nota}`}
                        </li>
                      ))}
                    </ul>
                    {minuta.turno.novedadesCierre && <p className="mt-1 text-sm">📝 {minuta.turno.novedadesCierre}</p>}
                  </div>
                )}
                <div className="flex flex-wrap gap-4">
                  {minuta.turno.firmaApertura && (
                    <figure>
                      <img src={minuta.turno.firmaApertura} alt="Firma de apertura" className="h-16 rounded border bg-white" />
                      <figcaption className="text-xs text-muted-foreground">Firma apertura</figcaption>
                    </figure>
                  )}
                  {minuta.turno.firmaCierre && (
                    <figure>
                      <img src={minuta.turno.firmaCierre} alt="Firma de cierre" className="h-16 rounded border bg-white" />
                      <figcaption className="text-xs text-muted-foreground">Firma cierre</figcaption>
                    </figure>
                  )}
                </div>
                {minuta.novedades.length > 0 && (
                  <div>
                    <p className="font-bold">Novedades</p>
                    <ul className="space-y-1 text-sm">
                      {minuta.novedades.map((n) => (
                        <li key={n.id}>
                          {hora(n.createdAt)} · <StatusBadge value={n.severidad} /> {label(n.tipo)}: {n.descripcion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="font-bold">Movimientos ({minuta.registros.length})</p>
                  <ul className="max-h-80 space-y-0.5 overflow-y-auto text-sm">
                    {minuta.registros.map((r) => (
                      <li key={r.id} className={r.anulado ? "line-through opacity-60" : ""}>
                        {hora(r.hora)} · {label(r.tipo)} · {r.nombre} {r.unidad && `→ ${r.unidad.codigo}`}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </KSection>
          )}
          <KSection titulo="Turnos recientes">
            <ul className="divide-y rounded-2xl border-2">
              {recientes.map((t) => (
                <li key={t.id}>
                  <Link href={`/porteria/turno?id=${t.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-muted">
                    <span>
                      <span className="block font-bold">{t.portero.nombre}</span>
                      <span className="text-sm text-muted-foreground">
                        {fechaHora(t.apertura)} → {t.cierre ? hora(t.cierre) : "en curso"}
                      </span>
                    </span>
                    <StatusBadge value={t.estado} />
                  </Link>
                </li>
              ))}
            </ul>
          </KSection>
        </div>
      </div>
    </>
  );
}
