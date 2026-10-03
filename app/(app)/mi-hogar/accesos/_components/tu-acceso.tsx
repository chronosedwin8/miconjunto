import { KeyRound, PauseCircle } from "lucide-react";
import { label } from "@/lib/labels";
import type { CapacidadKey } from "@/lib/hogar/capacidades";
import { CapChips } from "./cap-chips";

export type MiAcceso = {
  id: string;
  unidadCodigo: string;
  tipo: string;
  estado: string;
  pausado: boolean;
  capacidades: CapacidadKey[];
  otorgadoPor: string | null;
};

/** Vista de solo lectura para quien entra con acceso derivado: quién se lo dio y qué puede hacer. */
export function TuAcceso({ accesos, className }: { accesos: MiAcceso[]; className?: string }) {
  if (!accesos.length) return null;
  return (
    <section className={className} aria-label="Tu acceso al hogar">
      <ul className="space-y-2">
        {accesos.map((a) => (
          <li key={a.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                {a.pausado ? <PauseCircle className="size-5" /> : <KeyRound className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{a.otorgadoPor ? `Tu acceso lo otorgó ${a.otorgadoPor}` : "Tu acceso lo definió la administración"}</p>
                <p className="text-sm text-muted-foreground">
                  Unidad {a.unidadCodigo} · {label(a.tipo)}
                  {a.estado === "PENDIENTE_APROBACION" && " · pendiente de aprobación"}
                </p>
              </div>
            </div>
            {a.pausado ? (
              <p className="mt-3 rounded-lg bg-warning/10 p-3 text-sm">
                Tu acceso está en pausa. Mientras tanto no puedes usar las funciones del hogar; habla con {a.otorgadoPor ?? "el titular"} si lo necesitas.
              </p>
            ) : (
              <>
                <p className="mt-3 mb-1.5 text-xs font-medium text-muted-foreground">Puedes:</p>
                <CapChips caps={a.capacidades} />
              </>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Si necesitas algo más, pídeselo a {a.otorgadoPor ?? "el titular de la unidad"}. Si el titular deja la unidad, este acceso termina.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
