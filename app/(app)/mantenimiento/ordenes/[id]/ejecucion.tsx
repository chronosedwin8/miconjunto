"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, Circle, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { agregarEvidenciasAction, cerrarOrdenAction, iniciarOrdenAction, marcarItemAction, quitarEvidenciaAction } from "../../actions";

type Item = { item: string; ok: boolean };
type Momento = "antes" | "despues";

async function subir(files: FileList): Promise<string[]> {
  const urls: string[] = [];
  for (const f of Array.from(files)) {
    const fd = new FormData();
    fd.append("file", f);
    fd.append("folder", "ordenes");
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = (await r.json()) as { url?: string; error?: string };
    if (j.url) urls.push(j.url);
    else toast.error(j.error ?? "No se pudo subir la foto");
  }
  return urls;
}

const momentoDe = (u: string): Momento | "otra" => (u.endsWith("#antes") ? "antes" : u.endsWith("#despues") ? "despues" : "otra");

/**
 * Panel de ejecución para el técnico o proveedor (móvil primero): iniciar, lista de chequeo,
 * fotos antes/después con la cámara y cierre. "Foto y cerrar" cierra en 3 toques.
 */
export function Ejecucion({
  id,
  estado,
  checklist,
  evidencias,
  costo,
  verCosto,
}: {
  id: string;
  estado: string;
  checklist: Item[];
  evidencias: string[];
  costo: number | null;
  verCosto: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(checklist);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [notas, setNotas] = useState("");
  const [valor, setValor] = useState(costo ? Math.round(costo).toLocaleString("es-CO") : "");
  const inputs = { antes: useRef<HTMLInputElement>(null), despues: useRef<HTMLInputElement>(null), cerrar: useRef<HTMLInputElement>(null) };
  const abierta = !["COMPLETADA", "CANCELADA"].includes(estado);

  const fotos = async (files: FileList | null, momento: Momento) => {
    if (!files?.length) return;
    setBusy(momento);
    const urls = await subir(files);
    if (urls.length) {
      const r = await agregarEvidenciasAction({ id, urls, momento });
      if (r.ok) toast.success(urls.length === 1 ? "Foto guardada" : `${urls.length} fotos guardadas`);
      else toast.error(r.error);
    }
    setBusy(null);
    router.refresh();
  };

  const cerrar = (extra: { evidencias?: string[]; rapido?: boolean }) =>
    start(async () => {
      const r = await cerrarOrdenAction({
        id,
        notasCierre: notas || (extra.rapido ? "Trabajo realizado (cierre rápido con foto)." : ""),
        costo: valor,
        evidencias: extra.evidencias ?? [],
        checklistCompleto: extra.rapido ? "true" : "false",
      });
      if (r.ok) {
        toast.success("Orden cerrada. ¡Buen trabajo!");
        router.refresh();
      } else toast.error(r.error);
    });

  const fotoYCerrar = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("cerrar");
    const urls = await subir(files);
    setBusy(null);
    if (!urls.length) return;
    cerrar({ evidencias: urls.map((u) => `${u}#despues`), rapido: true });
  };

  const toggle = (i: number) => {
    const next = items.map((x, j) => (j === i ? { ...x, ok: !x.ok } : x));
    setItems(next);
    start(async () => {
      const r = await marcarItemAction({ id, index: i, ok: next[i].ok });
      if (!r.ok) {
        toast.error(r.error);
        setItems(items);
      }
    });
  };

  const grupos: { titulo: string; m: Momento | "otra" }[] = [
    { titulo: "Antes", m: "antes" },
    { titulo: "Después", m: "despues" },
    { titulo: "Otras", m: "otra" },
  ];

  return (
    <div className="space-y-5">
      {abierta && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input ref={inputs.cerrar} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fotoYCerrar(e.target.files)} aria-label="Foto del trabajo terminado" />
          <Button size="lg" className="h-14 text-base" disabled={pending || !!busy} onClick={() => inputs.cerrar.current?.click()}>
            {busy === "cerrar" || pending ? <Loader2 className="animate-spin" /> : <Camera />} Foto y cerrar orden
          </Button>
          {(estado === "PENDIENTE" || estado === "PROGRAMADA") && (
            <Button
              size="lg"
              variant="outline"
              className="h-14 text-base"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await iniciarOrdenAction({ id });
                  if (r.ok) {
                    toast.success("Trabajo iniciado");
                    router.refresh();
                  } else toast.error(r.error);
                })
              }
            >
              <Play /> Iniciar trabajo
            </Button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">
            Lista de chequeo <span className="text-sm font-normal text-muted-foreground">({items.filter((i) => i.ok).length}/{items.length})</span>
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((it, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={!abierta}
                  onClick={() => toggle(i)}
                  className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm disabled:cursor-default"
                  aria-pressed={it.ok}
                >
                  {it.ok ? <CheckCircle2 className="size-6 shrink-0 text-success" /> : <Circle className="size-6 shrink-0 text-muted-foreground" />}
                  <span className={cn(it.ok && "text-muted-foreground line-through")}>{it.item}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Evidencias</h2>
        </div>
        {abierta && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["antes", "despues"] as const).map((m) => (
              <div key={m}>
                <input ref={inputs[m]} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => fotos(e.target.files, m)} aria-label={m === "antes" ? "Foto antes" : "Foto después"} />
                <Button variant="outline" className="h-12 w-full" disabled={!!busy} onClick={() => inputs[m].current?.click()}>
                  {busy === m ? <Loader2 className="animate-spin" /> : <Camera />} Foto {m === "antes" ? "antes" : "después"}
                </Button>
              </div>
            ))}
          </div>
        )}
        {evidencias.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Aún no hay fotos del trabajo.</p>
        ) : (
          grupos.map((g) => {
            const fs = evidencias.filter((u) => momentoDe(u) === g.m);
            if (!fs.length) return null;
            return (
              <div key={g.m} className="mb-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{g.titulo}</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {fs.map((u) => (
                    <div key={u} className="relative">
                      <a href={u.replace(/#(antes|despues)$/, "")} target="_blank" rel="noopener">
                        { }
                        <img src={u} alt={`Evidencia ${g.titulo.toLowerCase()}`} className="aspect-square w-full rounded-lg border object-cover" />
                      </a>
                      {abierta && (
                        <button
                          type="button"
                          aria-label="Quitar foto"
                          onClick={() =>
                            start(async () => {
                              const r = await quitarEvidenciaAction({ id, url: u });
                              if (r.ok) router.refresh();
                              else toast.error(r.error);
                            })
                          }
                          className="absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full bg-foreground text-background"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {abierta && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-base font-semibold">Cerrar con detalle</h2>
          <label htmlFor="notas-cierre" className="text-sm font-medium">
            ¿Qué se hizo?
          </label>
          <Textarea id="notas-cierre" value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-1.5 min-h-20" placeholder="Se cambió el empaque de la motobomba y se probó presión." />
          {verCosto && (
            <div className="mt-3">
              <label htmlFor="costo-cierre" className="text-sm font-medium">
                Costo final
              </label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <input
                  id="costo-cierre"
                  inputMode="numeric"
                  value={valor}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "");
                    setValor(d ? Number(d).toLocaleString("es-CO") : "");
                  }}
                  className="h-11 w-full rounded-lg border border-input bg-background pl-7 pr-3 tabular-nums"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Si tiene costo, queda un gasto pendiente de aprobación en el presupuesto.</p>
            </div>
          )}
          <Button className="mt-4 w-full" disabled={pending} onClick={() => cerrar({ rapido: false })}>
            {pending && <Loader2 className="animate-spin" />} Cerrar orden
          </Button>
        </section>
      )}
    </div>
  );
}
