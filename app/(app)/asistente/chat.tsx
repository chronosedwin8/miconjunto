"use client";

import { useState, useTransition } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { preguntarAction } from "./actions";

const SUGERENCIAS = ["¿Hasta qué hora se puede hacer ruido?", "¿Puedo tener un perro en el apartamento?", "¿Cómo reservo el salón social?", "¿Qué pasa si pago tarde la administración?"];

export function Chat({ historial }: { historial: { pregunta: string; respuesta: string }[] }) {
  const [mensajes, setMensajes] = useState(historial);
  const [texto, setTexto] = useState("");
  const [pending, start] = useTransition();
  const enviar = (q: string) => {
    if (!q.trim()) return;
    setTexto("");
    setMensajes((m) => [...m, { pregunta: q, respuesta: "" }]);
    start(async () => {
      const r = await preguntarAction({ pregunta: q });
      setMensajes((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, respuesta: r.ok ? r.data.respuesta : `⚠️ ${r.error}` } : x)));
    });
  };
  return (
    <div className="flex flex-col gap-4">
      {mensajes.length === 0 && (
        <div className="rounded-xl border bg-card p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" /> Prueba con:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGERENCIAS.map((s) => (
              <button key={s} onClick={() => enviar(s)} className="rounded-full border px-3 py-2 text-sm hover:bg-muted">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {mensajes.map((m, i) => (
          <li key={i} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{m.pregunta}</p>
            <div className="w-fit max-w-[90%] whitespace-pre-line rounded-2xl rounded-bl-sm border bg-card px-3 py-2 text-sm">
              {m.respuesta || (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Consultando el reglamento…
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="sticky bottom-20 flex gap-2 rounded-xl border bg-background p-2 shadow-sm lg:bottom-4"
      >
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu pregunta…" aria-label="Pregunta" className="h-11 flex-1 bg-transparent px-2 outline-none" maxLength={1500} />
        <Button type="submit" size="icon" disabled={pending} aria-label="Enviar">
          {pending ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
    </div>
  );
}
