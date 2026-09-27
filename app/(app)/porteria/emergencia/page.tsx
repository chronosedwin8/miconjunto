import { requirePage } from "@/lib/auth/guard";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { can } from "@/lib/permisos";
import { fechaHora } from "@/lib/format";
import { label } from "@/lib/labels";
import { listaEvacuacion } from "@/lib/emergencias/service";
import { StatusBadge } from "@/components/app/status-badge";
import { KSection, KTitle } from "../_components/kiosk";
import { EmergenciaBoton } from "../_components/emergencia";

export const metadata = { title: "Emergencia" };

/** Emergencia: activar alerta con plantilla y lista de evacuación asistida (movilidad reducida) por torre y piso. */
export default async function EmergenciaPage() {
  const ctx = await requirePage("porteria.ver");
  const cfg = conjuntoConfig(ctx);
  const verSalud = can(ctx, ["emergencias.lista_evacuacion", "campos.persona_salud"]);
  const verTel = can(ctx, "campos.persona_telefono");
  const [lista, recientes] = await Promise.all([verSalud ? listaEvacuacion(ctx) : Promise.resolve([]), ctx.db.alertaEmergencia.findMany({ orderBy: { createdAt: "desc" }, take: 8 })]);
  const porTorre = new Map<string, typeof lista>();
  for (const f of lista) porTorre.set(f.torre, [...(porTorre.get(f.torre) ?? []), f]);
  return (
    <>
      <KTitle>Emergencia</KTitle>
      <EmergenciaBoton aTodosPorDefecto={cfg.porteria.emergenciaATodos} />
      <KSection titulo={`Evacuación asistida (${lista.length})`} className="mt-6">
        {!verSalud ? (
          <p className="text-base text-muted-foreground">No tienes permiso para ver la lista de evacuación asistida.</p>
        ) : lista.length === 0 ? (
          <p className="text-base text-muted-foreground">No hay personas registradas con movilidad reducida.</p>
        ) : (
          <div className="space-y-4">
            {[...porTorre.entries()].map(([torre, filas]) => (
              <div key={torre}>
                <h3 className="mb-1 text-lg font-bold">{torre}</h3>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filas.map((f, i) => (
                    <li key={`${f.personaId}-${i}`} className="rounded-xl border-2 border-amber-500 p-3">
                      <p className="text-lg font-black">
                        ♿ {f.unidad} <span className="text-base font-semibold">· piso {f.piso || "—"}</span>
                      </p>
                      <p className="text-base font-semibold">
                        {f.nombre}
                        {f.edad !== null && ` · ${f.edad} años`}
                      </p>
                      {f.descripcion && <p className="text-sm">{f.descripcion}</p>}
                      {verTel && f.contactoEmergencia && <p className="text-sm">Contacto: {f.contactoEmergencia}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </KSection>
      <KSection titulo="Alertas recientes">
        <ul className="divide-y rounded-2xl border-2 text-base">
          {recientes.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span>
                <b>{label(a.tipo)}</b> · {a.origen.toLowerCase()} {a.mensaje && `· ${a.mensaje}`}
              </span>
              <span className="flex items-center gap-2 text-sm">
                {fechaHora(a.createdAt)} <StatusBadge value={a.estado} />
              </span>
            </li>
          ))}
          {!recientes.length && <li className="p-3 text-muted-foreground">Sin alertas.</li>}
        </ul>
      </KSection>
    </>
  );
}
