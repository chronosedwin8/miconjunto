"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addDays, isoDateTimeLocal } from "@/lib/format";
import { crearEncuestaAction } from "../actions";

type Tipo = "UNICA" | "MULTIPLE" | "ESCALA" | "TEXTO";
type Pregunta = { key: number; tipo: Tipo; texto: string; opciones: string[]; requerida: boolean };
type Opt = { value: string; label: string };

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "UNICA", label: "Opción única" },
  { value: "MULTIPLE", label: "Opción múltiple" },
  { value: "ESCALA", label: "Escala 1 a 5" },
  { value: "TEXTO", label: "Texto libre" },
];

const sel = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";

export function EncuestaForm({ torres, segmentos }: { torres: Opt[]; segmentos: Opt[] }) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fin, setFin] = useState(isoDateTimeLocal(addDays(new Date(), 7)));
  const [anonima, setAnonima] = useState(false);
  const [audiencia, setAudiencia] = useState("TODOS");
  const [torreId, setTorreId] = useState(torres[0]?.value ?? "");
  const [segmentoId, setSegmentoId] = useState(segmentos[0]?.value ?? "");
  const [preguntas, setPreguntas] = useState<Pregunta[]>([{ key: 1, tipo: "UNICA", texto: "", opciones: ["", ""], requerida: true }]);
  const [pending, start] = useTransition();
  const router = useRouter();

  const upd = (k: number, patch: Partial<Pregunta>) => setPreguntas((ps) => ps.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  const mover = (i: number, d: number) =>
    setPreguntas((ps) => {
      const a = [...ps];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await crearEncuestaAction({
        titulo,
        descripcion,
        fin,
        anonima: String(anonima),
        audiencia: audiencia as "TODOS",
        torreId: audiencia === "TORRE" ? torreId : "",
        segmentoId: audiencia === "SEGMENTO" ? segmentoId : "",
        preguntas: preguntas.map((p) => ({ tipo: p.tipo, texto: p.texto, opciones: p.opciones.filter((o) => o.trim()), requerida: p.requerida })),
      });
      if (r.ok) {
        toast.success("Encuesta publicada");
        router.push(`/encuestas/${r.data.id}`);
      } else toast.error(r.error);
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título *</Label>
        <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Horario de la piscina en vacaciones" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="desc">Descripción (opcional)</Label>
        <Textarea id="desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="audiencia">¿Quién responde?</Label>
          <select id="audiencia" className={sel} value={audiencia} onChange={(e) => setAudiencia(e.target.value)}>
            <option value="TODOS">Todo el conjunto</option>
            <option value="PROPIETARIOS">Solo propietarios</option>
            {torres.length > 0 && <option value="TORRE">Una torre</option>}
            {segmentos.length > 0 && <option value="SEGMENTO">Un segmento guardado</option>}
          </select>
        </div>
        {audiencia === "TORRE" && (
          <div className="space-y-1.5">
            <Label htmlFor="torre">Torre</Label>
            <select id="torre" className={sel} value={torreId} onChange={(e) => setTorreId(e.target.value)}>
              {torres.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {audiencia === "SEGMENTO" && (
          <div className="space-y-1.5">
            <Label htmlFor="seg">Segmento</Label>
            <select id="seg" className={sel} value={segmentoId} onChange={(e) => setSegmentoId(e.target.value)}>
              {segmentos.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="fin">Cierra *</Label>
          <Input id="fin" type="datetime-local" value={fin} onChange={(e) => setFin(e.target.value)} />
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
        <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} className="mt-0.5 size-5" />
        <span className="text-sm">
          <span className="font-medium">Anónima</span>
          <span className="block text-xs text-muted-foreground">No se guarda quién respondió; solo se evita que alguien responda dos veces.</span>
        </span>
      </label>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">Preguntas</h2>
        {preguntas.map((p, i) => (
          <fieldset key={p.key} className="space-y-3 rounded-xl border bg-card p-3">
            <legend className="sr-only">Pregunta {i + 1}</legend>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Pregunta {i + 1}</span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Subir" onClick={() => mover(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Bajar" onClick={() => mover(i, 1)} disabled={i === preguntas.length - 1}>
                  <ArrowDown />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Eliminar pregunta" onClick={() => setPreguntas((ps) => ps.filter((x) => x.key !== p.key))} disabled={preguntas.length === 1}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            <Input value={p.texto} onChange={(e) => upd(p.key, { texto: e.target.value })} placeholder="Escribe la pregunta" aria-label={`Texto de la pregunta ${i + 1}`} />
            <select className={sel} value={p.tipo} onChange={(e) => upd(p.key, { tipo: e.target.value as Tipo })} aria-label="Tipo de pregunta">
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {(p.tipo === "UNICA" || p.tipo === "MULTIPLE") && (
              <div className="space-y-2">
                {p.opciones.map((o, j) => (
                  <div key={j} className="flex gap-2">
                    <Input value={o} onChange={(e) => upd(p.key, { opciones: p.opciones.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`Opción ${j + 1}`} aria-label={`Opción ${j + 1}`} />
                    {p.opciones.length > 2 && (
                      <Button type="button" variant="ghost" size="icon" aria-label="Quitar opción" onClick={() => upd(p.key, { opciones: p.opciones.filter((_, k) => k !== j) })}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => upd(p.key, { opciones: [...p.opciones, ""] })}>
                  <Plus /> Agregar opción
                </Button>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.requerida} onChange={(e) => upd(p.key, { requerida: e.target.checked })} className="size-4" /> Obligatoria
            </label>
          </fieldset>
        ))}
        <Button type="button" variant="outline" onClick={() => setPreguntas((ps) => [...ps, { key: Math.max(...ps.map((x) => x.key)) + 1, tipo: "UNICA", texto: "", opciones: ["", ""], requerida: true }])}>
          <Plus /> Agregar pregunta
        </Button>
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Publicar encuesta
      </Button>
    </form>
  );
}
