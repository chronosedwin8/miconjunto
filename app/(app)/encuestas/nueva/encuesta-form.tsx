"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronsDownUp, ChevronsUpDown, ClipboardPaste, Copy, ListPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addDays, isoDateTimeLocal } from "@/lib/format";
import { MAX_OPCIONES, MAX_PREGUNTAS } from "@/lib/encuestas/limites";
import { parsearPreguntasTexto, type TipoPregunta as Tipo } from "@/lib/encuestas/texto";
import { cn } from "@/lib/utils";
import { crearEncuestaAction } from "../actions";

type Pregunta = { key: number; tipo: Tipo; texto: string; opciones: string[]; requerida: boolean; abierta: boolean };
type Opt = { value: string; label: string };

const TIPOS: { value: Tipo; label: string }[] = [
  { value: "UNICA", label: "Opción única" },
  { value: "MULTIPLE", label: "Opción múltiple" },
  { value: "ESCALA", label: "Escala 1 a 5" },
  { value: "TEXTO", label: "Texto libre" },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map((t) => [t.value, t.label])) as Record<Tipo, string>;

const sel = "h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";
const BORRADOR = "miconjunto:encuesta-borrador";
const EJEMPLO = `¿Qué horario prefieres para la piscina?
- Mañana
- Tarde
- Noche
[varias] ¿Qué zonas comunes usas?
- Gimnasio
- BBQ
- Salón social
[escala] ¿Cómo calificas la vigilancia?
¿Qué mejorarías del conjunto? (opcional)`;

let seq = 0;
const nueva = (p: Partial<Pregunta> = {}): Pregunta => ({ key: ++seq, tipo: "UNICA", texto: "", opciones: ["", ""], requerida: true, abierta: true, ...p });

/** Qué le falta a una pregunta para poder publicarse (null si está completa). */
function problema(p: Pregunta): string | null {
  if (p.texto.trim().length < 3) return "Falta el texto";
  if ((p.tipo === "UNICA" || p.tipo === "MULTIPLE") && new Set(p.opciones.map((o) => o.trim()).filter(Boolean)).size < 2) return "Necesita al menos 2 opciones";
  return null;
}

