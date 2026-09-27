"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AnyAction } from "@/components/form/action-form";

type Resultado = { id: string; errores: { fila: number; campo: string; mensaje: string }[]; filasOk: number; filasConError: number; advertencia: string | null };

/** Carga de Excel/CSV con validación fila por fila, reporte de errores y aplicación. */
export function Importer({
  tipos,
  aplicar,
  fijo,
}: {
  tipos: { value: string; label: string; plantilla: string }[];
  aplicar: AnyAction;
  fijo?: string;
}) {
  const [tipo, setTipo] = useState(fijo ?? tipos[0]?.value);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [aplicado, setAplicado] = useState<{ creados: number; actualizados: number; fallos: number } | null>(null);
  const router = useRouter();
  const def = tipos.find((t) => t.value === tipo);

  const subir = async (file: File | undefined) => {
    if (!file || !tipo) return;
    setBusy(true);
    setRes(null);
    setAplicado(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tipo", tipo);
    const r = await fetch("/api/importar", { method: "POST", body: fd });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast.error(j.error ?? "No se pudo procesar el archivo");
    setRes(j);
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      {!fijo && (
        <div className="space-y-1.5">
          <label htmlFor="tipo-imp" className="text-sm font-medium">
            ¿Qué vas a importar?
          </label>
          <select id="tipo-imp" value={tipo} onChange={(e) => { setTipo(e.target.value); setRes(null); }} className="h-11 w-full rounded-lg border bg-background px-3">
            {tipos.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {def && (
        <a href={`/plantillas/${def.plantilla}`} download className="inline-flex items-center gap-2 text-sm text-primary">
          <FileSpreadsheet className="size-4" /> Descargar plantilla ({def.plantilla})
        </a>
      )}
      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/50">
        {busy ? <Loader2 className="size-6 animate-spin" /> : <Upload className="size-6" />}
        {busy ? "Validando archivo…" : "Toca para elegir el archivo Excel (.xlsx) o CSV"}
        <input type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
      </label>
      {res && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-center text-sm">
            <div className="rounded-lg bg-success/10 p-3">
              <p className="text-2xl font-bold text-success">{res.filasOk}</p>filas válidas
            </div>
            <div className="rounded-lg bg-destructive/10 p-3">
              <p className="text-2xl font-bold text-destructive">{res.filasConError}</p>filas con error
            </div>
          </div>
          {res.advertencia && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">{res.advertencia}</p>}
          {res.errores.length > 0 && (
            <>
              <ul className="max-h-60 overflow-y-auto rounded-lg border text-sm">
                {res.errores.slice(0, 100).map((e, i) => (
                  <li key={i} className="border-b px-3 py-2 last:border-0">
                    <b>Fila {e.fila}</b> · {e.campo}: {e.mensaje}
                  </li>
                ))}
              </ul>
              <a href={`/api/importar/${res.id}/errores`} className="inline-flex items-center gap-2 text-sm text-primary">
                <Download className="size-4" /> Descargar reporte de errores
              </a>
            </>
          )}
          {!aplicado && res.filasOk > 0 && (
            <Button
              className="w-full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await aplicar({ id: res.id });
                setBusy(false);
                if (r.ok) {
                  setAplicado(r.data as never);
                  toast.success("Importación aplicada");
                  router.refresh();
                } else toast.error(r.error);
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Importar {res.filasOk} filas válidas
            </Button>
          )}
          {aplicado && (
            <p className="rounded-lg bg-success/10 p-3 text-sm text-success">
              Listo: {aplicado.creados} creados, {aplicado.actualizados} actualizados{aplicado.fallos ? `, ${aplicado.fallos} con fallas (ver reporte)` : ""}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
