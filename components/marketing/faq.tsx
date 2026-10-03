import { ChevronDown } from "lucide-react";
import type { Pregunta } from "./contenido";

/** Preguntas frecuentes con <details> (accesible y sin JavaScript). */
export function Faq({ preguntas }: { preguntas: Pregunta[] }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {preguntas.map((q) => (
        <details key={q.p} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold">
            <h3 className="text-base">{q.p}</h3>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="pb-5 text-muted-foreground">{q.r}</p>
        </details>
      ))}
    </div>
  );
}

export function faqJsonLd(preguntas: Pregunta[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: preguntas.map((q) => ({ "@type": "Question", name: q.p, acceptedAnswer: { "@type": "Answer", text: q.r } })),
  };
}
