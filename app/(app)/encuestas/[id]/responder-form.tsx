"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { responderEncuestaAction } from "../actions";

type Pregunta = { id: string; tipo: "UNICA" | "MULTIPLE" | "ESCALA" | "TEXTO"; texto: string; opciones: string[]; requerida: boolean };

const CARAS = ["Muy mal", "Mal", "Regular", "Bien", "Muy bien"];

/** Responder en ≤ 3 toques: abrir, elegir y enviar. Opciones grandes para el dedo. */
export function ResponderForm({ encuestaId, preguntas }: { encuestaId: string; preguntas: Pregunta[] }) {
  const [r, setR] = useState<Record<string, string | string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const faltan = preguntas.filter((p) => p.requerida && (!r[p.id] || (Array.isArray(r[p.id]) && !(r[p.id] as string[]).length) || r[p.id] === ""));

  const opcionCls = (on: boolean) =>
    cn("flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-base transition-colors", on ? "border-primary bg-primary/10 ring-2 ring-primary/30 font-medium" : "hover:bg-muted");

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await responderEncuestaAction({ encuestaId, r });
          if (res.ok) {
            toast.success("¡Gracias por responder!");
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      {preguntas.map((p, i) => (
        <fieldset key={p.id} className="space-y-2">
          <legend className="mb-2 font-semibold">
            {preguntas.length > 1 ? `${i + 1}. ` : ""}
            {p.texto}
            {p.requerida && <span className="text-destructive"> *</span>}
            {p.tipo === "MULTIPLE" && <span className="block text-xs font-normal text-muted-foreground">Puedes elegir varias</span>}
          </legend>
          {p.tipo === "UNICA" &&
            p.opciones.map((o) => (
              <button key={o} type="button" role="radio" aria-checked={r[p.id] === o} className={opcionCls(r[p.id] === o)} onClick={() => setR((x) => ({ ...x, [p.id]: o }))}>
                <span className={cn("size-5 shrink-0 rounded-full border-2", r[p.id] === o ? "border-[6px] border-primary" : "border-muted-foreground/40")} />
                {o}
              </button>
            ))}
          {p.tipo === "MULTIPLE" &&
            p.opciones.map((o) => {
              const sel = ((r[p.id] as string[]) ?? []).includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  role="checkbox"
                  aria-checked={sel}
                  className={opcionCls(sel)}
                  onClick={() =>
                    setR((x) => {
                      const cur = (x[p.id] as string[]) ?? [];
                      return { ...x, [p.id]: sel ? cur.filter((c) => c !== o) : [...cur, o] };
                    })
                  }
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded border-2 text-xs", sel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>{sel ? "✓" : ""}</span>
                  {o}
                </button>
              );
            })}
          {p.tipo === "ESCALA" && (
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={p.texto}>
              {["1", "2", "3", "4", "5"].map((n, k) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={r[p.id] === n}
                  aria-label={`${n}: ${CARAS[k]}`}
                  onClick={() => setR((x) => ({ ...x, [p.id]: n }))}
                  className={cn("flex min-h-16 flex-col items-center justify-center rounded-xl border text-lg font-bold", r[p.id] === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {n}
                  <span className="text-[10px] font-normal leading-tight">{CARAS[k]}</span>
                </button>
              ))}
            </div>
          )}
          {p.tipo === "TEXTO" && <Textarea aria-label={p.texto} maxLength={1000} value={(r[p.id] as string) ?? ""} onChange={(e) => setR((x) => ({ ...x, [p.id]: e.target.value }))} placeholder="Escribe tu respuesta" />}
        </fieldset>
      ))}
      <Button type="submit" size="lg" className="w-full" disabled={pending || faltan.length > 0}>
        {pending ? <Loader2 className="animate-spin" /> : <Send />} Enviar respuesta
      </Button>
    </form>
  );
}