export function EncuestaForm({ torres, segmentos }: { torres: Opt[]; segmentos: Opt[] }) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fin, setFin] = useState(isoDateTimeLocal(addDays(new Date(), 7)));
  const [anonima, setAnonima] = useState(false);
  const [audiencia, setAudiencia] = useState("TODOS");
  const [torreId, setTorreId] = useState(torres[0]?.value ?? "");
  const [segmentoId, setSegmentoId] = useState(segmentos[0]?.value ?? "");
  const [preguntas, setPreguntas] = useState<Pregunta[]>(() => [nueva({ key: 0 })]);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const [pegarAbierto, setPegarAbierto] = useState(false);
  const [textoPegado, setTextoPegado] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const enfocar = useRef<number | null>(null);
  const cargado = useRef(false);

  // Borrador local: una encuesta larga no se pierde si se recarga la página.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BORRADOR);
      if (raw) {
        const b = JSON.parse(raw);
        if (Array.isArray(b.preguntas) && b.preguntas.length && (b.titulo || b.preguntas.some((p: Pregunta) => p.texto))) {
          setTitulo(b.titulo ?? "");
          setDescripcion(b.descripcion ?? "");
          setAnonima(!!b.anonima);
          setPreguntas(b.preguntas.map((p: Pregunta) => nueva({ ...p, abierta: false })));
          toast.info("Recuperamos el borrador que tenías sin publicar.");
        }
      }
    } catch {
      /* sin almacenamiento disponible */
    }
    cargado.current = true;
  }, []);
  useEffect(() => {
    if (!cargado.current) return;
    try {
      localStorage.setItem(BORRADOR, JSON.stringify({ titulo, descripcion, anonima, preguntas: preguntas.map(({ tipo, texto, opciones, requerida }) => ({ tipo, texto, opciones, requerida })) }));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [titulo, descripcion, anonima, preguntas]);

  // Lleva el foco a la pregunta recién creada.
  useEffect(() => {
    if (enfocar.current == null) return;
    const el = document.getElementById(`pregunta-${enfocar.current}`);
    enfocar.current = null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.querySelector<HTMLInputElement>("input[data-texto]")?.focus({ preventScroll: true });
    }
  }, [preguntas]);

  const upd = (k: number, patch: Partial<Pregunta>) => setPreguntas((ps) => ps.map((p) => (p.key === k ? { ...p, ...patch } : p)));
  const mover = (i: number, d: number) =>
    setPreguntas((ps) => {
      const a = [...ps];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  const insertar = (despuesDe: number, p: Pregunta) => {
    if (preguntas.length >= MAX_PREGUNTAS) return toast.error(`Máximo ${MAX_PREGUNTAS} preguntas por encuesta.`);
    enfocar.current = p.key;
    // Al agregar una pregunta, las demás se pliegan para que la lista siga siendo manejable.
    setPreguntas((ps) => {
      const a = ps.map((x) => (problema(x) ? x : { ...x, abierta: false }));
      a.splice(despuesDe + 1, 0, p);
      return a;
    });
  };
  const todasAbiertas = preguntas.every((p) => p.abierta);
  const incompletas = preguntas.map((p, i) => ({ i, p, err: problema(p) })).filter((x) => x.err);

  const agregarPegadas = () => {
    const nuevas = parsearPreguntasTexto(textoPegado);
    if (!nuevas.length) return toast.error("No encontramos preguntas en el texto.");
    const vacia = preguntas.length === 1 && !preguntas[0].texto.trim();
    const base = vacia ? [] : preguntas;
    const cupo = MAX_PREGUNTAS - base.length;
    if (cupo <= 0) return toast.error(`Máximo ${MAX_PREGUNTAS} preguntas por encuesta.`);
    const agregar = nuevas.slice(0, cupo).map((p) => nueva({ ...p, opciones: p.opciones.length ? p.opciones.slice(0, MAX_OPCIONES) : ["", ""], abierta: false }));
    setPreguntas([...base.map((p) => ({ ...p, abierta: false })), ...agregar]);
    setTextoPegado("");
    setPegarAbierto(false);
    toast.success(`${agregar.length} pregunta(s) agregada(s)${nuevas.length > cupo ? `; ${nuevas.length - cupo} no cupieron` : ""}.`);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (titulo.trim().length < 3) {
      toast.error("Escribe el título de la encuesta.");
      document.getElementById("titulo")?.focus();
      return;
    }
    if (incompletas.length) {
      setMostrarErrores(true);
      const primera = incompletas[0];
      upd(primera.p.key, { abierta: true });
      toast.error(`${incompletas.length} pregunta(s) incompleta(s). Revisa la pregunta ${primera.i + 1}: ${primera.err?.toLowerCase()}.`);
      setTimeout(() => document.getElementById(`pregunta-${primera.p.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      return;
    }
    start(async () => {
      const r = await crearEncuestaAction({
        titulo,
        descripcion,
        fin,
        anonima: String(anonima),
        audiencia: audiencia as "TODOS",
        torreId: audiencia === "TORRE" ? torreId : "",
        segmentoId: audiencia === "SEGMENTO" ? segmentoId : "",
        preguntas: preguntas.map((p) => ({ tipo: p.tipo, texto: p.texto, opciones: p.tipo === "UNICA" || p.tipo === "MULTIPLE" ? p.opciones.filter((o) => o.trim()) : [], requerida: p.requerida })),
      });
      if (r.ok) {
        try {
          localStorage.removeItem(BORRADOR);
        } catch {
          /* sin almacenamiento disponible */
        }
        toast.success("Encuesta publicada");
        router.push(`/encuestas/${r.data.id}`);
      } else toast.error(r.error);
    });
  };

  const descartar = () => {
    if (!confirm("¿Descartar todas las preguntas y empezar de nuevo?")) return;
    setTitulo("");
    setDescripcion("");
    setAnonima(false);
    setPreguntas([nueva()]);
    setMostrarErrores(false);
    try {
      localStorage.removeItem(BORRADOR);
    } catch {
      /* sin almacenamiento disponible */
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-5 pb-4" noValidate>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">
            Preguntas <span className="font-normal text-muted-foreground">({preguntas.length} de {MAX_PREGUNTAS})</span>
          </h2>
          <div className="flex flex-wrap gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setPegarAbierto(true)}>
              <ClipboardPaste /> Pegar varias
            </Button>
            {preguntas.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPreguntas((ps) => ps.map((p) => ({ ...p, abierta: !todasAbiertas })))}>
                {todasAbiertas ? <ChevronsDownUp /> : <ChevronsUpDown />} {todasAbiertas ? "Plegar todas" : "Desplegar todas"}
              </Button>
            )}
            {(preguntas.length > 1 || titulo) && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={descartar}>
                <Trash2 /> Descartar
              </Button>
            )}
          </div>
        </div>

        {preguntas.map((p, i) => {
          const err = problema(p);
          const marcar = mostrarErrores && !!err;
          return (
            <fieldset key={p.key} id={`pregunta-${p.key}`} className={cn("min-w-0 scroll-mt-20 rounded-xl border bg-card", marcar && "border-destructive ring-2 ring-destructive/20")}>
              <legend className="sr-only">Pregunta {i + 1}</legend>
              <div className="flex items-center gap-1 p-2 pl-3">
                <button
                  type="button"
                  onClick={() => upd(p.key, { abierta: !p.abierta })}
                  aria-expanded={p.abierta}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold", marcar ? "bg-destructive text-white" : "bg-primary/10 text-primary")}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", !p.texto && "text-muted-foreground")}>{p.texto || "Pregunta sin texto"}</span>
                    {!p.abierta && (
                      <span className={cn("block truncate text-xs", marcar ? "text-destructive" : "text-muted-foreground")}>
                        {marcar ? err : `${TIPO_LABEL[p.tipo]}${p.tipo === "UNICA" || p.tipo === "MULTIPLE" ? ` · ${p.opciones.filter((o) => o.trim()).length} opciones` : ""}${p.requerida ? "" : " · opcional"}`}
                      </span>
                    )}
                  </span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", p.abierta && "rotate-180")} />
                </button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Subir pregunta ${i + 1}`} onClick={() => mover(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Bajar pregunta ${i + 1}`} onClick={() => mover(i, 1)} disabled={i === preguntas.length - 1}>
                  <ArrowDown />
                </Button>
              </div>
              {p.abierta && (
                <div className="space-y-3 border-t p-3">
                  <Input data-texto value={p.texto} onChange={(e) => upd(p.key, { texto: e.target.value })} placeholder="Escribe la pregunta" aria-label={`Texto de la pregunta ${i + 1}`} aria-invalid={marcar && p.texto.trim().length < 3} />
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
                          <Input
                            value={o}
                            onChange={(e) => upd(p.key, { opciones: p.opciones.map((x, k) => (k === j ? e.target.value : x)) })}
                            onKeyDown={(e) => {
                              // Enter en la última opción agrega otra: rápido para listas largas.
                              if (e.key === "Enter") {
                                e.preventDefault();
                                if (j === p.opciones.length - 1 && o.trim() && p.opciones.length < MAX_OPCIONES) {
                                  upd(p.key, { opciones: [...p.opciones, ""] });
                                  setTimeout(() => (e.target as HTMLInputElement).closest("fieldset")?.querySelectorAll<HTMLInputElement>("input[data-opcion]")[j + 1]?.focus(), 0);
                                }
                              }
                            }}
                            data-opcion
                            placeholder={`Opción ${j + 1}`}
                            aria-label={`Opción ${j + 1}`}
                          />
                          {p.opciones.length > 2 && (
                            <Button type="button" variant="ghost" size="icon" aria-label="Quitar opción" onClick={() => upd(p.key, { opciones: p.opciones.filter((_, k) => k !== j) })}>
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => upd(p.key, { opciones: [...p.opciones, ""] })} disabled={p.opciones.length >= MAX_OPCIONES}>
                        <Plus /> Agregar opción
                      </Button>
                    </div>
                  )}
                  {marcar && (
                    <p className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="size-4" /> {err}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input type="checkbox" checked={p.requerida} onChange={(e) => upd(p.key, { requerida: e.target.checked })} className="size-4" /> Obligatoria
                    </label>
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => insertar(i, nueva())}>
                        <ListPlus /> Insertar debajo
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => insertar(i, nueva({ tipo: p.tipo, texto: p.texto ? `${p.texto} (copia)` : "", opciones: [...p.opciones], requerida: p.requerida }))}>
                        <Copy /> Duplicar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setPreguntas((ps) => ps.filter((x) => x.key !== p.key))}
                        disabled={preguntas.length === 1}
                      >
                        <Trash2 /> Eliminar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}
        <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => insertar(preguntas.length - 1, nueva())} disabled={preguntas.length >= MAX_PREGUNTAS}>
          <Plus /> Agregar pregunta
        </Button>
      </div>

      {/* Barra fija: con muchas preguntas siempre está a mano publicar y ver qué falta. */}
      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-1 flex items-center gap-3 rounded-xl border bg-background/95 p-2 pl-3 shadow-lg backdrop-blur lg:bottom-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{preguntas.length}</span> pregunta(s)
          {incompletas.length > 0 && <span className={cn("block", mostrarErrores && "text-destructive")}>{incompletas.length} incompleta(s)</span>}
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Publicar encuesta
        </Button>
      </div>

      <Dialog open={pegarAbierto} onOpenChange={setPegarAbierto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pegar varias preguntas</DialogTitle>
            <DialogDescription>
              Una pregunta por línea. Las opciones van debajo empezando con «-». Usa [varias] para opción múltiple, [escala] para 1 a 5 y (opcional) al final si no es obligatoria. Sin opciones queda como texto libre.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={textoPegado} onChange={(e) => setTextoPegado(e.target.value)} placeholder={EJEMPLO} className="h-64 max-h-[45dvh] min-h-40 overflow-y-auto font-mono text-sm [field-sizing:fixed]" aria-label="Preguntas en texto" />
          {textoPegado.trim() && <p className="text-xs text-muted-foreground">Se detectan {parsearPreguntasTexto(textoPegado).length} pregunta(s).</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setTextoPegado(EJEMPLO)}>
              Ver ejemplo
            </Button>
            <Button type="button" onClick={agregarPegadas} disabled={!textoPegado.trim()}>
              Agregar preguntas
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
