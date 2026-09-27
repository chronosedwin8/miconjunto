"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, FileUp, ImagePlus, ListChecks, Loader2, Trash2, Type, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useFieldError } from "@/components/form/action-form";
import { EditorTexto } from "./editor-texto";

type B = { key: string; tipo: "texto" | "imagen" | "video" | "adjunto" | "encuesta"; html?: string; url?: string; nombre?: string; alt?: string; pie?: string; encuestaId?: string };

let seq = 0;
const nuevo = (tipo: B["tipo"], extra: Partial<B> = {}): B => ({ key: `b${Date.now()}-${seq++}`, tipo, ...extra });

async function subir(file: File, folder: string) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = (await r.json()) as { url?: string; nombre?: string; error?: string };
  if (!j.url) throw new Error(j.error ?? "No se pudo subir el archivo");
  return j;
}

/**
 * Editor de BLOQUES para publicaciones: texto, imagen, video (YouTube/Vimeo), adjunto y encuesta.
 * Serializa en un input oculto `name` (JSON). El servidor valida y sanitiza cada bloque.
 */
export function EditorBloques({
  name = "contenido",
  defaultValue,
  encuestas = [],
  folder = "muro",
  permitir = ["texto", "imagen", "video", "adjunto", "encuesta"],
}: {
  name?: string;
  defaultValue?: unknown;
  encuestas?: { value: string; label: string }[];
  folder?: string;
  permitir?: B["tipo"][];
}) {
  const [bloques, setBloques] = useState<B[]>(() => {
    const arr = Array.isArray(defaultValue) ? (defaultValue as B[]).filter((b) => b && b.tipo !== ("meta" as never)) : [];
    return arr.length ? arr.map((b) => ({ ...b, key: `b${seq++}` })) : [nuevo("texto", { html: "" })];
  });
  const [busy, setBusy] = useState(false);
  const error = useFieldError(name);

  const set = (key: string, patch: Partial<B>) => setBloques((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const mover = (i: number, d: number) =>
    setBloques((bs) => {
      const j = i + d;
      if (j < 0 || j >= bs.length) return bs;
      const c = [...bs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const quitar = (key: string) => setBloques((bs) => bs.filter((b) => b.key !== key));

  const agregarArchivo = async (tipo: "imagen" | "adjunto", files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const nuevos: B[] = [];
      for (const f of Array.from(files)) {
        const j = await subir(f, folder);
        nuevos.push(nuevo(tipo, { url: j.url, nombre: j.nombre ?? f.name }));
      }
      setBloques((bs) => [...bs, ...nuevos]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const serial = JSON.stringify(bloques.map(({ key: _k, ...b }) => b));
  const add = "h-10 gap-1.5 rounded-full px-3 text-sm";
  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={serial} />
      <ol className="space-y-3">
        {bloques.map((b, i) => (
          <li key={b.key} className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {b.tipo === "texto" ? "Texto" : b.tipo === "imagen" ? "Imagen" : b.tipo === "video" ? "Video" : b.tipo === "adjunto" ? "Archivo adjunto" : "Encuesta enlazada"}
              </span>
              <div className="flex gap-0.5">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir bloque" onClick={() => mover(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar bloque" onClick={() => mover(i, 1)} disabled={i === bloques.length - 1}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Quitar bloque" onClick={() => quitar(b.key)}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {b.tipo === "texto" && <EditorTexto value={b.html ?? ""} onChange={(html) => set(b.key, { html })} />}
            {b.tipo === "imagen" && (
              <div className="space-y-2">
                <img src={b.url} alt={b.alt ?? ""} className="max-h-56 w-full rounded-lg object-cover" />
                <input value={b.pie ?? ""} onChange={(e) => set(b.key, { pie: e.target.value, alt: e.target.value })} placeholder="Pie de foto (opcional)" className="h-10 w-full rounded-lg border px-3 text-sm" aria-label="Pie de foto" />
              </div>
            )}
            {b.tipo === "video" && (
              <input value={b.url ?? ""} onChange={(e) => set(b.key, { url: e.target.value })} placeholder="Enlace de YouTube o Vimeo" inputMode="url" className="h-11 w-full rounded-lg border px-3 text-base md:text-sm" aria-label="Enlace del video" />
            )}
            {b.tipo === "adjunto" && (
              <a href={b.url} target="_blank" className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <FileUp className="size-4" /> {b.nombre}
              </a>
            )}
            {b.tipo === "encuesta" && (
              <select value={b.encuestaId ?? ""} onChange={(e) => set(b.key, { encuestaId: e.target.value })} className="h-11 w-full rounded-lg border bg-background px-3 text-base md:text-sm" aria-label="Encuesta">
                <option value="">Selecciona la encuesta…</option>
                {encuestas.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {permitir.includes("texto") && (
          <Button type="button" variant="outline" className={add} onClick={() => setBloques((bs) => [...bs, nuevo("texto", { html: "" })])}>
            <Type /> Texto
          </Button>
        )}
        {permitir.includes("imagen") && (
          <label className={`inline-flex cursor-pointer items-center border bg-background hover:bg-muted ${add}`}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} Imagen
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => agregarArchivo("imagen", e.target.files)} />
          </label>
        )}
        {permitir.includes("video") && (
          <Button type="button" variant="outline" className={add} onClick={() => setBloques((bs) => [...bs, nuevo("video", { url: "" })])}>
            <Video /> Video
          </Button>
        )}
        {permitir.includes("adjunto") && (
          <label className={`inline-flex cursor-pointer items-center border bg-background hover:bg-muted ${add}`}>
            <FileUp className="size-4" /> Adjunto
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*" className="sr-only" onChange={(e) => agregarArchivo("adjunto", e.target.files)} />
          </label>
        )}
        {permitir.includes("encuesta") && encuestas.length > 0 && (
          <Button type="button" variant="outline" className={add} onClick={() => setBloques((bs) => [...bs, nuevo("encuesta", { encuestaId: "" })])}>
            <ListChecks /> Encuesta
          </Button>
        )}
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
