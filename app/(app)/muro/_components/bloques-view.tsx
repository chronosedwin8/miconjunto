import Link from "next/link";
import { FileText, ListChecks } from "lucide-react";
import { bloquesParaMostrar, embedUrl } from "@/lib/muro/contenido";
import { cn } from "@/lib/utils";
import { PROSE } from "./prose";

/** Muestra los bloques de una publicación (HTML re-sanitizado al mostrar). */
export function BloquesView({ contenido, encuestas = {}, className }: { contenido: unknown; encuestas?: Record<string, string>; className?: string }) {
  const bloques = bloquesParaMostrar(contenido);
  return (
    <div className={cn("space-y-4", className)}>
      {bloques.map((b, i) => {
        switch (b.tipo) {
          case "texto":
            return <div key={i} className={cn("text-[15px] leading-relaxed", PROSE)} dangerouslySetInnerHTML={{ __html: b.html }} />;
          case "imagen":
            return (
              <figure key={i}>
                <img src={b.url} alt={b.alt ?? ""} loading="lazy" className="max-h-[70dvh] w-full rounded-xl object-cover" />
                {b.pie && <figcaption className="mt-1 text-xs text-muted-foreground">{b.pie}</figcaption>}
              </figure>
            );
          case "video":
            return (
              <div key={i} className="aspect-video overflow-hidden rounded-xl bg-black">
                <iframe
                  src={embedUrl(b)}
                  title="Video"
                  className="size-full"
                  loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                />
              </div>
            );
          case "adjunto":
            return (
              <a key={i} href={b.url} target="_blank" className="flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                <FileText className="size-4 shrink-0 text-primary" /> <span className="truncate">{b.nombre}</span>
              </a>
            );
          case "encuesta":
            return (
              <Link key={i} href={`/encuestas/${b.encuestaId}`} className="flex min-h-11 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
                <ListChecks className="size-4" /> {encuestas[b.encuestaId] ? `Responder: ${encuestas[b.encuestaId]}` : "Responder la encuesta"}
              </Link>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
