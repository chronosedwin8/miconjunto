"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type Moroso = { unidadId: string; codigo: string; torre: string | null; propietario: string | null; vencido: number; diasMora: number; enAcuerdo: boolean; cartaSemana: boolean };

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/** Generación masiva de cartas de cobro prejurídico (PDF) con registro de la gestión (Ley 2300). */
export function GeneradorCartas({ morosos, plantillaDefecto, variables, horarioOk, motivoHorario }: { morosos: Moroso[]; plantillaDefecto: string; variables: readonly string[]; horarioOk: boolean; motivoHorario?: string }) {
  const router = useRouter();
  const [minDias, setMinDias] = useState(60);
  const [incluirAcuerdo, setIncluirAcuerdo] = useState(false);
  const filtrados = useMemo(() => morosos.filter((m) => m.diasMora >= minDias && (incluirAcuerdo || !m.enAcuerdo)), [morosos, minDias, incluirAcuerdo]);
  const [sel, setSel] = useState<Set<string>>(() => new Set(morosos.filter((m) => m.diasMora >= 60 && !m.enAcuerdo && !m.cartaSemana).map((m) => m.unidadId)));
  const [plantilla, setPlantilla] = useState(plantillaDefecto);
  const [registrar, setRegistrar] = useState(horarioOk);
  const [busy, setBusy] = useState(false);
  const elegidos = filtrados.filter((m) => sel.has(m.unidadId));
  const total = elegidos.reduce((a, m) => a + m.vencido, 0);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const generar = async () => {
    if (!elegidos.length) return toast.error("Elige al menos una unidad.");
    if (registrar && !window.confirm(`¿Generar ${elegidos.length} carta(s) y registrarlas como gestión de cobro (canal carta)?`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/cartera/cartas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unidadIds: elegidos.map((m) => m.unidadId), plantilla, registrar }) });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error ?? "No se pudieron generar las cartas");
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cartas-cobro-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      const omitidas = Number(r.headers.get("X-Omitidas") ?? 0);
      toast.success(`${r.headers.get("X-Cartas")} carta(s) generadas${omitidas ? ` · ${omitidas} omitida(s) por Ley 2300 (ya contactadas esta semana)` : ""}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {!horarioOk && <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">{motivoHorario} Puedes descargar las cartas como vista previa sin registrarlas como enviadas.</p>}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="space-y-1 text-sm">
          <span className="block text-xs text-muted-foreground">Mínimo de días en mora</span>
          <select value={minDias} onChange={(e) => setMinDias(Number(e.target.value))} className="h-11 rounded-lg border bg-background px-3">
            {[1, 30, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "Cualquier mora" : `${d} días o más`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={incluirAcuerdo} onChange={(e) => setIncluirAcuerdo(e.target.checked)} className="size-5" /> Incluir unidades con acuerdo vigente
        </label>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setSel(new Set(filtrados.filter((m) => !m.cartaSemana).map((m) => m.unidadId)))}>
            Marcar todas
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSel(new Set())}>
            Ninguna
          </Button>
        </div>
      </div>

      <ul className="max-h-[420px] divide-y overflow-y-auto rounded-xl border bg-card">
        {filtrados.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">No hay unidades con esa mora.</li>}
        {filtrados.map((m) => (
          <li key={m.unidadId}>
            <label className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 has-[:checked]:bg-primary/5">
              <input type="checkbox" checked={sel.has(m.unidadId)} onChange={() => toggle(m.unidadId)} className="size-5" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{m.codigo}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {m.propietario ?? "Sin propietario"} · {m.diasMora} días
                  {m.enAcuerdo ? " · en acuerdo" : ""}
                  {m.cartaSemana ? " · ya recibió carta esta semana" : ""}
                </span>
              </span>
              <span className="tabular-nums text-destructive">{cop(m.vencido)}</span>
            </label>
          </li>
        ))}
      </ul>

      <details className="rounded-xl border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">Plantilla de la carta</summary>
        <p className="mt-2 text-xs text-muted-foreground">Variables: {variables.map((v) => `{{${v}}}`).join(", ")}. Los cambios se usan solo en esta generación.</p>
        <textarea value={plantilla} onChange={(e) => setPlantilla(e.target.value)} rows={16} className="mt-2 w-full rounded-lg border bg-background p-3 font-mono text-xs" aria-label="Plantilla de la carta" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setPlantilla(plantillaDefecto)}>
          Restaurar plantilla
        </Button>
      </details>

      <div className="sticky bottom-20 flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center lg:bottom-4">
        <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
          <input type="checkbox" checked={registrar} disabled={!horarioOk} onChange={(e) => setRegistrar(e.target.checked)} className="size-5" />
          Registrar como gestión de cobro enviada (canal carta)
        </label>
        <Button type="button" onClick={generar} disabled={busy || !elegidos.length}>
          {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Generar {elegidos.length} carta(s) · {cop(total)}
        </Button>
      </div>
    </div>
  );
}
